import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * Transit Gateway Stack
 * 
 * This stack provisions a Transit Gateway for inter-VPC connectivity:
 * - Transit Gateway for routing between VPCs
 * - VPC attachments for Jenkins and Nginx API VPCs
 * - Route table associations and propagations
 * 
 * This enables private communication between:
 * - Jenkins cluster (10.0.0.0/16)
 * - Nginx API cluster (10.1.0.0/16)
 */

export interface TransitGatewayStackProps extends cdk.StackProps {
  /**
   * Jenkins VPC ID to attach to Transit Gateway
   */
  jenkinsVpcId: string;
  
  /**
   * Jenkins VPC CIDR block
   */
  jenkinsVpcCidr: string;
  
  /**
   * Jenkins private subnet IDs for TGW attachment
   */
  jenkinsPrivateSubnetIds: string[];
  
  /**
   * Jenkins private route table IDs for adding TGW routes
   */
  jenkinsPrivateRouteTableIds: string[];
  
  /**
   * Nginx API VPC ID to attach to Transit Gateway
   */
  nginxApiVpcId: string;
  
  /**
   * Nginx API VPC CIDR block
   */
  nginxApiVpcCidr: string;
  
  /**
   * Nginx API private subnet IDs for TGW attachment
   */
  nginxApiPrivateSubnetIds: string[];
  
  /**
   * Nginx API private route table IDs for adding TGW routes
   */
  nginxApiPrivateRouteTableIds: string[];
}

export class TransitGatewayStack extends cdk.Stack {
  public readonly transitGatewayId: string;
  public readonly transitGatewayArn: string;

  constructor(scope: Construct, id: string, props: TransitGatewayStackProps) {
    super(scope, id, props);

    // Create Transit Gateway
    const transitGateway = new ec2.CfnTransitGateway(this, 'TransitGateway', {
      description: 'Transit Gateway for Jenkins and Nginx API VPC connectivity',
      defaultRouteTableAssociation: 'enable',
      defaultRouteTablePropagation: 'enable',
      dnsSupport: 'enable',
      vpnEcmpSupport: 'enable',
      tags: [
        { key: 'Name', value: 'jenkins-nginx-tgw' },
        { key: 'Purpose', value: 'Inter-VPC Connectivity' },
      ],
    });

    this.transitGatewayId = transitGateway.ref;
    // Construct ARN manually since CfnTransitGateway doesn't expose attrArn
    this.transitGatewayArn = `arn:aws:ec2:${this.region}:${this.account}:transit-gateway/${transitGateway.ref}`;

    // Create Transit Gateway attachment for Jenkins VPC
    const jenkinsAttachment = new ec2.CfnTransitGatewayAttachment(this, 'JenkinsVpcAttachment', {
      transitGatewayId: transitGateway.ref,
      vpcId: props.jenkinsVpcId,
      subnetIds: props.jenkinsPrivateSubnetIds,
      tags: [
        { key: 'Name', value: 'jenkins-vpc-tgw-attachment' },
        { key: 'Purpose', value: 'Jenkins VPC to Transit Gateway' },
      ],
    });

    // Create Transit Gateway attachment for Nginx API VPC
    const nginxApiAttachment = new ec2.CfnTransitGatewayAttachment(this, 'NginxApiVpcAttachment', {
      transitGatewayId: transitGateway.ref,
      vpcId: props.nginxApiVpcId,
      subnetIds: props.nginxApiPrivateSubnetIds,
      tags: [
        { key: 'Name', value: 'nginx-api-vpc-tgw-attachment' },
        { key: 'Purpose', value: 'Nginx API VPC to Transit Gateway' },
      ],
    });

    // Add routes in Jenkins VPC private route tables to Nginx API VPC via TGW
    props.jenkinsPrivateRouteTableIds.forEach((routeTableId, index) => {
      new ec2.CfnRoute(this, `JenkinsToNginxApiRoute${index}`, {
        routeTableId: routeTableId,
        destinationCidrBlock: props.nginxApiVpcCidr,
        transitGatewayId: transitGateway.ref,
      }).addDependency(jenkinsAttachment);
    });

    // Add routes in Nginx API VPC private route tables to Jenkins VPC via TGW
    props.nginxApiPrivateRouteTableIds.forEach((routeTableId, index) => {
      new ec2.CfnRoute(this, `NginxApiToJenkinsRoute${index}`, {
        routeTableId: routeTableId,
        destinationCidrBlock: props.jenkinsVpcCidr,
        transitGatewayId: transitGateway.ref,
      }).addDependency(nginxApiAttachment);
    });

    // Outputs
    new cdk.CfnOutput(this, 'TransitGatewayIdOutput', {
      value: transitGateway.ref,
      description: 'Transit Gateway ID for inter-VPC connectivity',
      exportName: 'TransitGatewayId',
    });

    new cdk.CfnOutput(this, 'TransitGatewayArnOutput', {
      value: this.transitGatewayArn,
      description: 'Transit Gateway ARN',
      exportName: 'TransitGatewayArn',
    });

    new cdk.CfnOutput(this, 'JenkinsVpcAttachmentIdOutput', {
      value: jenkinsAttachment.ref,
      description: 'Jenkins VPC Transit Gateway Attachment ID',
      exportName: 'JenkinsVpcTgwAttachmentId',
    });

    new cdk.CfnOutput(this, 'NginxApiVpcAttachmentIdOutput', {
      value: nginxApiAttachment.ref,
      description: 'Nginx API VPC Transit Gateway Attachment ID',
      exportName: 'NginxApiVpcTgwAttachmentId',
    });
  }
}
