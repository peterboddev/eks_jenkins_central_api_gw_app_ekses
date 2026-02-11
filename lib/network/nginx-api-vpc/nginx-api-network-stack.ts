import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * Nginx API Network Stack
 * 
 * This stack provisions VPC infrastructure for the Nginx API EKS cluster:
 * - VPC with CIDR 10.1.0.0/16
 * - Public subnets for ALB
 * - Private subnets for EKS nodes
 * - Single NAT Gateway for cost savings
 */
export class NginxApiNetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly vpcId: string;
  public readonly privateSubnetIds: string[];
  public readonly privateRouteTableIds: string[];

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create VPC with CIDR 10.1.0.0/16
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

    this.vpcId = this.vpc.vpcId;

    // Store subnet and route table IDs for Transit Gateway
    this.privateSubnetIds = this.vpc.privateSubnets.map(s => s.subnetId);
    this.privateRouteTableIds = this.vpc.privateSubnets.map(s => s.routeTable.routeTableId);

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

    // Outputs
    new cdk.CfnOutput(this, 'VpcIdOutput', {
      value: this.vpc.vpcId,
      description: 'VPC ID for nginx-api-cluster',
      exportName: 'NginxApiNetworkVpcId',
    });

    new cdk.CfnOutput(this, 'VpcCidrOutput', {
      value: this.vpc.vpcCidrBlock,
      description: 'VPC CIDR block for nginx-api-cluster',
      exportName: 'NginxApiNetworkVpcCidr',
    });

    new cdk.CfnOutput(this, 'PublicSubnetIdsOutput', {
      value: this.vpc.publicSubnets.map(s => s.subnetId).join(','),
      description: 'Public Subnet IDs',
      exportName: 'NginxApiNetworkPublicSubnetIds',
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIdsOutput', {
      value: this.vpc.privateSubnets.map(s => s.subnetId).join(','),
      description: 'Private Subnet IDs',
      exportName: 'NginxApiNetworkPrivateSubnetIds',
    });
  }
}
