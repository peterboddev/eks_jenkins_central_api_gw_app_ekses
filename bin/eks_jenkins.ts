#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { JenkinsEksStack } from '../lib/eks_jenkins-stack';
import { NginxApiClusterStack } from '../lib/eks_nginx_api-stack';

const app = new cdk.App();

// Deploy Jenkins EKS cluster in us-west-2 region
const jenkinsStack = new JenkinsEksStack(app, 'JenkinsEksStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: 'us-west-2' 
  },
  description: 'Jenkins CI/CD platform on Amazon EKS with spot instances',
});

// Deploy Nginx API cluster in us-west-2 region (separate VPC)
new NginxApiClusterStack(app, 'NginxApiClusterStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: 'us-west-2' 
  },
  description: 'Nginx REST API cluster on Amazon EKS with Karpenter and API Gateway',
  jenkinsVpcId: jenkinsStack.vpc.vpcId,
  jenkinsAccountId: process.env.CDK_DEFAULT_ACCOUNT || '',
});
