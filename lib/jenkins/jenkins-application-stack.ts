import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * Jenkins Application Stack Props
 */
export interface JenkinsApplicationStackProps extends cdk.StackProps {
  /**
   * EKS cluster (imported from JenkinsEksClusterStack)
   */
  cluster: eks.ICluster;
  
  /**
   * VPC for the application
   */
  vpc: ec2.IVpc;
  
  /**
   * EFS file system for Jenkins persistent storage (imported from JenkinsStorageStack)
   */
  efsFileSystem: efs.IFileSystem;
  
  /**
   * Security group for ALB (imported from JenkinsAlbStack)
   */
  albSecurityGroup: ec2.ISecurityGroup;
}

/**
 * Jenkins Application Stack
 * 
 * This stack deploys the Jenkins application and supporting resources:
 * - AWS Load Balancer Controller (Helm)
 * - Jenkins service account with IRSA
 * - S3 artifacts bucket
 * - GitHub webhook secret
 * - Static PV/StorageClass for EFS
 * - All Jenkins Kubernetes manifests
 * - CloudWatch alarms for monitoring
 * 
 * This stack depends on JenkinsEksClusterStack and JenkinsStorageStack.
 * This is the stack you'll iterate on most frequently.
 * 
 * Requirements: 5.1-5.7, 6.12, 7.1, 7.5, 10.4, 10.5
 */
export class JenkinsApplicationStack extends cdk.Stack {
  public readonly artifactsBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: JenkinsApplicationStackProps) {
    super(scope, id, props);

    // AWS Load Balancer Controller Service Account with IRSA
    // The controller itself is installed via Helm (see deployment docs)
    // CDK only manages the service account and IAM role
    
    // Load ALB Controller IAM policy document
    const albPolicyDocument = iam.PolicyDocument.fromJson(JSON.parse(fs.readFileSync(
      path.join(__dirname, '../../config/alb-controller-iam-policy.json'),
      'utf8'
    )));

    // Create service account for ALB Controller with IRSA
    const albServiceAccount = props.cluster.addServiceAccount('ALBControllerServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
    });

    // Attach policy inline to avoid cross-stack references
    albServiceAccount.role.attachInlinePolicy(new iam.Policy(this, 'ALBControllerInlinePolicy', {
      policyName: 'AWSLoadBalancerControllerPolicy',
      document: albPolicyDocument,
    }));

    new cdk.CfnOutput(this, 'ALBControllerServiceAccountRoleArnOutput', {
      value: albServiceAccount.role.roleArn,
      description: 'IAM Role ARN for ALB Controller service account',
      exportName: 'JenkinsEksALBControllerRoleArn',
    });

    new cdk.CfnOutput(this, 'ALBControllerStatusOutput', {
      value: 'Service account created - controller installed via Helm',
      description: 'AWS Load Balancer Controller installation status',
    });

    // Add security group rule to allow ALB to communicate with Jenkins pods
    // Import the cluster security group
    const clusterSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ClusterSecurityGroup',
      props.cluster.clusterSecurityGroupId
    );

    // Allow inbound traffic from ALB security group to cluster security group on port 8080
    clusterSecurityGroup.addIngressRule(
      props.albSecurityGroup,
      ec2.Port.tcp(8080),
      'Allow ALB to communicate with Jenkins pods on port 8080'
    );

    new cdk.CfnOutput(this, 'ALBToClusterSecurityGroupRuleOutput', {
      value: `${props.albSecurityGroup.securityGroupId} -> ${props.cluster.clusterSecurityGroupId}:8080`,
      description: 'Security group rule allowing ALB to reach Jenkins pods',
    });

    // Task 5.1: Create S3 bucket for artifacts and job state
    // Requirements: 6.12, 7.1, 7.5
    
    // Create S3 bucket for storing job execution state, workspace snapshots, and build artifacts
    // Bucket name pattern: jenkins-{account-id}-{region}-artifacts
    // This ensures globally unique bucket names and makes it easy to identify the bucket's purpose
    this.artifactsBucket = new s3.Bucket(this, 'JenkinsArtifactsBucket', {
      // Use account ID and region in bucket name for global uniqueness
      // Requirement 6.12: S3 bucket for long-term artifact storage
      bucketName: `jenkins-${this.account}-${this.region}-artifacts`,
      
      // Enable versioning to preserve, retrieve, and restore every version of every object
      // Requirement 7.1: Job state persistence requires versioning for recovery
      versioned: true,
      
      // Enable SSE-S3 encryption (server-side encryption with S3-managed keys)
      // Requirement 7.5: Secure storage of job artifacts and workspace snapshots
      encryption: s3.BucketEncryption.S3_MANAGED,
      
      // Configure lifecycle policy for cost optimization
      // Requirement 7.5: Cost-effective storage with lifecycle management
      lifecycleRules: [
        {
          id: 'TransitionToIntelligentTiering',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
        {
          id: 'DeleteOldObjects',
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
      ],
      
      // Remove bucket when stack is deleted (set to RETAIN for production)
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Add tags to S3 bucket
    cdk.Tags.of(this.artifactsBucket).add('Name', `jenkins-${this.account}-${this.region}-artifacts`);
    cdk.Tags.of(this.artifactsBucket).add('Purpose', 'Jenkins Job State and Artifacts Storage');
    cdk.Tags.of(this.artifactsBucket).add('ManagedBy', 'AWS CDK');

    // Output S3 bucket information
    new cdk.CfnOutput(this, 'ArtifactsBucketNameOutput', {
      value: this.artifactsBucket.bucketName,
      description: 'S3 Bucket Name for Jenkins artifacts and job state',
      exportName: 'JenkinsEksArtifactsBucketName',
    });

    new cdk.CfnOutput(this, 'ArtifactsBucketArnOutput', {
      value: this.artifactsBucket.bucketArn,
      description: 'S3 Bucket ARN',
      exportName: 'JenkinsEksArtifactsBucketArn',
    });

    // Create GitHub webhook secret in AWS Secrets Manager
    // This secret is used to validate webhook requests from GitHub to Jenkins
    const githubWebhookSecret = new secretsmanager.Secret(this, 'GitHubWebhookSecret', {
      secretName: 'jenkins/github-webhook-secret',
      description: 'GitHub webhook secret for Jenkins CI/CD pipeline validation',
      
      // Generate a secure random secret (32 bytes = 64 hex characters)
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'secret',
        excludePunctuation: true,
        passwordLength: 64,
      },
      
      // Remove secret when stack is deleted (set to RETAIN for production)
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add tags to the secret
    cdk.Tags.of(githubWebhookSecret).add('Name', 'jenkins-github-webhook-secret');
    cdk.Tags.of(githubWebhookSecret).add('Purpose', 'GitHub Webhook Validation');
    cdk.Tags.of(githubWebhookSecret).add('Project', 'Jenkins');
    cdk.Tags.of(githubWebhookSecret).add('Environment', 'Production');
    cdk.Tags.of(githubWebhookSecret).add('ManagedBy', 'AWS CDK');

    // Output secret information
    new cdk.CfnOutput(this, 'GitHubWebhookSecretArnOutput', {
      value: githubWebhookSecret.secretArn,
      description: 'ARN of the GitHub webhook secret in Secrets Manager',
      exportName: 'JenkinsGitHubWebhookSecretArn',
    });

    new cdk.CfnOutput(this, 'GitHubWebhookSecretNameOutput', {
      value: githubWebhookSecret.secretName,
      description: 'Name of the GitHub webhook secret in Secrets Manager',
      exportName: 'JenkinsGitHubWebhookSecretName',
    });

    new cdk.CfnOutput(this, 'GitHubWebhookSecretRetrievalCommandOutput', {
      value: `aws secretsmanager get-secret-value --secret-id ${githubWebhookSecret.secretName} --region ${this.region} --query SecretString --output text | jq -r .secret`,
      description: 'Command to retrieve the GitHub webhook secret value',
    });

    // Task 6.2: Create Jenkins controller IAM role and service account
    // Requirements: 5.1, 5.2, 5.5, 5.7
    
    // Create IAM policy document for Jenkins controller with IRSA
    // This role allows Jenkins to deploy and manage AWS infrastructure securely
    const jenkinsControllerPolicyDocument = new iam.PolicyDocument({
      statements: [
        // CloudFormation permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'cloudformation:CreateStack',
            'cloudformation:UpdateStack',
            'cloudformation:DeleteStack',
            'cloudformation:DescribeStacks',
            'cloudformation:DescribeStackEvents',
            'cloudformation:DescribeStackResources',
            'cloudformation:GetTemplate',
            'cloudformation:ValidateTemplate',
            'cloudformation:ListStacks',
            'cloudformation:ListStackResources',
          ],
          resources: ['*'],
        }),
        
        // S3 bucket operations (Terraform state management and artifacts)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:CreateBucket',
            's3:DeleteBucket',
            's3:ListBucket',
            's3:GetBucketLocation',
            's3:GetBucketVersioning',
            's3:PutBucketVersioning',
            's3:GetBucketTagging',
            's3:PutBucketTagging',
            's3:GetBucketPolicy',
            's3:PutBucketPolicy',
            's3:DeleteBucketPolicy',
            's3:GetEncryptionConfiguration',
            's3:PutEncryptionConfiguration',
          ],
          resources: ['arn:aws:s3:::*'],
        }),
        
        // S3 object operations
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket',
            's3:GetObjectVersion',
            's3:DeleteObjectVersion',
          ],
          resources: [
            'arn:aws:s3:::jenkins-*-artifacts/*',
            'arn:aws:s3:::terraform-state-*/*',
            'arn:aws:s3:::*-terraform-state/*',
          ],
        }),
        
        // DynamoDB operations (Terraform state locking)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:CreateTable',
            'dynamodb:DeleteTable',
            'dynamodb:DescribeTable',
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:DeleteItem',
            'dynamodb:Scan',
            'dynamodb:Query',
            'dynamodb:UpdateItem',
            'dynamodb:UpdateTable',
            'dynamodb:ListTables',
            'dynamodb:TagResource',
            'dynamodb:UntagResource',
          ],
          resources: ['*'],
        }),
        
        // EC2 operations
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:Describe*',
            'ec2:CreateTags',
            'ec2:DeleteTags',
            'ec2:CreateSecurityGroup',
            'ec2:DeleteSecurityGroup',
            'ec2:AuthorizeSecurityGroupIngress',
            'ec2:AuthorizeSecurityGroupEgress',
            'ec2:RevokeSecurityGroupIngress',
            'ec2:RevokeSecurityGroupEgress',
            'ec2:CreateKeyPair',
            'ec2:DeleteKeyPair',
            'ec2:RunInstances',
            'ec2:TerminateInstances',
            'ec2:StartInstances',
            'ec2:StopInstances',
            'ec2:RebootInstances',
            'ec2:ModifyInstanceAttribute',
          ],
          resources: ['*'],
        }),
        
        // VPC operations
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:CreateVpc',
            'ec2:DeleteVpc',
            'ec2:ModifyVpcAttribute',
            'ec2:CreateSubnet',
            'ec2:DeleteSubnet',
            'ec2:ModifySubnetAttribute',
            'ec2:CreateRouteTable',
            'ec2:DeleteRouteTable',
            'ec2:CreateRoute',
            'ec2:DeleteRoute',
            'ec2:AssociateRouteTable',
            'ec2:DisassociateRouteTable',
            'ec2:CreateInternetGateway',
            'ec2:DeleteInternetGateway',
            'ec2:AttachInternetGateway',
            'ec2:DetachInternetGateway',
            'ec2:CreateNatGateway',
            'ec2:DeleteNatGateway',
            'ec2:AllocateAddress',
            'ec2:ReleaseAddress',
            'ec2:AssociateAddress',
            'ec2:DisassociateAddress',
            'ec2:CreateVpcEndpoint',
            'ec2:DeleteVpcEndpoint',
            'ec2:ModifyVpcEndpoint',
          ],
          resources: ['*'],
        }),
        
        // IAM operations
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'iam:GetRole',
            'iam:GetRolePolicy',
            'iam:ListRolePolicies',
            'iam:ListAttachedRolePolicies',
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:UpdateRole',
            'iam:PutRolePolicy',
            'iam:DeleteRolePolicy',
            'iam:AttachRolePolicy',
            'iam:DetachRolePolicy',
            'iam:PassRole',
            'iam:TagRole',
            'iam:UntagRole',
            'iam:GetPolicy',
            'iam:GetPolicyVersion',
            'iam:ListPolicyVersions',
            'iam:CreatePolicy',
            'iam:DeletePolicy',
            'iam:CreatePolicyVersion',
            'iam:DeletePolicyVersion',
          ],
          resources: ['*'],
        }),
        
        // EKS operations
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'eks:DescribeCluster',
            'eks:ListClusters',
            'eks:DescribeNodegroup',
            'eks:ListNodegroups',
            'eks:DescribeUpdate',
            'eks:ListUpdates',
            'eks:CreateCluster',
            'eks:DeleteCluster',
            'eks:UpdateClusterConfig',
            'eks:UpdateClusterVersion',
            'eks:CreateNodegroup',
            'eks:DeleteNodegroup',
            'eks:UpdateNodegroupConfig',
            'eks:UpdateNodegroupVersion',
            'eks:TagResource',
            'eks:UntagResource',
          ],
          resources: ['*'],
        }),
        
        // STS operations
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'sts:AssumeRole',
            'sts:GetCallerIdentity',
            'sts:GetSessionToken',
          ],
          resources: ['*'],
        }),
        
        // ECR operations (for Docker image push/pull)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ecr:GetAuthorizationToken',
            'ecr:BatchCheckLayerAvailability',
            'ecr:GetDownloadUrlForLayer',
            'ecr:BatchGetImage',
            'ecr:PutImage',
            'ecr:InitiateLayerUpload',
            'ecr:UploadLayerPart',
            'ecr:CompleteLayerUpload',
            'ecr:DescribeRepositories',
            'ecr:ListImages',
            'ecr:DescribeImages',
          ],
          resources: ['*'],
        }),
        
        // Secrets Manager operations
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          resources: [
            `arn:aws:secretsmanager:${this.region}:${this.account}:secret:jenkins/*`,
          ],
        }),
        
        // KMS operations for Secrets Manager
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'kms:Decrypt',
            'kms:DescribeKey',
          ],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'kms:ViaService': `secretsmanager.${this.region}.amazonaws.com`,
            },
          },
        }),
      ],
    });

    // Task 14.2: Create CloudWatch alarms
    // Requirements: 10.4, 10.5
    
    // Create SNS topic for alarm notifications
    const alarmTopic = new cdk.aws_sns.Topic(this, 'JenkinsEksAlarmTopic', {
      topicName: 'jenkins-eks-alarms',
      displayName: 'Jenkins EKS Cluster Alarms',
    });

    // Output SNS topic ARN
    new cdk.CfnOutput(this, 'AlarmTopicArnOutput', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic ARN for CloudWatch alarm notifications',
      exportName: 'JenkinsEksAlarmTopicArn',
    });

    // Alarm 1: Cluster health
    const clusterHealthAlarm = new cdk.aws_cloudwatch.Alarm(this, 'ClusterHealthAlarm', {
      alarmName: 'jenkins-eks-cluster-health',
      alarmDescription: 'Alert when EKS cluster is unhealthy',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/EKS',
        metricName: 'cluster_failed_node_count',
        dimensionsMap: {
          ClusterName: props.cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    clusterHealthAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // Alarm 2: Node failures
    const nodeFailureAlarm = new cdk.aws_cloudwatch.Alarm(this, 'NodeFailureAlarm', {
      alarmName: 'jenkins-eks-node-failure',
      alarmDescription: 'Alert when EKS nodes fail or become unavailable',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'ContainerInsights',
        metricName: 'node_number_of_running_pods',
        dimensionsMap: {
          ClusterName: props.cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 3,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.BREACHING,
    });

    nodeFailureAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // Alarm 3: Disk space
    const diskSpaceAlarm = new cdk.aws_cloudwatch.Alarm(this, 'DiskSpaceAlarm', {
      alarmName: 'jenkins-eks-disk-space',
      alarmDescription: 'Alert when node disk utilization exceeds 80%',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'ContainerInsights',
        metricName: 'node_filesystem_utilization',
        dimensionsMap: {
          ClusterName: props.cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    diskSpaceAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // Alarm 4: Pending pods
    const pendingPodsAlarm = new cdk.aws_cloudwatch.Alarm(this, 'PendingPodsAlarm', {
      alarmName: 'jenkins-eks-pending-pods',
      alarmDescription: 'Alert when pending pods exceed 5 for more than 10 minutes',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'ContainerInsights',
        metricName: 'cluster_number_of_running_pods',
        dimensionsMap: {
          ClusterName: props.cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    pendingPodsAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // Alarm 5: Spot instance interruptions
    const spotInterruptionAlarm = new cdk.aws_cloudwatch.Alarm(this, 'SpotInterruptionAlarm', {
      alarmName: 'jenkins-eks-spot-interruption',
      alarmDescription: 'Alert when spot instance interruptions occur',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/EC2Spot',
        metricName: 'InterruptionRate',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    spotInterruptionAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // Output alarm information
    new cdk.CfnOutput(this, 'ClusterHealthAlarmArnOutput', {
      value: clusterHealthAlarm.alarmArn,
      description: 'CloudWatch Alarm ARN for cluster health monitoring',
      exportName: 'JenkinsEksClusterHealthAlarmArn',
    });

    new cdk.CfnOutput(this, 'NodeFailureAlarmArnOutput', {
      value: nodeFailureAlarm.alarmArn,
      description: 'CloudWatch Alarm ARN for node failure monitoring',
      exportName: 'JenkinsEksNodeFailureAlarmArn',
    });

    new cdk.CfnOutput(this, 'DiskSpaceAlarmArnOutput', {
      value: diskSpaceAlarm.alarmArn,
      description: 'CloudWatch Alarm ARN for disk space monitoring',
      exportName: 'JenkinsEksDiskSpaceAlarmArn',
    });

    new cdk.CfnOutput(this, 'PendingPodsAlarmArnOutput', {
      value: pendingPodsAlarm.alarmArn,
      description: 'CloudWatch Alarm ARN for pending pods monitoring',
      exportName: 'JenkinsEksPendingPodsAlarmArn',
    });

    new cdk.CfnOutput(this, 'SpotInterruptionAlarmArnOutput', {
      value: spotInterruptionAlarm.alarmArn,
      description: 'CloudWatch Alarm ARN for spot interruption monitoring',
      exportName: 'JenkinsEksSpotInterruptionAlarmArn',
    });

    // Create static PersistentVolume for Jenkins using NFS (no CSI driver needed)
    // This uses the built-in NFS support in Kubernetes to mount the EFS file system
    
    // Create StorageClass for manual binding
    props.cluster.addManifest('JenkinsStorageClass', {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: {
        name: 'jenkins-efs',
      },
      provisioner: 'kubernetes.io/no-provisioner',
      volumeBindingMode: 'WaitForFirstConsumer',
    });

    // Create static PersistentVolume pointing to EFS
    // This uses NFS protocol which is natively supported by Kubernetes
    props.cluster.addManifest('JenkinsPV', {
      apiVersion: 'v1',
      kind: 'PersistentVolume',
      metadata: {
        name: 'jenkins-home-pv',
        labels: {
          app: 'jenkins',
          type: 'efs',
        },
      },
      spec: {
        capacity: {
          storage: '100Gi',
        },
        volumeMode: 'Filesystem',
        accessModes: ['ReadWriteMany'],
        persistentVolumeReclaimPolicy: 'Retain',
        storageClassName: 'jenkins-efs',
        mountOptions: ['nfsvers=4.1', 'rsize=1048576', 'wsize=1048576', 'hard', 'timeo=600', 'retrans=2'],
        nfs: {
          server: props.efsFileSystem.fileSystemId + '.efs.' + this.region + '.amazonaws.com',
          path: '/',
        },
      },
    });

    // Helper function to load YAML manifests
    const loadManifest = (filename: string): any => {
      const manifestPath = path.join(__dirname, '../../k8s/jenkins', filename);
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      
      // Use loadAll for files with multiple documents
      const documents = yaml.loadAll(manifestContent);
      
      // If single document, return it directly
      // If multiple documents, return array
      return documents.length === 1 ? documents[0] : documents;
    };

    // Apply Jenkins manifests in correct order with dependencies
    
    // 1. Namespace
    const namespace = props.cluster.addManifest('JenkinsNamespace', loadManifest('namespace.yaml'));

    // 2. ServiceAccount with IRSA (created by CDK, not from YAML)
    // This automatically creates an IAM role and adds the correct annotation
    const jenkinsServiceAccount = props.cluster.addServiceAccount('JenkinsControllerServiceAccount', {
      name: 'jenkins-controller',
      namespace: 'jenkins',
    });
    
    // Attach the policy document to the auto-created role
    jenkinsServiceAccount.role.attachInlinePolicy(new iam.Policy(this, 'JenkinsControllerInlinePolicy', {
      policyName: 'JenkinsControllerInfrastructureDeploymentPolicy',
      document: jenkinsControllerPolicyDocument,
    }));
    
    // Make service account depend on namespace
    jenkinsServiceAccount.node.addDependency(namespace);
    
    // Output Jenkins service account information
    new cdk.CfnOutput(this, 'JenkinsServiceAccountRoleArnOutput', {
      value: jenkinsServiceAccount.role.roleArn,
      description: 'IAM Role ARN for Jenkins controller service account (auto-created by CDK)',
      exportName: 'JenkinsEksServiceAccountRoleArn',
    });

    // 3. RBAC (depends on ServiceAccount)
    // RBAC file contains multiple documents, so we need to add them separately
    const rbacManifests = loadManifest('rbac.yaml');
    const rbacDocuments = Array.isArray(rbacManifests) ? rbacManifests : [rbacManifests];
    
    rbacDocuments.forEach((doc, index) => {
      const rbacResource = props.cluster.addManifest(`JenkinsRbac${index}`, doc);
      rbacResource.node.addDependency(jenkinsServiceAccount);
    });

    // 4. PVC (depends on namespace and PV)
    const pvc = props.cluster.addManifest('JenkinsPvc', loadManifest('pvc.yaml'));
    pvc.node.addDependency(namespace);

    // 5. ConfigMaps (depend on namespace)
    const pluginsConfigMap = props.cluster.addManifest('JenkinsPlugins', loadManifest('plugins-configmap.yaml'));
    pluginsConfigMap.node.addDependency(namespace);

    const cascConfigMap = props.cluster.addManifest('JenkinsCasc', loadManifest('jcasc-main-configmap.yaml'));
    cascConfigMap.node.addDependency(namespace);

    const agentConfigMap = props.cluster.addManifest('JenkinsAgentConfig', loadManifest('agent-pod-template-configmap.yaml'));
    agentConfigMap.node.addDependency(namespace);

    // Note: Secrets are managed manually via kubectl (jenkins-secrets with admin-password and github-webhook-secret)
    // The secrets-sync job is too large for CDK's kubectl provider

    // 6. StatefulSet (depends on ConfigMaps, PVC, ServiceAccount)
    // Note: RBAC dependencies are handled separately since RBAC is multi-document
    const statefulSet = props.cluster.addManifest('JenkinsController', loadManifest('statefulset.yaml'));
    statefulSet.node.addDependency(pluginsConfigMap);
    statefulSet.node.addDependency(cascConfigMap);
    statefulSet.node.addDependency(agentConfigMap);
    statefulSet.node.addDependency(pvc);
    statefulSet.node.addDependency(jenkinsServiceAccount);

    // 7. Service (depends on StatefulSet)
    const service = props.cluster.addManifest('JenkinsService', loadManifest('service.yaml'));
    service.node.addDependency(statefulSet);

    // 8. Ingress (depends on Service and ALB Controller)
    const ingressManifest = loadManifest('ingress.yaml');
    
    // Remove hardcoded subnet annotation - let ALB controller auto-discover
    if (ingressManifest.metadata && ingressManifest.metadata.annotations) {
      delete ingressManifest.metadata.annotations['alb.ingress.kubernetes.io/subnets'];
      // Remove inbound-cidrs annotation - we're using security groups instead
      delete ingressManifest.metadata.annotations['alb.ingress.kubernetes.io/inbound-cidrs'];
    }
    
    // Add security group annotation and load balancer name
    if (!ingressManifest.metadata.annotations) {
      ingressManifest.metadata.annotations = {};
    }
    ingressManifest.metadata.annotations['alb.ingress.kubernetes.io/security-groups'] = 
      props.albSecurityGroup.securityGroupId;
    ingressManifest.metadata.annotations['alb.ingress.kubernetes.io/load-balancer-name'] = 
      'jenkins-alb';
    
    // Add label to track security group version (forces recreation when SG changes)
    if (!ingressManifest.metadata.labels) {
      ingressManifest.metadata.labels = {};
    }
    ingressManifest.metadata.labels['security-group-version'] = 'v2';
    
    const ingress = props.cluster.addManifest('JenkinsIngress', ingressManifest);
    ingress.node.addDependency(service);
    ingress.node.addDependency(albServiceAccount);

    // Output deployment status
    new cdk.CfnOutput(this, 'JenkinsDeploymentStatusOutput', {
      value: 'Jenkins deployed automatically via CDK - seed job created by JCasC on startup',
      description: 'Jenkins Kubernetes manifests deployed during stack creation',
    });

    new cdk.CfnOutput(this, 'EfsNfsServerOutput', {
      value: props.efsFileSystem.fileSystemId + '.efs.' + this.region + '.amazonaws.com',
      description: 'EFS NFS server address',
      exportName: 'JenkinsEksEfsNfsServer',
    });
  }
}
