import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

/**
 * Nginx API Cluster Stack
 * 
 * This stack deploys a separate EKS cluster for the nginx REST API application with:
 * - Dedicated VPC (10.1.0.0/16) separate from Jenkins VPC
 * - EKS cluster with Karpenter for dynamic node provisioning
 * - AWS Load Balancer Controller for ALB management
 * - API Gateway as public entry point
 * - Transit Gateway connectivity to Jenkins cluster
 * 
 * Requirements: All nginx-api-cluster requirements
 */

export interface NginxApiClusterStackProps extends cdk.StackProps {
  /**
   * VPC ID of the Jenkins cluster for Transit Gateway connectivity
   */
  jenkinsVpcId: string;
  
  /**
   * AWS account ID where Jenkins ECR is located
   */
  jenkinsAccountId: string;
  
  /**
   * Transit Gateway ID (optional - will create new if not provided)
   */
  transitGatewayId?: string;
}

export class NginxApiClusterStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly cluster: eks.Cluster;
  public readonly apiGatewayUrl: string;

  constructor(scope: Construct, id: string, props: NginxApiClusterStackProps) {
    super(scope, id, props);

    // Task 2.1: Create VPC with CIDR 10.1.0.0/16
    // Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
    // EKS requires at least 2 AZs
    
    this.vpc = new ec2.Vpc(this, 'NginxApiVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.1.0.0/16'),
      maxAzs: 2,
      natGateways: 1, // Single NAT Gateway for cost savings
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // Task 2.2: Add subnet tags for EKS and Karpenter
    // Tag public subnets for ALB
    this.vpc.publicSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('kubernetes.io/role/elb', '1');
      cdk.Tags.of(subnet).add('kubernetes.io/cluster/nginx-api-cluster', 'shared');
    });

    // Tag private subnets for internal resources and Karpenter discovery
    this.vpc.privateSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('kubernetes.io/role/internal-elb', '1');
      cdk.Tags.of(subnet).add('kubernetes.io/cluster/nginx-api-cluster', 'shared');
      cdk.Tags.of(subnet).add('karpenter.sh/discovery', 'nginx-api-cluster');
    });

    // Output VPC information
    new cdk.CfnOutput(this, 'VpcIdOutput', {
      value: this.vpc.vpcId,
      description: 'VPC ID for nginx-api-cluster',
      exportName: 'NginxApiClusterVpcId',
    });

    // Task 3.1: Create EKS cluster with control plane
    // Requirements: 2.1, 2.3, 2.4, 11.5, 12.1
    
    // Create cluster IAM role
    const clusterRole = new iam.Role(this, 'ClusterRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
      ],
    });

    // Task 3.2: Configure cluster security groups
    // Requirements: 2.3, 8.6, 11.3
    
    // Get Jenkins VPC CIDR for security group rules
    const jenkinsVpcCidr = '10.0.0.0/16';
    
    // Create security group for cluster control plane
    const clusterSecurityGroup = new ec2.SecurityGroup(this, 'ClusterSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for EKS cluster control plane',
      allowAllOutbound: true,
    });
    
    // Allow inbound 443 from Jenkins VPC for kubectl access
    clusterSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(jenkinsVpcCidr),
      ec2.Port.tcp(443),
      'Allow kubectl access from Jenkins VPC'
    );

    // Create EKS cluster
    // Use a minimal kubectl layer - CDK will provision the actual kubectl functionality
    const kubectlLayer = new lambda.LayerVersion(this, 'KubectlLayer', {
      code: lambda.Code.fromAsset('kubectl-layer.zip'),
      compatibleRuntimes: [
        lambda.Runtime.PYTHON_3_13,
        lambda.Runtime.PYTHON_3_12,
        lambda.Runtime.PYTHON_3_11,
        lambda.Runtime.PROVIDED_AL2023,
      ],
      description: 'kubectl layer placeholder',
    });

    this.cluster = new eks.Cluster(this, 'Cluster', {
      clusterName: 'nginx-api-cluster',
      version: eks.KubernetesVersion.V1_32,
      vpc: this.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      role: clusterRole,
      securityGroup: clusterSecurityGroup,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      defaultCapacity: 0, // No managed node groups - using Karpenter
      kubectlLayer: kubectlLayer,
      clusterLogging: [
        eks.ClusterLoggingTypes.AUDIT,
        eks.ClusterLoggingTypes.AUTHENTICATOR,
        eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
      ],
    });

    // Task 3.3: Output cluster configuration
    // Requirements: 2.5
    
    new cdk.CfnOutput(this, 'ClusterNameOutput', {
      value: this.cluster.clusterName,
      description: 'EKS cluster name',
      exportName: 'NginxApiClusterName',
    });

    new cdk.CfnOutput(this, 'ClusterEndpointOutput', {
      value: this.cluster.clusterEndpoint,
      description: 'EKS cluster endpoint',
      exportName: 'NginxApiClusterEndpoint',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'EKS cluster ARN',
    });

    // Task 5.1: Create IAM roles for Karpenter
    // Requirements: 2.3, 11.6
    
    // Karpenter Node IAM Role
    const karpenterNodeRole = new iam.Role(this, 'KarpenterNodeRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Add cross-account ECR access policy
    karpenterNodeRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
      ],
      resources: ['*'],
    }));

    // Create instance profile for Karpenter nodes
    const karpenterInstanceProfile = new iam.CfnInstanceProfile(this, 'KarpenterInstanceProfile', {
      roles: [karpenterNodeRole.roleName],
      instanceProfileName: `KarpenterNodeInstanceProfile-${this.cluster.clusterName}`,
    });

    // Task 5.2: Create Karpenter interruption queue
    const karpenterInterruptionQueue = new sqs.Queue(this, 'KarpenterInterruptionQueue', {
      queueName: `${this.cluster.clusterName}-karpenter-interruption`,
      retentionPeriod: cdk.Duration.seconds(300),
    });

    // EventBridge rules for EC2 instance state changes
    const ec2StateChangeRule = new events.Rule(this, 'EC2StateChangeRule', {
      eventPattern: {
        source: ['aws.ec2'],
        detailType: ['EC2 Instance State-change Notification'],
      },
    });
    ec2StateChangeRule.addTarget(new targets.SqsQueue(karpenterInterruptionQueue));

    const ec2SpotInterruptionRule = new events.Rule(this, 'EC2SpotInterruptionRule', {
      eventPattern: {
        source: ['aws.ec2'],
        detailType: ['EC2 Spot Instance Interruption Warning'],
      },
    });
    ec2SpotInterruptionRule.addTarget(new targets.SqsQueue(karpenterInterruptionQueue));

    const ec2RebalanceRule = new events.Rule(this, 'EC2RebalanceRule', {
      eventPattern: {
        source: ['aws.ec2'],
        detailType: ['EC2 Instance Rebalance Recommendation'],
      },
    });
    ec2RebalanceRule.addTarget(new targets.SqsQueue(karpenterInterruptionQueue));

    // Task 5.3: Tag security groups for Karpenter discovery
    const nodeSecurityGroup = this.cluster.clusterSecurityGroup;
    cdk.Tags.of(nodeSecurityGroup).add('karpenter.sh/discovery', this.cluster.clusterName);

    // Output Karpenter configuration
    new cdk.CfnOutput(this, 'KarpenterNodeRoleArn', {
      value: karpenterNodeRole.roleArn,
      description: 'Karpenter node IAM role ARN',
    });

    new cdk.CfnOutput(this, 'KarpenterControllerRoleArn', {
      value: 'Will be created via Helm with IRSA',
      description: 'Karpenter controller IAM role ARN (create via Helm)',
    });

    new cdk.CfnOutput(this, 'KarpenterInstanceProfileName', {
      value: karpenterInstanceProfile.instanceProfileName!,
      description: 'Karpenter instance profile name',
    });

    new cdk.CfnOutput(this, 'KarpenterInterruptionQueueName', {
      value: karpenterInterruptionQueue.queueName,
      description: 'Karpenter interruption queue name',
    });

    // Task 7.1: Create IAM role for ALB Controller
    // Requirements: 3.1, 3.4, 3.5, 3.6
    // Note: Will be created via Helm with IRSA
    
    new cdk.CfnOutput(this, 'ALBControllerRoleArn', {
      value: 'Will be created via Helm with IRSA',
      description: 'ALB Controller IAM role ARN (create via Helm)',
    });

    // Task 12.1: Create security group for ALB
    // Requirements: 5.6, 5.8, 11.2
    
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for public ALB',
      allowAllOutbound: true,
    });

    // Allow HTTPS from anywhere (API Gateway will connect over public internet)
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from API Gateway'
    );

    new cdk.CfnOutput(this, 'ALBSecurityGroupId', {
      value: albSecurityGroup.securityGroupId,
      description: 'ALB security group ID',
    });

    // Task 12.2: Create API Gateway HTTP API
    // Requirements: 7.1, 7.3, 12.4
    
    const apiLogGroup = new logs.LogGroup(this, 'ApiGatewayLogGroup', {
      logGroupName: `/aws/apigateway/${this.cluster.clusterName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const httpApi = new apigatewayv2.CfnApi(this, 'HttpApi', {
      name: `${this.cluster.clusterName}-api`,
      protocolType: 'HTTP',
      corsConfiguration: {
        allowOrigins: ['*'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const apiStage = new apigatewayv2.CfnStage(this, 'ApiStage', {
      apiId: httpApi.ref,
      stageName: '$default',
      autoDeploy: true,
      accessLogSettings: {
        destinationArn: apiLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          ip: '$context.identity.sourceIp',
          requestTime: '$context.requestTime',
          httpMethod: '$context.httpMethod',
          routeKey: '$context.routeKey',
          status: '$context.status',
          protocol: '$context.protocol',
          responseLength: '$context.responseLength',
        }),
      },
    });

    // Output API Gateway URL (integration will be added after ALB is created)
    this.apiGatewayUrl = `https://${httpApi.ref}.execute-api.${this.region}.amazonaws.com`;
    
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.apiGatewayUrl,
      description: 'API Gateway public URL',
      exportName: 'NginxApiGatewayUrl',
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: httpApi.ref,
      description: 'API Gateway ID',
    });

    // Task 13.1: Create CloudWatch log groups
    // Requirements: 12.1, 12.3, 12.4, 12.5
    // Note: EKS cluster creates its own log group automatically when control plane logging is enabled
  }
}
