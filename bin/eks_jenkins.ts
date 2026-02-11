#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NginxApiClusterStack } from '../lib/eks_nginx_api-stack';
import { JenkinsNetworkStack } from '../lib/network/jenkins-vpc/jenkins-network-stack';
import { NginxApiNetworkStack } from '../lib/network/nginx-api-vpc/nginx-api-network-stack';
import { TransitGatewayStack } from '../lib/network/transit-gateway-stack';
import { JenkinsStorageStack } from '../lib/jenkins/jenkins-storage-stack';
import { JenkinsEksClusterStack } from '../lib/jenkins/jenkins-eks-cluster-stack';
import { JenkinsEksNodeGroupsStack } from '../lib/jenkins/jenkins-eks-nodegroups-stack';
import { JenkinsAlbStack } from '../lib/jenkins/jenkins-alb-stack';
import { JenkinsApplicationStack } from '../lib/jenkins/jenkins-application-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-west-2'
};

// 1. Deploy Jenkins VPC Network Stack
const jenkinsNetworkStack = new JenkinsNetworkStack(app, 'JenkinsNetworkStack', {
  env,
  description: 'Jenkins VPC network infrastructure (10.0.0.0/16)',
});

// 2. Deploy Nginx API VPC Network Stack
const nginxApiNetworkStack = new NginxApiNetworkStack(app, 'NginxApiNetworkStack', {
  env,
  description: 'Nginx API VPC network infrastructure (10.1.0.0/16)',
});

// 3. Deploy Jenkins Storage Stack (EFS for persistent data)
const jenkinsStorageStack = new JenkinsStorageStack(app, 'JenkinsStorageStack', {
  env,
  description: 'Jenkins persistent storage (EFS with automated backups)',
  vpc: jenkinsNetworkStack.vpc,
  privateSubnetAzA: jenkinsNetworkStack.privateSubnetAzA,
  privateSubnetAzB: jenkinsNetworkStack.privateSubnetAzB,
});

// Storage stack depends on network stack
jenkinsStorageStack.addDependency(jenkinsNetworkStack);

// 4. Deploy Transit Gateway Stack (connects both VPCs)
const transitGatewayStack = new TransitGatewayStack(app, 'TransitGatewayStack', {
  env,
  description: 'Transit Gateway for inter-VPC connectivity',
  jenkinsVpcId: jenkinsNetworkStack.vpcId,
  jenkinsVpcCidr: '10.0.0.0/16',
  jenkinsPrivateSubnetIds: jenkinsNetworkStack.privateSubnetIds,
  jenkinsPrivateRouteTableIds: jenkinsNetworkStack.privateRouteTableIds,
  nginxApiVpcId: nginxApiNetworkStack.vpcId,
  nginxApiVpcCidr: '10.1.0.0/16',
  nginxApiPrivateSubnetIds: nginxApiNetworkStack.privateSubnetIds,
  nginxApiPrivateRouteTableIds: nginxApiNetworkStack.privateRouteTableIds,
});

// Transit Gateway depends on both network stacks
transitGatewayStack.addDependency(jenkinsNetworkStack);
transitGatewayStack.addDependency(nginxApiNetworkStack);

// 4. Deploy Transit Gateway Stack (connects both VPCs)
const jenkinsEksClusterStack = new JenkinsEksClusterStack(app, 'JenkinsEksClusterStack', {
  env,
  description: 'Jenkins EKS cluster infrastructure (Kubernetes 1.32)',
  vpc: jenkinsNetworkStack.vpc,
  privateSubnetAzA: jenkinsNetworkStack.privateSubnetAzA,
  privateSubnetAzB: jenkinsNetworkStack.privateSubnetAzB,
});

// Cluster stack depends on network stack
jenkinsEksClusterStack.addDependency(jenkinsNetworkStack);

// 5. Deploy Jenkins EKS Cluster Stack (foundational cluster only)

// 6. Deploy Jenkins EKS Node Groups Stack (controller and agent node groups)
const jenkinsEksNodeGroupsStack = new JenkinsEksNodeGroupsStack(app, 'JenkinsEksNodeGroupsStack', {
  env,
  description: 'Jenkins EKS node groups (on-demand controller + spot agents) and Cluster Autoscaler',
  cluster: jenkinsEksClusterStack.cluster,
  vpc: jenkinsNetworkStack.vpc,
  privateSubnetAzA: jenkinsNetworkStack.privateSubnetAzA,
  privateSubnetAzB: jenkinsNetworkStack.privateSubnetAzB,
});

// Node groups stack depends on cluster stack
jenkinsEksNodeGroupsStack.addDependency(jenkinsEksClusterStack);

// 7. Deploy Jenkins ALB Security Group Stack
const jenkinsAlbStack = new JenkinsAlbStack(app, 'JenkinsAlbStack', {
  env,
  description: 'Jenkins ALB security group with IP restrictions',
  vpc: jenkinsNetworkStack.vpc,
});

// ALB stack depends on network stack
jenkinsAlbStack.addDependency(jenkinsNetworkStack);

// 8. Deploy Jenkins Application Stack (Jenkins app + ALB + monitoring)
const jenkinsApplicationStack = new JenkinsApplicationStack(app, 'JenkinsApplicationStack', {
  env,
  description: 'Jenkins CI/CD application with ALB, S3 artifacts, and CloudWatch monitoring',
  cluster: jenkinsEksClusterStack.cluster,
  vpc: jenkinsNetworkStack.vpc,
  efsFileSystem: jenkinsStorageStack.efsFileSystem,
  albSecurityGroup: jenkinsAlbStack.albSecurityGroup,
});

// Application stack depends on cluster, storage, and ALB stacks
jenkinsApplicationStack.addDependency(jenkinsEksClusterStack);
jenkinsApplicationStack.addDependency(jenkinsStorageStack);
jenkinsApplicationStack.addDependency(jenkinsAlbStack);

// 9. Deploy Nginx API cluster (uses Nginx API VPC)
const nginxApiStack = new NginxApiClusterStack(app, 'NginxApiClusterStack', {
  env,
  description: 'Nginx REST API cluster on Amazon EKS with Karpenter and API Gateway',
  vpc: nginxApiNetworkStack.vpc,
  jenkinsVpcId: jenkinsNetworkStack.vpcId,
  jenkinsAccountId: process.env.CDK_DEFAULT_ACCOUNT || '',
});

// Nginx API stack depends on its network stack and Transit Gateway
nginxApiStack.addDependency(nginxApiNetworkStack);
nginxApiStack.addDependency(transitGatewayStack);

