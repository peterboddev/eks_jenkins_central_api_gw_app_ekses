import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * Jenkins EKS Cluster Stack Props
 */
export interface JenkinsEksClusterStackProps extends cdk.StackProps {
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
}

/**
 * Jenkins EKS Cluster Stack
 * 
 * This stack creates the foundational EKS cluster infrastructure:
 * - EKS cluster with Kubernetes 1.32
 * - OIDC provider for IRSA
 * - Cluster logging enabled
 * - kubectl Lambda layer
 * 
 * This stack is deployed once and rarely changes.
 * Node groups and applications are deployed in separate stacks.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
export class JenkinsEksClusterStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props: JenkinsEksClusterStackProps) {
    super(scope, id, props);
    
    // Store VPC reference
    this.vpc = props.vpc;

    // Create EKS cluster with Kubernetes version 1.32
    // Configure cluster in private subnets across 2 availability zones
    // Enable both private and public endpoint access
    // Enable all cluster logging types
    this.cluster = new eks.Cluster(this, 'JenkinsEksCluster', {
      clusterName: 'jenkins-eks-cluster',
      version: eks.KubernetesVersion.V1_32,
      
      // Use the VPC from JenkinsNetworkStack
      vpc: props.vpc,
      vpcSubnets: [
        { subnets: [props.privateSubnetAzA, props.privateSubnetAzB] }
      ],
      
      // Enable both private and public endpoint access
      // Requirement 1.5: Private endpoint access for API server communication
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      
      // No default capacity - we'll add node groups in JenkinsEksNodeGroupsStack
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
        code: lambda.Code.fromAsset(path.join(__dirname, '../../nginx-api/tmp/kubectl-layer.zip')),
        compatibleRuntimes: [
          lambda.Runtime.PYTHON_3_12,
          lambda.Runtime.PYTHON_3_13,
        ],
        description: 'kubectl binary for Kubernetes API access',
      }),
    });

    // Output EKS cluster information for reference
    new cdk.CfnOutput(this, 'EksClusterNameOutput', {
      value: this.cluster.clusterName,
      description: 'EKS Cluster Name',
      exportName: 'JenkinsEksClusterName',
    });

    new cdk.CfnOutput(this, 'EksClusterArnOutput', {
      value: this.cluster.clusterArn,
      description: 'EKS Cluster ARN',
      exportName: 'JenkinsEksClusterArn',
    });

    new cdk.CfnOutput(this, 'EksClusterEndpointOutput', {
      value: this.cluster.clusterEndpoint,
      description: 'EKS Cluster API Endpoint',
      exportName: 'JenkinsEksClusterEndpoint',
    });

    new cdk.CfnOutput(this, 'EksClusterVersionOutput', {
      value: '1.32',
      description: 'EKS Cluster Kubernetes Version',
      exportName: 'JenkinsEksClusterVersion',
    });
    
    new cdk.CfnOutput(this, 'EksClusterRoleArnOutput', {
      value: this.cluster.role.roleArn,
      description: 'IAM Role ARN for EKS Cluster',
      exportName: 'JenkinsEksClusterRoleArn',
    });

    // OIDC provider is automatically created by the L2 construct
    // Output OIDC provider information for reference
    new cdk.CfnOutput(this, 'OidcProviderArnOutput', {
      value: this.cluster.openIdConnectProvider.openIdConnectProviderArn,
      description: 'OIDC Provider ARN for EKS cluster (enables IRSA)',
      exportName: 'JenkinsEksOidcProviderArn',
    });

    new cdk.CfnOutput(this, 'OidcProviderIssuerOutput', {
      value: this.cluster.clusterOpenIdConnectIssuerUrl,
      description: 'OIDC Provider Issuer URL for EKS cluster',
      exportName: 'JenkinsEksOidcProviderIssuer',
    });

    // Grant cluster admin access to IAM user
    // This allows kubectl access for cluster management
    this.cluster.awsAuth.addUserMapping(
      iam.User.fromUserName(this, 'AdminUser', 'piotrbod'),
      {
        groups: ['system:masters'],
        username: 'piotrbod',
      }
    );

    // Note: Node instance roles will be added to aws-auth by JenkinsEksNodeGroupsStack
    // after the node groups are created to avoid circular dependencies
    
    // Configure CoreDNS addon with tolerations for tainted nodes
    // This ensures CoreDNS can run on nodes with workload-type taints
    const coreDnsAddon = new eks.CfnAddon(this, 'CoreDnsAddon', {
      clusterName: this.cluster.clusterName,
      addonName: 'coredns',
      resolveConflicts: 'OVERWRITE',
      configurationValues: JSON.stringify({
        tolerations: [
          {
            key: 'node-role.kubernetes.io/control-plane',
            effect: 'NoSchedule',
          },
          {
            key: 'CriticalAddonsOnly',
            operator: 'Exists',
          },
          {
            key: 'workload-type',
            operator: 'Exists',
            effect: 'NoSchedule',
          },
        ],
      }),
    });
    
    // CoreDNS addon depends on the cluster being created
    coreDnsAddon.node.addDependency(this.cluster);
  }
}
