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
 * with restricted access to specific IP addresses defined in security/alb-ip-whitelist.json
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
    const githubWebhookIps: string[] = ipWhitelist.githubWebhookIps || [];

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

    // Allow HTTP from GitHub webhook IP ranges
    // Source: https://api.github.com/meta (hooks field)
    // Update security/alb-ip-whitelist.json to modify these IPs
    githubWebhookIps.forEach((ip) => {
      this.albSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(ip),
        ec2.Port.tcp(80),
        'GitHub Webhooks'
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
