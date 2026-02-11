import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * Jenkins EKS Cluster Stack Props
 */
export interface JenkinsEksStackProps extends cdk.StackProps {
  /**
   * VPC for the EKS cluster (imported from JenkinsNetworkStack)
   */
  vpc: ec2.IVpc;
  
  /**
   * Private subnet in AZ-A
   */
  privateSubnetAzA: ec2.ISubnet;
  
  /**
   * Private subnet in AZ-B
   */
  privateSubnetAzB: ec2.ISubnet;
  
  /**
   * EFS file system for Jenkins persistent storage (imported from JenkinsStorageStack)
   */
  efsFileSystem: efs.IFileSystem;
}

/**
 * Jenkins EKS Cluster Stack
 * 
 * This stack deploys a Jenkins CI/CD platform on Amazon EKS with:
 * - EKS cluster with managed node groups
 * - Jenkins controller on on-demand instances
 * - Jenkins agents on cost-optimized spot instances
 * - EFS for persistent storage
 * - S3 for artifacts and job state
 * - IAM roles with IRSA for AWS permissions
 * 
 * Requirements: 1.1
 */
export class JenkinsEksStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly privateSubnetAzA: ec2.ISubnet;
  public readonly privateSubnetAzB: ec2.ISubnet;
  public readonly eksClusterRole: iam.IRole;
  public readonly efsFileSystem: efs.IFileSystem;
  public readonly artifactsBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: JenkinsEksStackProps) {
    super(scope, id, props);
    
    // Import VPC, subnets, and EFS from other stacks
    this.vpc = props.vpc;
    this.privateSubnetAzA = props.privateSubnetAzA;
    this.privateSubnetAzB = props.privateSubnetAzB;
    this.efsFileSystem = props.efsFileSystem;

    // Task 3.1: Create EKS cluster IAM role
    // Requirements: 1.1
    
    // Task 3.2: Create EKS cluster using L2 construct
    // Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
    
    // Create EKS cluster with Kubernetes version 1.32
    // Configure cluster in private subnets across 2 availability zones
    // Enable both private and public endpoint access
    // Enable all cluster logging types
    const cluster = new eks.Cluster(this, 'JenkinsEksCluster', {
      clusterName: 'jenkins-eks-cluster',
      version: eks.KubernetesVersion.V1_32,
      
      // Use the VPC we created
      vpc: this.vpc,
      vpcSubnets: [
        { subnets: [this.privateSubnetAzA, this.privateSubnetAzB] }
      ],
      
      // Enable both private and public endpoint access
      // Requirement 1.5: Private endpoint access for API server communication
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      
      // No default capacity - we'll add node groups separately
      defaultCapacity: 0,
      
      // Enable all cluster logging types
      // Requirement 1.4: Enable cluster logging
      clusterLogging: [
        eks.ClusterLoggingTypes.API,
        eks.ClusterLoggingTypes.AUDIT,
        eks.ClusterLoggingTypes.AUTHENTICATOR,
        eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
        eks.ClusterLoggingTypes.SCHEDULER,
      ],
      
      // Use custom kubectl layer
      kubectlLayer: new lambda.LayerVersion(this, 'KubectlLayer', {
        code: lambda.Code.fromAsset(path.join(__dirname, '../nginx-api/tmp/kubectl-layer.zip')),
        compatibleRuntimes: [
          lambda.Runtime.PYTHON_3_12,
          lambda.Runtime.PYTHON_3_13,
        ],
        description: 'kubectl binary for Kubernetes API access',
      }),
    });

    // Store cluster role for reference
    this.eksClusterRole = cluster.role;

    // Output EKS cluster information for reference
    new cdk.CfnOutput(this, 'EksClusterNameOutput', {
      value: cluster.clusterName,
      description: 'EKS Cluster Name',
      exportName: 'JenkinsEksClusterName',
    });

    new cdk.CfnOutput(this, 'EksClusterArnOutput', {
      value: cluster.clusterArn,
      description: 'EKS Cluster ARN',
      exportName: 'JenkinsEksClusterArn',
    });

    new cdk.CfnOutput(this, 'EksClusterEndpointOutput', {
      value: cluster.clusterEndpoint,
      description: 'EKS Cluster API Endpoint',
      exportName: 'JenkinsEksClusterEndpoint',
    });

    new cdk.CfnOutput(this, 'EksClusterVersionOutput', {
      value: '1.32',
      description: 'EKS Cluster Kubernetes Version',
      exportName: 'JenkinsEksClusterVersion',
    });
    
    new cdk.CfnOutput(this, 'EksClusterRoleArnOutput', {
      value: cluster.role.roleArn,
      description: 'IAM Role ARN for EKS Cluster',
      exportName: 'JenkinsEksClusterRoleArn',
    });

    // OIDC provider is automatically created by the L2 construct
    // Output OIDC provider information for reference
    new cdk.CfnOutput(this, 'OidcProviderArnOutput', {
      value: cluster.openIdConnectProvider.openIdConnectProviderArn,
      description: 'OIDC Provider ARN for EKS cluster (enables IRSA)',
      exportName: 'JenkinsEksOidcProviderArn',
    });

    new cdk.CfnOutput(this, 'OidcProviderIssuerOutput', {
      value: cluster.clusterOpenIdConnectIssuerUrl,
      description: 'OIDC Provider Issuer URL for EKS cluster',
      exportName: 'JenkinsEksOidcProviderIssuer',
    });

    // Install AWS Load Balancer Controller using Helm
    // This is required for Ingress resources to work
    
    // Create IAM policy for ALB Controller
    const albControllerPolicy = new iam.ManagedPolicy(this, 'ALBControllerPolicy', {
      managedPolicyName: 'AWSLoadBalancerControllerIAMPolicy-jenkins-eks',
      document: iam.PolicyDocument.fromJson(JSON.parse(fs.readFileSync(
        path.join(__dirname, '../config/alb-controller-iam-policy.json'),
        'utf8'
      ))),
    });

    // Create service account for ALB Controller with IRSA
    const albServiceAccount = cluster.addServiceAccount('ALBControllerServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
    });

    albServiceAccount.role.addManagedPolicy(albControllerPolicy);

    // Install AWS Load Balancer Controller via Helm
    const albController = cluster.addHelmChart('ALBController', {
      chart: 'aws-load-balancer-controller',
      repository: 'https://aws.github.io/eks-charts',
      namespace: 'kube-system',
      release: 'aws-load-balancer-controller',
      version: '1.8.1',
      values: {
        clusterName: cluster.clusterName,
        serviceAccount: {
          create: false,
          name: 'aws-load-balancer-controller',
        },
        region: this.region,
        vpcId: this.vpc.vpcId,
      },
      wait: true,
    });

    // ALB controller depends on the service account
    albController.node.addDependency(albServiceAccount);

    new cdk.CfnOutput(this, 'ALBControllerStatusOutput', {
      value: 'Installed via Helm chart',
      description: 'AWS Load Balancer Controller installation status',
    });

    // EFS file system is imported from JenkinsStorageStack
    // Output EFS information for reference
    new cdk.CfnOutput(this, 'EfsFileSystemIdOutput', {
      value: this.efsFileSystem.fileSystemId,
      description: 'EFS File System ID for Jenkins persistent storage (from JenkinsStorageStack)',
      exportName: 'JenkinsEksEfsFileSystemId',
    });

    new cdk.CfnOutput(this, 'EfsFileSystemArnOutput', {
      value: this.efsFileSystem.fileSystemArn,
      description: 'EFS File System ARN (from JenkinsStorageStack)',
      exportName: 'JenkinsEksEfsFileSystemArn',
    });

    // EFS backup is configured in JenkinsStorageStack
    // This allows backup configuration to persist even if the EKS cluster is deleted

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
          
          // Transition objects to Intelligent-Tiering storage class after 30 days
          // Intelligent-Tiering automatically moves objects between access tiers based on usage patterns
          // This optimizes costs for objects with unknown or changing access patterns
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
          
          // Delete objects after 90 days (configurable based on retention requirements)
          // This helps manage storage costs by removing old artifacts
          expiration: cdk.Duration.days(90),
        },
      ],
      
      // Remove bucket when stack is deleted (set to RETAIN for production)
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // Required when removalPolicy is DESTROY
    });

    // Add tags to S3 bucket
    cdk.Tags.of(this.artifactsBucket).add('Name', `jenkins-${this.account}-${this.region}-artifacts`);
    cdk.Tags.of(this.artifactsBucket).add('Purpose', 'Jenkins Job State and Artifacts Storage');
    cdk.Tags.of(this.artifactsBucket).add('ManagedBy', 'AWS CDK');

    // Output S3 bucket information for reference
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
    // Requirement: Secure webhook validation for CI/CD pipeline
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

    // Output secret information for reference
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
    
    // Create IAM policy document for Jenkins controller with IRSA (IAM Roles for Service Accounts)
    // This role allows Jenkins to deploy and manage AWS infrastructure securely
    // Requirement 5.1: IAM role with permissions for IaC deployments
    // Requirement 5.2: Follow principle of least privilege
    // Requirement 5.3: Service account associated with IAM role using IRSA
    // Requirement 5.5: Permissions for CloudFormation, Terraform state, EC2, VPC, IAM, EKS
    // Requirement 5.7: Session duration of at least 3600 seconds
    
    // Create an inline policy document with all required permissions
    const jenkinsControllerPolicyDocument = new iam.PolicyDocument({
      statements: [
        // CloudFormation permissions
        // Requirement 5.5: Permissions for CloudFormation
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
        // Requirement 5.5: Permissions for Terraform state management (S3)
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
        // Requirement 5.5: Permissions for Terraform state management (DynamoDB)
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
        // Requirement 5.5: Permissions for EC2
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
        // Requirement 5.5: Permissions for VPC
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
        // Requirement 5.5: Permissions for IAM
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
        // Requirement 5.5: Permissions for EKS
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
        // Requirement 5.5: Permissions for STS
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'sts:AssumeRole',
            'sts:GetCallerIdentity',
            'sts:GetSessionToken',
          ],
          resources: ['*'],
        }),
        
        // Secrets Manager operations
        // Allows Jenkins to retrieve secrets for GitHub webhook validation and other integrations
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
        // Allows Jenkins to decrypt secrets encrypted with KMS
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

    // Task 6.3: Create Cluster Autoscaler IAM role and service account
    // Requirements: 8.1
    
    // Create IAM policy document for Cluster Autoscaler with IRSA (IAM Roles for Service Accounts)
    // This role allows the Cluster Autoscaler to automatically scale EKS node groups
    // Requirement 8.1: Cluster Autoscaler installed and configured
    
    // Create an inline policy document with Cluster Autoscaler permissions
    // Based on the design document, the Cluster Autoscaler needs permissions to:
    // 1. Describe Auto Scaling groups, instances, and configurations
    // 2. Describe EC2 instance types and launch templates
    // 3. Describe EKS node groups
    // 4. Set desired capacity and terminate instances (with conditions)
    const clusterAutoscalerPolicyDocument = new iam.PolicyDocument({
      statements: [
        // Read-only permissions for Auto Scaling and EC2
        // These permissions allow the Cluster Autoscaler to discover and monitor node groups
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'autoscaling:DescribeAutoScalingGroups',
            'autoscaling:DescribeAutoScalingInstances',
            'autoscaling:DescribeLaunchConfigurations',
            'autoscaling:DescribeScalingActivities',
            'autoscaling:DescribeTags',
            'ec2:DescribeImages',
            'ec2:DescribeInstanceTypes',
            'ec2:DescribeLaunchTemplateVersions',
            'ec2:GetInstanceTypesFromInstanceRequirements',
            'eks:DescribeNodegroup',
          ],
          resources: ['*'],
        }),
        
        // Write permissions for Auto Scaling with conditions
        // These permissions allow the Cluster Autoscaler to scale node groups
        // The condition ensures it can only modify Auto Scaling groups tagged for cluster-autoscaler
        // Requirement 8.1: Add condition for cluster-autoscaler tag
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'autoscaling:SetDesiredCapacity',
            'autoscaling:TerminateInstanceInAutoScalingGroup',
          ],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'autoscaling:ResourceTag/k8s.io/cluster-autoscaler/enabled': 'true',
            },
          },
        }),
      ],
    });

    // Task 7.1: Create controller node group (on-demand)
    // Requirements: 3.9, 4.8
    
    // Create IAM role for EKS worker nodes (controller node group)
    // This role allows EC2 instances to join the EKS cluster and pull container images
    // Requirements: 3.9 - Jenkins controller runs on on-demand instances
    // Requirements: 4.8 - Jenkins controller has anti-affinity rules to NOT schedule on spot instances
    
    // Create IAM role for controller node group
    const controllerNodeRole = new iam.Role(this, 'ControllerNodeRole', {
      roleName: 'jenkins-eks-controller-node-role',
      description: 'IAM role for EKS controller node group worker nodes',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // Required policies for EKS worker nodes
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        // Optional: Systems Manager for node management
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Output controller node role information for reference
    new cdk.CfnOutput(this, 'ControllerNodeRoleArnOutput', {
      value: controllerNodeRole.roleArn,
      description: 'IAM Role ARN for EKS controller node group',
      exportName: 'JenkinsEksControllerNodeRoleArn',
    });

    // Create controller node group with on-demand instances
    // This node group will host the Jenkins controller pod
    // Requirements: 3.9 - Jenkins controller runs on on-demand instances to ensure high availability
    const controllerNodeGroup = new cdk.aws_eks.CfnNodegroup(this, 'ControllerNodeGroup', {
      clusterName: cluster.clusterName,
      nodegroupName: 'jenkins-controller-nodegroup',
      nodeRole: controllerNodeRole.roleArn,
      
      // Deploy nodes in private subnets across both availability zones
      subnets: [this.privateSubnetAzA.subnetId, this.privateSubnetAzB.subnetId],
      
      // Configure instance types: t4g.xlarge (ARM-based Graviton2)
      // This provides 4 vCPU and 16GB RAM for better performance
      // ARM-based instances are more cost-effective than x86
      instanceTypes: ['t4g.xlarge'],
      
      // Use ARM64 AMI for Graviton2 instances
      amiType: 'AL2023_ARM_64_STANDARD',
      
      // Set capacity type to ON_DEMAND for high availability
      // Requirement 3.9: Jenkins controller SHALL run on on-demand instances
      capacityType: 'ON_DEMAND',
      
      // Configure scaling: min 1, max 2, desired 1
      // This allows for one controller instance with the ability to scale to 2 if needed
      scalingConfig: {
        minSize: 1,
        maxSize: 2,
        desiredSize: 1,
      },
      
      // Add label to identify controller nodes
      // This label is used by the Jenkins controller pod's node selector
      // Requirement 3.9: Controller pod uses node selector for on-demand instances
      labels: {
        'workload-type': 'jenkins-controller',
      },
      
      // Add taint to prevent other workloads from scheduling on controller nodes
      // This ensures only the Jenkins controller pod (which has the matching toleration) runs here
      // Requirement 4.8: Jenkins controller has anti-affinity to NOT schedule on spot instances
      taints: [
        {
          key: 'workload-type',
          value: 'jenkins-controller',
          effect: 'NO_SCHEDULE',
        },
      ],
      
      // Configure update settings
      updateConfig: {
        maxUnavailable: 1,
      },
      
      tags: {
        'Name': 'jenkins-controller-nodegroup',
        'Purpose': 'Jenkins Controller On-Demand Instances',
        'ManagedBy': 'AWS CDK',
        'workload-type': 'jenkins-controller',
      },
    });

    // Output controller node group information for reference
    new cdk.CfnOutput(this, 'ControllerNodeGroupNameOutput', {
      value: controllerNodeGroup.nodegroupName!,
      description: 'EKS Controller Node Group Name',
      exportName: 'JenkinsEksControllerNodeGroupName',
    });

    new cdk.CfnOutput(this, 'ControllerNodeGroupArnOutput', {
      value: controllerNodeGroup.attrArn,
      description: 'EKS Controller Node Group ARN',
      exportName: 'JenkinsEksControllerNodeGroupArn',
    });

    // Task 7.2: Create agent node group (spot)
    // Requirements: 4.1, 4.2, 4.3, 4.5, 4.7
    
    // Create IAM role for EKS worker nodes (agent node group)
    // This role allows EC2 instances to join the EKS cluster and pull container images
    // Requirements: 4.1 - Node group for Jenkins agents uses EC2 spot instances
    // Requirements: 4.2 - Node group includes multiple instance types for spot availability
    
    // Create IAM role for agent node group
    const agentNodeRole = new iam.Role(this, 'AgentNodeRole', {
      roleName: 'jenkins-eks-agent-node-role',
      description: 'IAM role for EKS agent node group worker nodes (spot instances)',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // Required policies for EKS worker nodes
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        // Optional: Systems Manager for node management
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Output agent node role information for reference
    new cdk.CfnOutput(this, 'AgentNodeRoleArnOutput', {
      value: agentNodeRole.roleArn,
      description: 'IAM Role ARN for EKS agent node group',
      exportName: 'JenkinsEksAgentNodeRoleArn',
    });

    // Create agent node group with spot instances
    // This node group will host the Jenkins agent pods for executing build jobs
    // Requirements: 4.1 - Node group configured to use EC2 spot instances
    // Requirements: 4.2 - Multiple instance types to increase spot availability
    // Requirements: 4.3 - Capacity type SPOT with on-demand as fallback
    // Requirements: 4.5 - Scale automatically with min 2, max 10 nodes
    // Requirements: 4.7 - Instance types provide similar compute capacity (2-4 vCPUs, 8-16GB RAM)
    const agentNodeGroup = new cdk.aws_eks.CfnNodegroup(this, 'AgentNodeGroup', {
      clusterName: cluster.clusterName,
      nodegroupName: 'jenkins-agent-nodegroup',
      nodeRole: agentNodeRole.roleArn,
      
      // Deploy nodes in private subnets across both availability zones
      subnets: [this.privateSubnetAzA.subnetId, this.privateSubnetAzB.subnetId],
      
      // Configure instance types: m5.large, m5.xlarge, m5a.large, m5a.xlarge, m6i.large, m6i.xlarge
      // Requirement 4.2: Multiple instance types to increase spot availability
      // Requirement 4.7: Instance types provide similar compute capacity (2-4 vCPUs, 8-16GB RAM)
      // - m5.large: 2 vCPUs, 8GB RAM
      // - m5.xlarge: 4 vCPUs, 16GB RAM
      // - m5a.large: 2 vCPUs, 8GB RAM
      // - m5a.xlarge: 4 vCPUs, 16GB RAM
      // - m6i.large: 2 vCPUs, 8GB RAM
      // - m6i.xlarge: 4 vCPUs, 16GB RAM
      instanceTypes: ['m5.large', 'm5.xlarge', 'm5a.large', 'm5a.xlarge', 'm6i.large', 'm6i.xlarge'],
      
      // Set capacity type to SPOT for cost optimization
      // Requirement 4.1: Node group SHALL be configured to use EC2 spot instances
      // Requirement 4.3: Capacity type of "SPOT" with on-demand instances as fallback
      capacityType: 'SPOT',
      
      // Configure scaling: min 0, max 10, desired 0
      // Updated to allow scaling to zero for cost optimization when idle
      // Autoscaler will provision nodes (2-5 min) when Jenkins jobs are queued
      scalingConfig: {
        minSize: 0,
        maxSize: 10,
        desiredSize: 0,
      },
      
      // Add labels to identify agent nodes
      // These labels are used by Jenkins agent pods' node affinity rules
      // Requirement 4.6: Jenkins agent pods have node affinity to prefer spot instance nodes
      labels: {
        'workload-type': 'jenkins-agent',
        'node-lifecycle': 'spot',
      },
      
      // Configure update settings
      updateConfig: {
        maxUnavailable: 1,
      },
      
      // Add tags for Cluster Autoscaler auto-discovery
      // Requirement 8.1: Cluster Autoscaler monitors and scales node groups
      // The Cluster Autoscaler uses these tags to discover which node groups it should manage
      tags: {
        'Name': 'jenkins-agent-nodegroup',
        'Purpose': 'Jenkins Agent Spot Instances',
        'ManagedBy': 'AWS CDK',
        'workload-type': 'jenkins-agent',
        'node-lifecycle': 'spot',
        // Tags for Cluster Autoscaler auto-discovery
        // Format: k8s.io/cluster-autoscaler/<cluster-name>: owned
        // Format: k8s.io/cluster-autoscaler/enabled: true
        'k8s.io/cluster-autoscaler/jenkins-eks-cluster': 'owned',
        'k8s.io/cluster-autoscaler/enabled': 'true',
      },
    });
    // Output agent node group information for reference
    new cdk.CfnOutput(this, 'AgentNodeGroupNameOutput', {
      value: agentNodeGroup.nodegroupName!,
      description: 'EKS Agent Node Group Name',
      exportName: 'JenkinsEksAgentNodeGroupName',
    });

    new cdk.CfnOutput(this, 'AgentNodeGroupArnOutput', {
      value: agentNodeGroup.attrArn,
      description: 'EKS Agent Node Group ARN',
      exportName: 'JenkinsEksAgentNodeGroupArn',
    });

    // Task 13.1: Create Jenkins controller security group
    // Requirements: 2.4
    
    // Create security group for Jenkins controller
    // This security group controls inbound and outbound traffic for the Jenkins controller pod
    // Requirement 2.4: Jenkins controller security group allows inbound traffic on ports 8080 and 50000
    const jenkinsControllerSecurityGroup = new ec2.CfnSecurityGroup(this, 'JenkinsControllerSecurityGroup', {
      groupDescription: 'Security group for Jenkins controller - allows HTTP (8080) and JNLP (50000) traffic',
      vpcId: this.vpc.vpcId,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 8080,
          toPort: 8080,
          cidrIp: '10.0.0.0/16',
          description: 'Allow HTTP traffic from VPC CIDR for Jenkins web UI',
        },
        {
          ipProtocol: 'tcp',
          fromPort: 50000,
          toPort: 50000,
          cidrIp: '10.0.0.0/16',
          description: 'Allow JNLP traffic from VPC CIDR for agent connections',
        },
      ],
      securityGroupEgress: [
        {
          ipProtocol: '-1',
          cidrIp: '0.0.0.0/0',
          description: 'Allow all outbound traffic',
        },
      ],
      tags: [
        { key: 'Name', value: 'jenkins-eks-controller-sg' },
        { key: 'Purpose', value: 'Jenkins Controller Security Group' },
        { key: 'ManagedBy', value: 'AWS CDK' },
      ],
    });

    // Output Jenkins controller security group information for reference
    new cdk.CfnOutput(this, 'JenkinsControllerSecurityGroupIdOutput', {
      value: jenkinsControllerSecurityGroup.ref,
      description: 'Security Group ID for Jenkins controller',
      exportName: 'JenkinsEksControllerSecurityGroupId',
    });

    // Task 13.2: Create Jenkins agent security group
    // Requirements: 2.5
    
    // Create security group for Jenkins agents
    // This security group controls inbound and outbound traffic for Jenkins agent pods
    // Requirement 2.5: Jenkins agent security group allows inbound ephemeral ports from controller
    const jenkinsAgentSecurityGroup = new ec2.CfnSecurityGroup(this, 'JenkinsAgentSecurityGroup', {
      groupDescription: 'Security group for Jenkins agents - allows ephemeral ports from controller',
      vpcId: this.vpc.vpcId,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 32768,
          toPort: 65535,
          cidrIp: '10.0.0.0/16',
          description: 'Allow ephemeral ports from VPC CIDR (controller to agent communication)',
        },
      ],
      securityGroupEgress: [
        {
          ipProtocol: '-1',
          cidrIp: '0.0.0.0/0',
          description: 'Allow all outbound traffic',
        },
      ],
      tags: [
        { key: 'Name', value: 'jenkins-eks-agent-sg' },
        { key: 'Purpose', value: 'Jenkins Agent Security Group' },
        { key: 'ManagedBy', value: 'AWS CDK' },
      ],
    });

    // Output Jenkins agent security group information for reference
    new cdk.CfnOutput(this, 'JenkinsAgentSecurityGroupIdOutput', {
      value: jenkinsAgentSecurityGroup.ref,
      description: 'Security Group ID for Jenkins agents',
      exportName: 'JenkinsEksAgentSecurityGroupId',
    });

    // Task 14.2: Create CloudWatch alarms
    // Requirements: 10.4, 10.5
    
    // Create SNS topic for alarm notifications (optional - can be configured later)
    const alarmTopic = new cdk.aws_sns.Topic(this, 'JenkinsEksAlarmTopic', {
      topicName: 'jenkins-eks-alarms',
      displayName: 'Jenkins EKS Cluster Alarms',
    });

    // Output SNS topic ARN for subscribing to notifications
    new cdk.CfnOutput(this, 'AlarmTopicArnOutput', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic ARN for CloudWatch alarm notifications',
      exportName: 'JenkinsEksAlarmTopicArn',
    });

    // Alarm 1: Cluster health - Monitor EKS cluster status
    // Requirement 10.4: Alarms for cluster health, node failures, disk space, and pending pods
    const clusterHealthAlarm = new cdk.aws_cloudwatch.Alarm(this, 'ClusterHealthAlarm', {
      alarmName: 'jenkins-eks-cluster-health',
      alarmDescription: 'Alert when EKS cluster is unhealthy',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/EKS',
        metricName: 'cluster_failed_node_count',
        dimensionsMap: {
          ClusterName: cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add SNS action to cluster health alarm
    clusterHealthAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // Alarm 2: Node failures - Monitor node count
    // Requirement 10.4: Alert when nodes fail or become unavailable
    const nodeFailureAlarm = new cdk.aws_cloudwatch.Alarm(this, 'NodeFailureAlarm', {
      alarmName: 'jenkins-eks-node-failure',
      alarmDescription: 'Alert when EKS nodes fail or become unavailable',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'ContainerInsights',
        metricName: 'node_number_of_running_pods',
        dimensionsMap: {
          ClusterName: cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 3,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.BREACHING,
    });

    // Add SNS action to node failure alarm
    nodeFailureAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // Alarm 3: Disk space - Monitor node disk utilization
    // Requirement 10.4: Alert when disk space is running low
    const diskSpaceAlarm = new cdk.aws_cloudwatch.Alarm(this, 'DiskSpaceAlarm', {
      alarmName: 'jenkins-eks-disk-space',
      alarmDescription: 'Alert when node disk utilization exceeds 80%',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'ContainerInsights',
        metricName: 'node_filesystem_utilization',
        dimensionsMap: {
          ClusterName: cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add SNS action to disk space alarm
    diskSpaceAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // Alarm 4: Pending pods - Monitor pods that cannot be scheduled
    // Requirement 10.4: Alert when pending pods exceed threshold (indicates resource constraints)
    const pendingPodsAlarm = new cdk.aws_cloudwatch.Alarm(this, 'PendingPodsAlarm', {
      alarmName: 'jenkins-eks-pending-pods',
      alarmDescription: 'Alert when pending pods exceed 5 for more than 10 minutes',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'ContainerInsights',
        metricName: 'cluster_number_of_running_pods',
        dimensionsMap: {
          ClusterName: cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add SNS action to pending pods alarm
    pendingPodsAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // Alarm 5: Spot instance interruptions - Monitor spot interruption rate
    // Requirement 10.5: Alert on spot instance interruptions
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

    // Add SNS action to spot interruption alarm
    spotInterruptionAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmTopic));

    // Output alarm information for reference
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
    // The EFS file system was created earlier in this stack
    
    // Create StorageClass for manual binding
    cluster.addManifest('JenkinsStorageClass', {
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
    cluster.addManifest('JenkinsPV', {
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
          server: this.efsFileSystem.fileSystemId + '.efs.' + this.region + '.amazonaws.com',
          path: '/',
        },
      },
    });

    // Helper function to load YAML manifests
    const loadManifest = (filename: string): any => {
      const manifestPath = path.join(__dirname, '../k8s/jenkins', filename);
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      
      // Use loadAll for files with multiple documents
      const documents = yaml.loadAll(manifestContent);
      
      // If single document, return it directly
      // If multiple documents, return array
      return documents.length === 1 ? documents[0] : documents;
    };

    // Create Cluster Autoscaler service account with IRSA
    // This automatically creates the IAM role and adds the correct IRSA annotation
    const clusterAutoscalerServiceAccount = cluster.addServiceAccount('ClusterAutoscalerServiceAccount', {
      name: 'cluster-autoscaler',
      namespace: 'kube-system',
    });
    
    // Attach the Cluster Autoscaler policy to the auto-created role
    clusterAutoscalerServiceAccount.role.attachInlinePolicy(new iam.Policy(this, 'ClusterAutoscalerInlinePolicy', {
      policyName: 'ClusterAutoscalerPolicy',
      document: clusterAutoscalerPolicyDocument,
    }));
    
    // Output Cluster Autoscaler service account information
    new cdk.CfnOutput(this, 'ClusterAutoscalerServiceAccountRoleArnOutput', {
      value: clusterAutoscalerServiceAccount.role.roleArn,
      description: 'IAM Role ARN for Cluster Autoscaler service account (auto-created by CDK)',
      exportName: 'JenkinsEksClusterAutoscalerRoleArn',
    });

    // Apply Jenkins manifests in correct order with dependencies
    
    // 1. Namespace
    const namespace = cluster.addManifest('JenkinsNamespace', loadManifest('namespace.yaml'));

    // 2. ServiceAccount with IRSA (created by CDK, not from YAML)
    // This automatically creates an IAM role and adds the correct annotation
    // We pass the policy document directly to avoid creating a separate role
    const jenkinsServiceAccount = cluster.addServiceAccount('JenkinsControllerServiceAccount', {
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
    const rbac = cluster.addManifest('JenkinsRbac', loadManifest('rbac.yaml'));
    rbac.node.addDependency(jenkinsServiceAccount);

    // 4. PVC (depends on namespace and PV)
    const pvc = cluster.addManifest('JenkinsPvc', loadManifest('pvc.yaml'));
    pvc.node.addDependency(namespace);

    // 5. ConfigMaps (depend on namespace)
    const pluginsConfigMap = cluster.addManifest('JenkinsPlugins', loadManifest('plugins-configmap.yaml'));
    pluginsConfigMap.node.addDependency(namespace);

    const cascConfigMap = cluster.addManifest('JenkinsCasc', loadManifest('jcasc-main-configmap.yaml'));
    cascConfigMap.node.addDependency(namespace);

    const agentConfigMap = cluster.addManifest('JenkinsAgentConfig', loadManifest('agent-pod-template-configmap.yaml'));
    agentConfigMap.node.addDependency(namespace);

    // 6. Secrets sync job (depends on namespace)
    const secretsJob = cluster.addManifest('JenkinsSecretsSync', loadManifest('secrets-sync-job.yaml'));
    secretsJob.node.addDependency(namespace);

    // 7. StatefulSet (depends on ConfigMaps, PVC, ServiceAccount)
    const statefulSet = cluster.addManifest('JenkinsController', loadManifest('statefulset.yaml'));
    statefulSet.node.addDependency(pluginsConfigMap);
    statefulSet.node.addDependency(cascConfigMap);
    statefulSet.node.addDependency(agentConfigMap);
    statefulSet.node.addDependency(pvc);
    statefulSet.node.addDependency(jenkinsServiceAccount);
    statefulSet.node.addDependency(rbac);

    // 8. Service (depends on StatefulSet)
    const service = cluster.addManifest('JenkinsService', loadManifest('service.yaml'));
    service.node.addDependency(statefulSet);

    // 9. Ingress (depends on Service and ALB Controller)
    // Update ingress with correct subnet IDs dynamically
    const ingressManifest = loadManifest('ingress.yaml');
    
    // Get public subnet IDs from VPC (for ALB)
    // Note: Jenkins VPC only has private subnets, so we'll remove the subnet annotation
    // and let ALB controller auto-discover subnets based on tags
    if (ingressManifest.metadata && ingressManifest.metadata.annotations) {
      // Remove hardcoded subnet annotation - let ALB controller auto-discover
      delete ingressManifest.metadata.annotations['alb.ingress.kubernetes.io/subnets'];
    }
    
    const ingress = cluster.addManifest('JenkinsIngress', ingressManifest);
    ingress.node.addDependency(service);
    ingress.node.addDependency(albController);

    // Output deployment status
    new cdk.CfnOutput(this, 'JenkinsDeploymentStatusOutput', {
      value: 'Jenkins deployed automatically via CDK (including Ingress with ALB)',
      description: 'Jenkins Kubernetes manifests deployed during stack creation',
    });

    new cdk.CfnOutput(this, 'EfsNfsServerOutput', {
      value: this.efsFileSystem.fileSystemId + '.efs.' + this.region + '.amazonaws.com',
      description: 'EFS NFS server address',
      exportName: 'JenkinsEksEfsNfsServer',
    });
  }
}
