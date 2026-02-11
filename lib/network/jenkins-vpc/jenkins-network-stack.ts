import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * Jenkins Network Stack
 * 
 * This stack provisions VPC infrastructure for the Jenkins EKS cluster:
 * - VPC with CIDR 10.0.0.0/16
 * - Private subnets in 2 availability zones
 * - Public subnets for NAT Gateways
 * - NAT Gateways for outbound connectivity
 * - VPC endpoints for AWS services
 */
export class JenkinsNetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly privateSubnetAzA: ec2.ISubnet;
  public readonly privateSubnetAzB: ec2.ISubnet;
  public readonly vpcId: string;
  public readonly privateSubnetIds: string[];
  public readonly privateRouteTableIds: string[];

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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

    this.vpcId = vpcResource.ref;

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

    // Create public subnet for NAT Gateway (NAT Gateway must be in public subnet)
    // Also used for ALB (Application Load Balancer) for Jenkins Ingress
    const publicSubnetAzACfn = new ec2.CfnSubnet(this, 'PublicSubnetAzA', {
      vpcId: vpcResource.ref,
      cidrBlock: '10.0.10.0/24',
      availabilityZone: 'us-west-2a',
      mapPublicIpOnLaunch: true,
      tags: [
        { key: 'Name', value: 'jenkins-eks-public-subnet-az-a' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster NAT Gateway and ALB' },
        { key: 'aws-cdk:subnet-type', value: 'Public' },
        // Tag for ALB auto-discovery
        { key: 'kubernetes.io/role/elb', value: '1' },
        { key: 'kubernetes.io/cluster/jenkins-eks-cluster', value: 'shared' },
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
    // Also used for ALB (Application Load Balancer) for Jenkins Ingress
    const publicSubnetAzBCfn = new ec2.CfnSubnet(this, 'PublicSubnetAzB', {
      vpcId: vpcResource.ref,
      cidrBlock: '10.0.11.0/24',
      availabilityZone: 'us-west-2b',
      mapPublicIpOnLaunch: true,
      tags: [
        { key: 'Name', value: 'jenkins-eks-public-subnet-az-b' },
        { key: 'Purpose', value: 'Jenkins EKS Cluster NAT Gateway and ALB' },
        { key: 'aws-cdk:subnet-type', value: 'Public' },
        // Tag for ALB auto-discovery
        { key: 'kubernetes.io/role/elb', value: '1' },
        { key: 'kubernetes.io/cluster/jenkins-eks-cluster', value: 'shared' },
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

    // Import VPC as IVpc for use with higher-level constructs
    this.vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId: vpcResource.ref,
      vpcCidrBlock: '10.0.0.0/16',
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

    // Store subnet and route table IDs for Transit Gateway
    this.privateSubnetIds = [privateSubnetAzACfn.ref, privateSubnetAzBCfn.ref];
    this.privateRouteTableIds = [privateRouteTableAzA.ref, privateRouteTableAzB.ref];

    // Create VPC endpoints for AWS services
    
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

    cdk.Tags.of(s3GatewayEndpoint).add('Name', 'jenkins-eks-s3-gateway-endpoint');
    cdk.Tags.of(s3GatewayEndpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Create ECR API Interface endpoint in BOTH availability zones
    const ecrApiEndpoint = new ec2.CfnVPCEndpoint(this, 'EcrApiEndpoint', {
      vpcId: vpcResource.ref,
      serviceName: `com.amazonaws.${this.region}.ecr.api`,
      vpcEndpointType: 'Interface',
      subnetIds: [privateSubnetAzACfn.ref, privateSubnetAzBCfn.ref],
      securityGroupIds: [vpcEndpointSecurityGroup.ref],
      privateDnsEnabled: true,
    });

    cdk.Tags.of(ecrApiEndpoint).add('Name', 'jenkins-eks-ecr-api-endpoint');
    cdk.Tags.of(ecrApiEndpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Create ECR Docker Interface endpoint in BOTH availability zones
    const ecrDockerEndpoint = new ec2.CfnVPCEndpoint(this, 'EcrDockerEndpoint', {
      vpcId: vpcResource.ref,
      serviceName: `com.amazonaws.${this.region}.ecr.dkr`,
      vpcEndpointType: 'Interface',
      subnetIds: [privateSubnetAzACfn.ref, privateSubnetAzBCfn.ref],
      securityGroupIds: [vpcEndpointSecurityGroup.ref],
      privateDnsEnabled: true,
    });

    cdk.Tags.of(ecrDockerEndpoint).add('Name', 'jenkins-eks-ecr-docker-endpoint');
    cdk.Tags.of(ecrDockerEndpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Create EC2 Interface endpoint in BOTH availability zones
    const ec2Endpoint = new ec2.CfnVPCEndpoint(this, 'Ec2Endpoint', {
      vpcId: vpcResource.ref,
      serviceName: `com.amazonaws.${this.region}.ec2`,
      vpcEndpointType: 'Interface',
      subnetIds: [privateSubnetAzACfn.ref, privateSubnetAzBCfn.ref],
      securityGroupIds: [vpcEndpointSecurityGroup.ref],
      privateDnsEnabled: true,
    });

    cdk.Tags.of(ec2Endpoint).add('Name', 'jenkins-eks-ec2-endpoint');
    cdk.Tags.of(ec2Endpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Create STS Interface endpoint in BOTH availability zones
    const stsEndpoint = new ec2.CfnVPCEndpoint(this, 'StsEndpoint', {
      vpcId: vpcResource.ref,
      serviceName: `com.amazonaws.${this.region}.sts`,
      vpcEndpointType: 'Interface',
      subnetIds: [privateSubnetAzACfn.ref, privateSubnetAzBCfn.ref],
      securityGroupIds: [vpcEndpointSecurityGroup.ref],
      privateDnsEnabled: true,
    });

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

    cdk.Tags.of(cloudWatchLogsEndpoint).add('Name', 'jenkins-eks-cloudwatch-logs-endpoint');
    cdk.Tags.of(cloudWatchLogsEndpoint).add('Purpose', 'Jenkins EKS Cluster');

    // Outputs
    new cdk.CfnOutput(this, 'VpcIdOutput', {
      value: vpcResource.ref,
      description: 'VPC ID for Jenkins EKS cluster',
      exportName: 'JenkinsNetworkVpcId',
    });

    new cdk.CfnOutput(this, 'PrivateSubnetAzAIdOutput', {
      value: privateSubnetAzACfn.ref,
      description: 'Private Subnet ID in AZ-A',
      exportName: 'JenkinsNetworkPrivateSubnetAzA',
    });

    new cdk.CfnOutput(this, 'PrivateSubnetAzBIdOutput', {
      value: privateSubnetAzBCfn.ref,
      description: 'Private Subnet ID in AZ-B',
      exportName: 'JenkinsNetworkPrivateSubnetAzB',
    });

    new cdk.CfnOutput(this, 'NatGatewayAzAIdOutput', {
      value: natGatewayAzA.ref,
      description: 'NAT Gateway ID in Availability Zone A',
      exportName: 'JenkinsNetworkNatGatewayAzA',
    });

    new cdk.CfnOutput(this, 'NatGatewayAzBIdOutput', {
      value: natGatewayAzB.ref,
      description: 'NAT Gateway ID in Availability Zone B',
      exportName: 'JenkinsNetworkNatGatewayAzB',
    });
  }
}
