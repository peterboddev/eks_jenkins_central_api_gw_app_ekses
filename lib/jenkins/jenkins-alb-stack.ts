import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * Jenkins ALB Stack Props
 */
export interface JenkinsAlbStackProps extends cdk.StackProps {
  /**
   * VPC for the ALB
   */
  vpc: ec2.IVpc;
}

/**
 * Jenkins ALB Security Group Stack
 * 
 * This stack creates a security group for the Jenkins Application Load Balancer
 * with restricted access to:
 * - AWS IP ranges (for AWS services)
 * - Specific home/office IP addresses
 * 
 * This provides an additional layer of security beyond the ingress annotation.
 */
export class JenkinsAlbStack extends cdk.Stack {
  public readonly albSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: JenkinsAlbStackProps) {
    super(scope, id, props);

    // Load IP whitelist from security config file
    const ipWhitelistPath = path.join(__dirname, '../../security/alb-ip-whitelist.json');
    const ipWhitelist = JSON.parse(fs.readFileSync(ipWhitelistPath, 'utf8'));
    
    const homeIpAddress = ipWhitelist.homeIp;
    const additionalIps: string[] = ipWhitelist.additionalIps || [];

    // Create security group for ALB
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'JenkinsAlbSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Jenkins ALB with IP restrictions',
      allowAllOutbound: true,
    });

    // Add tags
    cdk.Tags.of(this.albSecurityGroup).add('Name', 'jenkins-alb-sg');
    cdk.Tags.of(this.albSecurityGroup).add('Purpose', 'Jenkins ALB Access Control');
    cdk.Tags.of(this.albSecurityGroup).add('ManagedBy', 'AWS CDK');

    // Allow HTTP from home IP
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(homeIpAddress),
      ec2.Port.tcp(80),
      'Allow HTTP from home IP'
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(homeIpAddress),
      ec2.Port.tcp(443),
      'Allow HTTPS from home IP'
    );

    // Allow HTTP/HTTPS from additional IPs
    additionalIps.forEach((ip, index) => {
      this.albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(ip),
        ec2.Port.tcp(80),
        `Allow HTTP from additional IP ${index + 1}`
      );

      this.albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(ip),
        ec2.Port.tcp(443),
        `Allow HTTPS from additional IP ${index + 1}`
      );
    });

    // Allow HTTP/HTTPS from AWS IP ranges
    // These are the primary AWS service IP ranges for us-west-2
    const awsIpRanges = [
      // CloudFront IP ranges (for potential CDN usage)
      '13.32.0.0/15',
      '13.35.0.0/16',
      '52.84.0.0/15',
      '54.192.0.0/16',
      '54.230.0.0/16',
      '99.84.0.0/16',
      '143.204.0.0/16',
      
      // EC2 IP ranges for us-west-2
      '35.80.0.0/12',
      '44.224.0.0/11',
      '52.32.0.0/11',
      '54.68.0.0/14',
      '54.184.0.0/13',
      '54.200.0.0/13',
      '54.212.0.0/15',
      '54.214.0.0/16',
      '54.244.0.0/16',
      '54.245.0.0/16',
    ];

    awsIpRanges.forEach((cidr, index) => {
      this.albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(cidr),
        ec2.Port.tcp(80),
        `Allow HTTP from AWS IP range ${index + 1}`
      );

      this.albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(cidr),
        ec2.Port.tcp(443),
        `Allow HTTPS from AWS IP range ${index + 1}`
      );
    });

    // Output security group ID
    new cdk.CfnOutput(this, 'AlbSecurityGroupIdOutput', {
      value: this.albSecurityGroup.securityGroupId,
      description: 'Security Group ID for Jenkins ALB',
      exportName: 'JenkinsAlbSecurityGroupId',
    });

    // Output reminder to update home IP
    new cdk.CfnOutput(this, 'HomeIpConfiguredOutput', {
      value: `Home IP: ${homeIpAddress}, Additional IPs: ${additionalIps.length}`,
      description: 'Configured IP addresses for Jenkins access',
    });
  }
}
