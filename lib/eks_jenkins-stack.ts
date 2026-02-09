import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

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

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Task 2.1: Create VPC with CIDR 10.0.0.0/16
    // Requirements: 2.1, 2.2
    
    // Create VPC with specific CIDR block
    const vpcResource = new ec2.CfnVPC(this, 'JenkinsVpc', {
      cidrBlock: '10.0.0.0/16',
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: [
        { key: 'Name', value: 'jenkins-eks-vpc' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster' },
      ],
    });

    // Create private subnet in AZ-A (us-west-2a) with CIDR 10.0.1.0/24
    const privateSubnetAzACfn = new ec2.CfnSubnet(this, 'PrivateSubnetAzA', {
      vpcId: vpcResource.ref,
      cidrBlock: '10.0.1.0/24',
      availabilityZone: 'us-west-2a',
      mapPublicIpOnLaunch: false,
      tags: [
        { key: 'Name', value: 'jenkins-eks-private-subnet-az-a' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster' },
        { key: 'aws-cdk:subnet-type', value: 'Private' },
      ],
    });

    // Create route table for private subnet
    const privateRouteTableAzA = new ec2.CfnRouteTable(this, 'PrivateRouteTableAzA', {
      vpcId: vpcResource.ref,
      tags: [
        { key: 'Name', value: 'jenkins-eks-private-rt-az-a' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster' },
      ],
    });

    // Associate route table with subnet
    new ec2.CfnSubnetRouteTableAssociation(this, 'PrivateSubnetAzARouteTableAssociation', {
      subnetId: privateSubnetAzACfn.ref,
      routeTableId: privateRouteTableAzA.ref,
    });

    // Create private subnet in AZ-B (us-west-2b) with CIDR 10.0.2.0/24
    const privateSubnetAzBCfn = new ec2.CfnSubnet(this, 'PrivateSubnetAzB', {
      vpcId: vpcResource.ref,
      cidrBlock: '10.0.2.0/24',
      availabilityZone: 'us-west-2b',
      mapPublicIpOnLaunch: false,
      tags: [
        { key: 'Name', value: 'jenkins-eks-private-subnet-az-b' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster' },
        { key: 'aws-cdk:subnet-type', value: 'Private' },
      ],
    });

    // Create route table for private subnet AZ-B
    const privateRouteTableAzB = new ec2.CfnRouteTable(this, 'PrivateRouteTableAzB', {
      vpcId: vpcResource.ref,
      tags: [
        { key: 'Name', value: 'jenkins-eks-private-rt-az-b' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster' },
      ],
    });

    // Associate route table with subnet AZ-B
    new ec2.CfnSubnetRouteTableAssociation(this, 'PrivateSubnetAzBRouteTableAssociation', {
      subnetId: privateSubnetAzBCfn.ref,
      routeTableId: privateRouteTableAzB.ref,
    });

    // Import VPC as IVpc for use with higher-level constructs
    this.vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId: vpcResource.ref,
      availabilityZones: ['us-west-2a', 'us-west-2b'],
      privateSubnetIds: [privateSubnetAzACfn.ref, privateSubnetAzBCfn.ref],
      privateSubnetRouteTableIds: [privateRouteTableAzA.ref, privateRouteTableAzB.ref],
    });

    // Store subnet references for later use
    this.privateSubnetAzA = ec2.Subnet.fromSubnetAttributes(this, 'ImportedPrivateSubnetAzA', {
      subnetId: privateSubnetAzACfn.ref,
      availabilityZone: 'us-west-2a',
      routeTableId: privateRouteTableAzA.ref,
    });

    this.privateSubnetAzB = ec2.Subnet.fromSubnetAttributes(this, 'ImportedPrivateSubnetAzB', {
      subnetId: privateSubnetAzBCfn.ref,
      availabilityZone: 'us-west-2b',
      routeTableId: privateRouteTableAzB.ref,
    });

    // Task 2.2: Add NAT Gateway for outbound connectivity
    // Requirements: 2.3
    
    // Create public subnet for NAT Gateway (NAT Gateway must be in public subnet)
    const publicSubnetAzACfn = new ec2.CfnSubnet(this, 'PublicSubnetAzA', {
      vpcId: vpcResource.ref,
      cidrBlock: '10.0.10.0/24',
      availabilityZone: 'us-west-2a',
      mapPublicIpOnLaunch: true,
      tags: [
        { key: 'Name', value: 'jenkins-eks-public-subnet-az-a' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster NAT Gateway' },
        { key: 'aws-cdk:subnet-type', value: 'Public' },
      ],
    });

    // Create Internet Gateway for public subnets
    const internetGateway = new ec2.CfnInternetGateway(this, 'InternetGateway', {
      tags: [
        { key: 'Name', value: 'jenkins-eks-igw' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster' },
      ],
    });

    // Attach Internet Gateway to VPC
    new ec2.CfnVPCGatewayAttachment(this, 'VpcGatewayAttachment', {
      vpcId: vpcResource.ref,
      internetGatewayId: internetGateway.ref,
    });

    // Create route table for public subnets
    const publicRouteTable = new ec2.CfnRouteTable(this, 'PublicRouteTable', {
      vpcId: vpcResource.ref,
      tags: [
        { key: 'Name', value: 'jenkins-eks-public-rt' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster' },
      ],
    });

    // Add route to Internet Gateway in public route table
    new ec2.CfnRoute(this, 'PublicRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: internetGateway.ref,
    });

    // Associate public route table with public subnet
    new ec2.CfnSubnetRouteTableAssociation(this, 'PublicSubnetAzARouteTableAssociation', {
      subnetId: publicSubnetAzACfn.ref,
      routeTableId: publicRouteTable.ref,
    });

    // Allocate Elastic IP for NAT Gateway
    const eipAzA = new ec2.CfnEIP(this, 'NatGatewayEipAzA', {
      domain: 'vpc',
      tags: [
        { key: 'Name', value: 'jenkins-eks-nat-eip-az-a' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster NAT Gateway' },
      ],
    });

    // Create NAT Gateway in AZ-A
    const natGatewayAzA = new ec2.CfnNatGateway(this, 'NatGatewayAzA', {
      subnetId: publicSubnetAzACfn.ref,
      allocationId: eipAzA.attrAllocationId,
      tags: [
        { key: 'Name', value: 'jenkins-eks-nat-gateway-az-a' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster' },
      ],
    });

    // Add route to NAT Gateway in private route table
    new ec2.CfnRoute(this, 'PrivateRouteAzA', {
      routeTableId: privateRouteTableAzA.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGatewayAzA.ref,
    });

    // Create public subnet for NAT Gateway in AZ-B
    const publicSubnetAzBCfn = new ec2.CfnSubnet(this, 'PublicSubnetAzB', {
      vpcId: vpcResource.ref,
      cidrBlock: '10.0.11.0/24',
      availabilityZone: 'us-west-2b',
      mapPublicIpOnLaunch: true,
      tags: [
        { key: 'Name', value: 'jenkins-eks-public-subnet-az-b' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster NAT Gateway' },
        { key: 'aws-cdk:subnet-type', value: 'Public' },
      ],
    });

    // Associate public route table with public subnet AZ-B
    new ec2.CfnSubnetRouteTableAssociation(this, 'PublicSubnetAzBRouteTableAssociation', {
      subnetId: publicSubnetAzBCfn.ref,
      routeTableId: publicRouteTable.ref,
    });

    // Allocate Elastic IP for NAT Gateway AZ-B
    const eipAzB = new ec2.CfnEIP(this, 'NatGatewayEipAzB', {
      domain: 'vpc',
      tags: [
        { key: 'Name', value: 'jenkins-eks-nat-eip-az-b' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster NAT Gateway' },
      ],
    });

    // Create NAT Gateway in AZ-B
    const natGatewayAzB = new ec2.CfnNatGateway(this, 'NatGatewayAzB', {
      subnetId: publicSubnetAzBCfn.ref,
      allocationId: eipAzB.attrAllocationId,
      tags: [
        { key: 'Name', value: 'jenkins-eks-nat-gateway-az-b' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster' },
      ],
    });

    // Add route to NAT Gateway in private route table AZ-B
    new ec2.CfnRoute(this, 'PrivateRouteAzB', {
      routeTableId: privateRouteTableAzB.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGatewayAzB.ref,
    });

    // Output NAT Gateway ID for reference
    new cdk.CfnOutput(this, 'NatGatewayAzAIdOutput', {
      value: natGatewayAzA.ref,
      description: 'NAT Gateway ID in Availability Zone A',
      exportName: 'JenkinsEksNatGatewayAzA',
    });

    // Output Elastic IP address for reference
    new cdk.CfnOutput(this, 'NatGatewayEipAzAOutput', {
      value: eipAzA.ref,
      description: 'Elastic IP for NAT Gateway in Availability Zone A',
      exportName: 'JenkinsEksNatEipAzA',
    });

    // Output NAT Gateway ID for AZ-B reference
    new cdk.CfnOutput(this, 'NatGatewayAzBIdOutput', {
      value: natGatewayAzB.ref,
      description: 'NAT Gateway ID in Availability Zone B',
      exportName: 'JenkinsEksNatGatewayAzB',
    });

    // Output Elastic IP address for AZ-B reference
    new cdk.CfnOutput(this, 'NatGatewayEipAzBOutput', {
      value: eipAzB.ref,
      description: 'Elastic IP for NAT Gateway in Availability Zone B',
      exportName: 'JenkinsEksNatEipAzB',
    });

    // Task 2.3: Create VPC endpoints for AWS services
    // Requirements: 2.6

    // Create security group for VPC endpoints
    const vpcEndpointSecurityGroup = new ec2.CfnSecurityGroup(this, 'VpcEndpointSecurityGroup', {
      groupDescription: 'Security group for VPC endpoints',
      vpcId: vpcResource.ref,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 443,
          toPort: 443,
          cidrIp: '10.0.0.0/16',
          description: 'Allow HTTPS from VPC',
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
        { key: 'Name', value: 'jenkins-eks-vpc-endpoint-sg' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster VPC Endpoints' },
      ],
    });

    // Create S3 Gateway endpoint (no cost)
    const s3GatewayEndpoint = new ec2.CfnVPCEndpoint(this, 'S3GatewayEndpoint', {
      vpcId: vpcResource.ref,
      serviceName: `com.amazonaws.${this.region}.s3`,
      vpcEndpointType: 'Gateway',
      routeTableIds: [privateRouteTableAzA.ref, privateRouteTableAzB.ref],
    });

    // Add tags to S3 Gateway endpoint
    cdk.Tags.of(s3GatewayEndpoint).add('Name', 'jenkins-eks-s3-gateway-endpoint');
    cdk.Tags.of(s3GatewayEndpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Create ECR API Interface endpoint
    const ecrApiEndpoint = new ec2.CfnVPCEndpoint(this, 'EcrApiEndpoint', {
      vpcId: vpcResource.ref,
      serviceName: `com.amazonaws.${this.region}.ecr.api`,
      vpcEndpointType: 'Interface',
      subnetIds: [privateSubnetAzACfn.ref],
      securityGroupIds: [vpcEndpointSecurityGroup.ref],
      privateDnsEnabled: true,
    });

    // Add tags to ECR API endpoint
    cdk.Tags.of(ecrApiEndpoint).add('Name', 'jenkins-eks-ecr-api-endpoint');
    cdk.Tags.of(ecrApiEndpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Create ECR Docker Interface endpoint
    const ecrDockerEndpoint = new ec2.CfnVPCEndpoint(this, 'EcrDockerEndpoint', {
      vpcId: vpcResource.ref,
      serviceName: `com.amazonaws.${this.region}.ecr.dkr`,
      vpcEndpointType: 'Interface',
      subnetIds: [privateSubnetAzACfn.ref],
      securityGroupIds: [vpcEndpointSecurityGroup.ref],
      privateDnsEnabled: true,
    });

    // Add tags to ECR Docker endpoint
    cdk.Tags.of(ecrDockerEndpoint).add('Name', 'jenkins-eks-ecr-docker-endpoint');
    cdk.Tags.of(ecrDockerEndpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Create EC2 Interface endpoint
    const ec2Endpoint = new ec2.CfnVPCEndpoint(this, 'Ec2Endpoint', {
      vpcId: vpcResource.ref,
      serviceName: `com.amazonaws.${this.region}.ec2`,
      vpcEndpointType: 'Interface',
      subnetIds: [privateSubnetAzACfn.ref],
      securityGroupIds: [vpcEndpointSecurityGroup.ref],
      privateDnsEnabled: true,
    });

    // Add tags to EC2 endpoint
    cdk.Tags.of(ec2Endpoint).add('Name', 'jenkins-eks-ec2-endpoint');
    cdk.Tags.of(ec2Endpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Create STS Interface endpoint
    const stsEndpoint = new ec2.CfnVPCEndpoint(this, 'StsEndpoint', {
      vpcId: vpcResource.ref,
      serviceName: `com.amazonaws.${this.region}.sts`,
      vpcEndpointType: 'Interface',
      subnetIds: [privateSubnetAzACfn.ref],
      securityGroupIds: [vpcEndpointSecurityGroup.ref],
      privateDnsEnabled: true,
    });

    // Add tags to STS endpoint
    cdk.Tags.of(stsEndpoint).add('Name', 'jenkins-eks-sts-endpoint');
    cdk.Tags.of(stsEndpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Create CloudWatch Logs Interface endpoint
    const cloudWatchLogsEndpoint = new ec2.CfnVPCEndpoint(this, 'CloudWatchLogsEndpoint', {
      vpcId: vpcResource.ref,
      serviceName: `com.amazonaws.${this.region}.logs`,
      vpcEndpointType: 'Interface',
      subnetIds: [privateSubnetAzACfn.ref, privateSubnetAzBCfn.ref],
      securityGroupIds: [vpcEndpointSecurityGroup.ref],
      privateDnsEnabled: true,
    });

    // Add tags to CloudWatch Logs endpoint
    cdk.Tags.of(cloudWatchLogsEndpoint).add('Name', 'jenkins-eks-cloudwatch-logs-endpoint');
    cdk.Tags.of(cloudWatchLogsEndpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Output VPC endpoint IDs for reference
    new cdk.CfnOutput(this, 'S3GatewayEndpointIdOutput', {
      value: s3GatewayEndpoint.ref,
      description: 'S3 Gateway VPC Endpoint ID',
      exportName: 'JenkinsEksS3GatewayEndpoint',
    });

    new cdk.CfnOutput(this, 'EcrApiEndpointIdOutput', {
      value: ecrApiEndpoint.ref,
      description: 'ECR API Interface VPC Endpoint ID',
      exportName: 'JenkinsEksEcrApiEndpoint',
    });

    new cdk.CfnOutput(this, 'EcrDockerEndpointIdOutput', {
      value: ecrDockerEndpoint.ref,
      description: 'ECR Docker Interface VPC Endpoint ID',
      exportName: 'JenkinsEksEcrDockerEndpoint',
    });

    new cdk.CfnOutput(this, 'Ec2EndpointIdOutput', {
      value: ec2Endpoint.ref,
      description: 'EC2 Interface VPC Endpoint ID',
      exportName: 'JenkinsEksEc2Endpoint',
    });

    new cdk.CfnOutput(this, 'StsEndpointIdOutput', {
      value: stsEndpoint.ref,
      description: 'STS Interface VPC Endpoint ID',
      exportName: 'JenkinsEksStsEndpoint',
    });

    new cdk.CfnOutput(this, 'CloudWatchLogsEndpointIdOutput', {
      value: cloudWatchLogsEndpoint.ref,
      description: 'CloudWatch Logs Interface VPC Endpoint ID',
      exportName: 'JenkinsEksCloudWatchLogsEndpoint',
    });

    // Task 3.1: Create EKS cluster IAM role
    // Requirements: 1.1
    
    // Create IAM role for EKS cluster
    // This role allows the EKS service to manage cluster resources
    this.eksClusterRole = new iam.Role(this, 'EksClusterRole', {
      roleName: 'jenkins-eks-cluster-role',
      description: 'IAM role for Jenkins EKS cluster to manage cluster resources',
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
      ],
    });

    // Output EKS cluster role ARN for reference
    new cdk.CfnOutput(this, 'EksClusterRoleArnOutput', {
      value: this.eksClusterRole.roleArn,
      description: 'IAM Role ARN for EKS Cluster',
      exportName: 'JenkinsEksClusterRoleArn',
    });

    // Task 3.2: Create EKS cluster resource
    // Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
    
    // Create EKS cluster with Kubernetes version 1.32
    // Configure cluster in private subnets across 2 availability zones
    // Enable private endpoint access (no public endpoint)
    // Enable all cluster logging types
    const eksCluster = new cdk.aws_eks.CfnCluster(this, 'JenkinsEksCluster', {
      name: 'jenkins-eks-cluster',
      version: '1.32',
      roleArn: this.eksClusterRole.roleArn,
      
      // Configure cluster in private subnets across 2 availability zones
      resourcesVpcConfig: {
        subnetIds: [privateSubnetAzACfn.ref, privateSubnetAzBCfn.ref],
        
        // Enable private endpoint access (no public endpoint)
        // Requirement 1.5: Private endpoint access for API server communication
        endpointPrivateAccess: true,
        endpointPublicAccess: false,
      },
      
      // Enable all cluster logging types
      // Requirement 1.4: Enable cluster logging for audit, API, authenticator, controller manager, and scheduler logs
      logging: {
        clusterLogging: {
          enabledTypes: [
            { type: 'api' },
            { type: 'audit' },
            { type: 'authenticator' },
            { type: 'controllerManager' },
            { type: 'scheduler' },
          ],
        },
      },
      
      tags: [
        { key: 'Name', value: 'jenkins-eks-cluster' },
        { key: 'Purpose', value: 'Jenkins CI/CD Platform' },
        { key: 'ManagedBy', value: 'AWS CDK' },
      ],
    });

    // Output EKS cluster information for reference
    new cdk.CfnOutput(this, 'EksClusterNameOutput', {
      value: eksCluster.name!,
      description: 'EKS Cluster Name',
      exportName: 'JenkinsEksClusterName',
    });

    new cdk.CfnOutput(this, 'EksClusterArnOutput', {
      value: eksCluster.attrArn,
      description: 'EKS Cluster ARN',
      exportName: 'JenkinsEksClusterArn',
    });

    new cdk.CfnOutput(this, 'EksClusterEndpointOutput', {
      value: eksCluster.attrEndpoint,
      description: 'EKS Cluster API Endpoint',
      exportName: 'JenkinsEksClusterEndpoint',
    });

    new cdk.CfnOutput(this, 'EksClusterVersionOutput', {
      value: eksCluster.version!,
      description: 'EKS Cluster Kubernetes Version',
      exportName: 'JenkinsEksClusterVersion',
    });

    // Task 6.1: Create OIDC provider for EKS cluster
    // Requirements: 5.3
    
    // Create OIDC identity provider for the EKS cluster
    // This enables IAM Roles for Service Accounts (IRSA), which allows Kubernetes service accounts
    // to assume IAM roles and access AWS resources without storing credentials
    // Requirement 5.3: Service account associated with IAM role using IRSA
    
    // The OIDC provider URL is the cluster's OIDC issuer URL
    // Format: https://oidc.eks.{region}.amazonaws.com/id/{cluster-id}
    const oidcProvider = new iam.OpenIdConnectProvider(this, 'EksOidcProvider', {
      // The URL of the OIDC provider (the EKS cluster's OIDC issuer)
      // We need to remove the 'https://' prefix as the construct adds it automatically
      url: eksCluster.attrOpenIdConnectIssuerUrl,
      
      // The client IDs (audiences) that can use this OIDC provider
      // For EKS, the audience is always 'sts.amazonaws.com'
      clientIds: ['sts.amazonaws.com'],
      
      // The thumbprints of the OIDC provider's server certificate
      // For EKS, we can use the root CA thumbprint
      // AWS maintains the certificate, so we use a well-known thumbprint
      thumbprints: [
        // This is the thumbprint for the root CA used by EKS OIDC providers
        // It's a constant value that works for all EKS clusters
        '9e99a48a9960b14926bb7f3b02e22da2b0ab7280',
      ],
    });

    // Output OIDC provider information for reference
    new cdk.CfnOutput(this, 'OidcProviderArnOutput', {
      value: oidcProvider.openIdConnectProviderArn,
      description: 'OIDC Provider ARN for EKS cluster (enables IRSA)',
      exportName: 'JenkinsEksOidcProviderArn',
    });

    new cdk.CfnOutput(this, 'OidcProviderIssuerOutput', {
      value: eksCluster.attrOpenIdConnectIssuerUrl,
      description: 'OIDC Provider Issuer URL for EKS cluster',
      exportName: 'JenkinsEksOidcProviderIssuer',
    });

    // Task 4.1: Create EFS file system
    // Requirements: 6.1, 6.2, 6.3, 6.4, 6.13
    
    // Create EFS file system for Jenkins persistent storage
    // The file system will be used to store Jenkins home directory (configs, jobs, plugins, build history)
    this.efsFileSystem = new efs.FileSystem(this, 'JenkinsEfsFileSystem', {
      // Deploy across multiple availability zones for high availability
      // Requirement 6.2: EFS deployed across multiple availability zones
      vpc: this.vpc,
      vpcSubnets: {
        subnets: [this.privateSubnetAzA, this.privateSubnetAzB],
      },
      
      // Enable encryption at rest using AWS managed key
      // Requirement 6.4: EFS encryption at rest enabled using AWS KMS
      encrypted: true,
      
      // Use General Purpose performance mode for balanced performance
      // Requirement 6.3: EFS General Purpose performance mode
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      
      // Use Bursting throughput mode (scales automatically with file system size)
      // Requirement 6.3: Configure Bursting throughput mode
      throughputMode: efs.ThroughputMode.BURSTING,
      
      // Enable lifecycle management to transition infrequently accessed files to IA storage class after 30 days
      // Requirement 6.13: EFS lifecycle management to transition to IA after 30 days
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      
      // Enable automatic backups (will be configured separately with AWS Backup in task 4.3)
      enableAutomaticBackups: true,
      
      // Remove file system when stack is deleted (set to RETAIN for production)
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      
      fileSystemName: 'jenkins-eks-efs',
    });

    // Add tags to EFS file system
    cdk.Tags.of(this.efsFileSystem).add('Name', 'jenkins-eks-efs');
    cdk.Tags.of(this.efsFileSystem).add('Purpose', 'Jenkins EKS Cluster Persistent Storage');
    cdk.Tags.of(this.efsFileSystem).add('ManagedBy', 'AWS CDK');

    // Output EFS file system information for reference
    new cdk.CfnOutput(this, 'EfsFileSystemIdOutput', {
      value: this.efsFileSystem.fileSystemId,
      description: 'EFS File System ID for Jenkins persistent storage',
      exportName: 'JenkinsEksEfsFileSystemId',
    });

    new cdk.CfnOutput(this, 'EfsFileSystemArnOutput', {
      value: this.efsFileSystem.fileSystemArn,
      description: 'EFS File System ARN',
      exportName: 'JenkinsEksEfsFileSystemArn',
    });

    // Task 4.2: Create EFS mount targets
    // Requirements: 6.6, 6.7
    // Note: Mount targets are automatically created by the efs.FileSystem L2 construct
    // in the specified subnets (privateSubnetAzA and privateSubnetAzB).
    // The L2 construct also creates a security group automatically that allows NFS traffic.
    // Requirement 6.6: EFS mount targets in each availability zone where EKS nodes are deployed
    // Requirement 6.7: Security group allows NFS traffic from EKS worker nodes

    // Task 4.3: Configure EFS backup
    // Requirements: 6.5
    
    // Create AWS Backup vault for storing EFS backups
    const backupVault = new backup.BackupVault(this, 'JenkinsEfsBackupVault', {
      backupVaultName: 'jenkins-eks-efs-backup-vault',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Set to RETAIN for production
    });

    // Create AWS Backup plan for EFS with daily backups and 30-day retention
    // Requirement 6.5: EFS automated backup enabled through AWS Backup with 30-day retention
    const backupPlan = new backup.BackupPlan(this, 'JenkinsEfsBackupPlan', {
      backupPlanName: 'jenkins-eks-efs-daily-backup',
      backupVault: backupVault,
      
      // Configure daily backup schedule
      backupPlanRules: [
        new backup.BackupPlanRule({
          ruleName: 'DailyBackup',
          
          // Schedule daily backups at 2 AM UTC
          scheduleExpression: cdk.aws_events.Schedule.cron({
            hour: '2',
            minute: '0',
          }),
          
          // Start backup within 1 hour of scheduled time
          startWindow: cdk.Duration.hours(1),
          
          // Complete backup within 2 hours
          completionWindow: cdk.Duration.hours(2),
          
          // Set backup retention to 30 days
          // Requirement 6.5: 30-day retention for EFS backups
          deleteAfter: cdk.Duration.days(30),
          
          // Note: Cold storage transition removed because AWS requires at least 90 days
          // between moveToColdStorageAfter and deleteAfter
        }),
      ],
    });

    // Add EFS file system to backup plan
    // This creates a backup selection that targets the EFS file system
    backupPlan.addSelection('JenkinsEfsBackupSelection', {
      resources: [
        backup.BackupResource.fromEfsFileSystem(this.efsFileSystem),
      ],
      
      // Allow AWS Backup to create the necessary IAM role automatically
      allowRestores: true,
    });

    // Output AWS Backup information for reference
    new cdk.CfnOutput(this, 'BackupVaultNameOutput', {
      value: backupVault.backupVaultName,
      description: 'AWS Backup Vault Name for EFS backups',
      exportName: 'JenkinsEksBackupVaultName',
    });

    new cdk.CfnOutput(this, 'BackupVaultArnOutput', {
      value: backupVault.backupVaultArn,
      description: 'AWS Backup Vault ARN',
      exportName: 'JenkinsEksBackupVaultArn',
    });

    new cdk.CfnOutput(this, 'BackupPlanIdOutput', {
      value: backupPlan.backupPlanId,
      description: 'AWS Backup Plan ID for EFS daily backups',
      exportName: 'JenkinsEksBackupPlanId',
    });

    new cdk.CfnOutput(this, 'BackupPlanArnOutput', {
      value: backupPlan.backupPlanArn,
      description: 'AWS Backup Plan ARN',
      exportName: 'JenkinsEksBackupPlanArn',
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

    // Task 6.2: Create Jenkins controller IAM role
    // Requirements: 5.1, 5.2, 5.5, 5.7
    
    // Create IAM role for Jenkins controller with IRSA (IAM Roles for Service Accounts)
    // This role allows Jenkins to deploy and manage AWS infrastructure securely
    // Requirement 5.1: IAM role with permissions for IaC deployments
    // Requirement 5.2: Follow principle of least privilege
    // Requirement 5.3: Service account associated with IAM role using IRSA
    // Requirement 5.5: Permissions for CloudFormation, Terraform state, EC2, VPC, IAM, EKS
    // Requirement 5.7: Session duration of at least 3600 seconds
    
    // Extract the OIDC issuer URL without the https:// prefix for use in the trust policy
    // The OIDC issuer URL format is: https://oidc.eks.{region}.amazonaws.com/id/{cluster-id}
    // We need to remove the https:// prefix to use it as a condition key
    const oidcIssuerWithoutProtocol = cdk.Fn.select(1, cdk.Fn.split('https://', eksCluster.attrOpenIdConnectIssuerUrl));
    
    // Create CfnJson to handle the dynamic condition keys
    // This allows us to use tokens (like the OIDC issuer URL) as keys in the trust policy
    const stringEqualsCondition = new cdk.CfnJson(this, 'JenkinsControllerRoleCondition', {
      value: {
        [`${oidcIssuerWithoutProtocol}:sub`]: 'system:serviceaccount:jenkins:jenkins-controller',
        [`${oidcIssuerWithoutProtocol}:aud`]: 'sts.amazonaws.com',
      },
    });
    
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
    
    // Create the IAM role using CfnRole for more control over the trust policy
    const jenkinsControllerRoleCfn = new iam.CfnRole(this, 'JenkinsControllerRole', {
      roleName: 'jenkins-eks-controller-role',
      description: 'IAM role for Jenkins controller to deploy and manage AWS infrastructure',
      
      // Configure session duration to 3600 seconds (1 hour)
      // Requirement 5.7: Session duration of at least 3600 seconds for long-running deployments
      maxSessionDuration: 3600,
      
      // Configure trust policy for IRSA
      // This allows the Kubernetes service account to assume this IAM role
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Federated: oidcProvider.openIdConnectProviderArn,
            },
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: stringEqualsCondition,
            },
          },
        ],
      },
      
      // Attach inline policy with all permissions
      policies: [
        {
          policyName: 'JenkinsControllerInfrastructureDeploymentPolicy',
          policyDocument: jenkinsControllerPolicyDocument.toJSON(),
        },
      ],
      
      tags: [
        { key: 'Name', value: 'jenkins-eks-controller-role' },
        { key: 'Purpose', value: 'Jenkins Controller IAM Role for AWS Infrastructure Deployment' },
        { key: 'ManagedBy', value: 'AWS CDK' },
      ],
    });

    // Output Jenkins controller role information for reference
    new cdk.CfnOutput(this, 'JenkinsControllerRoleArnOutput', {
      value: jenkinsControllerRoleCfn.attrArn,
      description: 'IAM Role ARN for Jenkins controller (use with IRSA)',
      exportName: 'JenkinsEksControllerRoleArn',
    });

    new cdk.CfnOutput(this, 'JenkinsControllerRoleNameOutput', {
      value: jenkinsControllerRoleCfn.roleName!,
      description: 'IAM Role Name for Jenkins controller',
      exportName: 'JenkinsEksControllerRoleName',
    });

    new cdk.CfnOutput(this, 'JenkinsControllerServiceAccountAnnotationOutput', {
      value: `eks.amazonaws.com/role-arn: ${jenkinsControllerRoleCfn.attrArn}`,
      description: 'Annotation to add to jenkins-controller service account for IRSA',
      exportName: 'JenkinsEksControllerServiceAccountAnnotation',
    });

    // Task 6.3: Create Cluster Autoscaler IAM role
    // Requirements: 8.1
    
    // Create IAM role for Cluster Autoscaler with IRSA (IAM Roles for Service Accounts)
    // This role allows the Cluster Autoscaler to automatically scale EKS node groups
    // Requirement 8.1: Cluster Autoscaler installed and configured
    
    // Create CfnJson to handle the dynamic condition keys for Cluster Autoscaler
    // This allows the cluster-autoscaler service account in kube-system namespace to assume the role
    const clusterAutoscalerCondition = new cdk.CfnJson(this, 'ClusterAutoscalerRoleCondition', {
      value: {
        [`${oidcIssuerWithoutProtocol}:sub`]: 'system:serviceaccount:kube-system:cluster-autoscaler',
        [`${oidcIssuerWithoutProtocol}:aud`]: 'sts.amazonaws.com',
      },
    });
    
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
    
    // Create the IAM role using CfnRole for more control over the trust policy
    const clusterAutoscalerRoleCfn = new iam.CfnRole(this, 'ClusterAutoscalerRole', {
      roleName: 'jenkins-eks-cluster-autoscaler-role',
      description: 'IAM role for Cluster Autoscaler to automatically scale EKS node groups',
      
      // Configure trust policy for IRSA
      // This allows the cluster-autoscaler service account in kube-system namespace to assume this IAM role
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Federated: oidcProvider.openIdConnectProviderArn,
            },
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: clusterAutoscalerCondition,
            },
          },
        ],
      },
      
      // Attach inline policy with Cluster Autoscaler permissions
      policies: [
        {
          policyName: 'ClusterAutoscalerPolicy',
          policyDocument: clusterAutoscalerPolicyDocument.toJSON(),
        },
      ],
      
      tags: [
        { key: 'Name', value: 'jenkins-eks-cluster-autoscaler-role' },
        { key: 'Purpose', value: 'Cluster Autoscaler IAM Role for EKS Node Group Scaling' },
        { key: 'ManagedBy', value: 'AWS CDK' },
      ],
    });

    // Output Cluster Autoscaler role information for reference
    new cdk.CfnOutput(this, 'ClusterAutoscalerRoleArnOutput', {
      value: clusterAutoscalerRoleCfn.attrArn,
      description: 'IAM Role ARN for Cluster Autoscaler (use with IRSA)',
      exportName: 'JenkinsEksClusterAutoscalerRoleArn',
    });

    new cdk.CfnOutput(this, 'ClusterAutoscalerRoleNameOutput', {
      value: clusterAutoscalerRoleCfn.roleName!,
      description: 'IAM Role Name for Cluster Autoscaler',
      exportName: 'JenkinsEksClusterAutoscalerRoleName',
    });

    new cdk.CfnOutput(this, 'ClusterAutoscalerServiceAccountAnnotationOutput', {
      value: `eks.amazonaws.com/role-arn: ${clusterAutoscalerRoleCfn.attrArn}`,
      description: 'Annotation to add to cluster-autoscaler service account for IRSA',
      exportName: 'JenkinsEksClusterAutoscalerServiceAccountAnnotation',
    });

    // Task 6.4: Create EFS CSI Driver IAM role
    // Requirements: 6.8
    
    // Create IAM role for EFS CSI Driver with IRSA (IAM Roles for Service Accounts)
    // This role allows the EFS CSI Driver to manage EFS access points and mount targets
    // Requirement 6.8: EKS cluster has EFS CSI Driver installed for dynamic volume provisioning
    
    // Create CfnJson to handle the dynamic condition keys for EFS CSI Driver
    // This allows the efs-csi-controller-sa service account in kube-system namespace to assume the role
    const efsCsiDriverCondition = new cdk.CfnJson(this, 'EfsCsiDriverRoleCondition', {
      value: {
        [`${oidcIssuerWithoutProtocol}:sub`]: 'system:serviceaccount:kube-system:efs-csi-controller-sa',
        [`${oidcIssuerWithoutProtocol}:aud`]: 'sts.amazonaws.com',
      },
    });
    
    // Create an inline policy document with EFS CSI Driver permissions
    // Based on the design document, the EFS CSI Driver needs permissions to:
    // 1. Describe EFS file systems, access points, and mount targets
    // 2. Create and delete EFS access points
    // 3. Tag EFS resources
    const efsCsiDriverPolicyDocument = new iam.PolicyDocument({
      statements: [
        // EFS permissions for CSI Driver
        // These permissions allow the EFS CSI Driver to dynamically provision volumes
        // using EFS access points and manage mount operations
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticfilesystem:DescribeAccessPoints',
            'elasticfilesystem:DescribeFileSystems',
            'elasticfilesystem:DescribeMountTargets',
            'elasticfilesystem:CreateAccessPoint',
            'elasticfilesystem:DeleteAccessPoint',
            'elasticfilesystem:TagResource',
          ],
          resources: ['*'],
        }),
      ],
    });
    
    // Create the IAM role using CfnRole for more control over the trust policy
    const efsCsiDriverRoleCfn = new iam.CfnRole(this, 'EfsCsiDriverRole', {
      roleName: 'jenkins-eks-efs-csi-driver-role',
      description: 'IAM role for EFS CSI Driver to manage EFS access points and mount targets',
      
      // Configure trust policy for IRSA
      // This allows the efs-csi-controller-sa service account in kube-system namespace to assume this IAM role
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Federated: oidcProvider.openIdConnectProviderArn,
            },
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: efsCsiDriverCondition,
            },
          },
        ],
      },
      
      // Attach inline policy with EFS CSI Driver permissions
      policies: [
        {
          policyName: 'EfsCsiDriverPolicy',
          policyDocument: efsCsiDriverPolicyDocument.toJSON(),
        },
      ],
      
      tags: [
        { key: 'Name', value: 'jenkins-eks-efs-csi-driver-role' },
        { key: 'Purpose', value: 'EFS CSI Driver IAM Role for Dynamic Volume Provisioning' },
        { key: 'ManagedBy', value: 'AWS CDK' },
      ],
    });

    // Output EFS CSI Driver role information for reference
    new cdk.CfnOutput(this, 'EfsCsiDriverRoleArnOutput', {
      value: efsCsiDriverRoleCfn.attrArn,
      description: 'IAM Role ARN for EFS CSI Driver (use with IRSA)',
      exportName: 'JenkinsEksEfsCsiDriverRoleArn',
    });

    new cdk.CfnOutput(this, 'EfsCsiDriverRoleNameOutput', {
      value: efsCsiDriverRoleCfn.roleName!,
      description: 'IAM Role Name for EFS CSI Driver',
      exportName: 'JenkinsEksEfsCsiDriverRoleName',
    });

    new cdk.CfnOutput(this, 'EfsCsiDriverServiceAccountAnnotationOutput', {
      value: `eks.amazonaws.com/role-arn: ${efsCsiDriverRoleCfn.attrArn}`,
      description: 'Annotation to add to efs-csi-controller-sa service account for IRSA',
      exportName: 'JenkinsEksEfsCsiDriverServiceAccountAnnotation',
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
      clusterName: eksCluster.name!,
      nodegroupName: 'jenkins-controller-nodegroup',
      nodeRole: controllerNodeRole.roleArn,
      
      // Deploy nodes in private subnets across both availability zones
      subnets: [privateSubnetAzACfn.ref, privateSubnetAzBCfn.ref],
      
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

    // Ensure node group is created after the cluster
    controllerNodeGroup.addDependency(eksCluster);

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
      clusterName: eksCluster.name!,
      nodegroupName: 'jenkins-agent-nodegroup',
      nodeRole: agentNodeRole.roleArn,
      
      // Deploy nodes in private subnets across both availability zones
      subnets: [privateSubnetAzACfn.ref, privateSubnetAzBCfn.ref],
      
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

    // Ensure node group is created after the cluster
    agentNodeGroup.addDependency(eksCluster);

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
      vpcId: vpcResource.ref,
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
      vpcId: vpcResource.ref,
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
          ClusterName: eksCluster.name!,
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
          ClusterName: eksCluster.name!,
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
          ClusterName: eksCluster.name!,
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
          ClusterName: eksCluster.name!,
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
  }
}
