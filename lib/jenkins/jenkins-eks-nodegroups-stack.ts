import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';

/**
 * Jenkins EKS Node Groups Stack Props
 */
export interface JenkinsEksNodeGroupsStackProps extends cdk.StackProps {
  /**
   * EKS cluster (imported from JenkinsEksClusterStack)
   */
  cluster: eks.ICluster;
  
  /**
   * VPC for the node groups
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
 * Jenkins EKS Node Groups Stack
 * 
 * This stack creates EKS node groups and Cluster Autoscaler:
 * - Controller node group (on-demand instances)
 * - Agent node group (spot instances)
 * - Cluster Autoscaler service account with IRSA
 * - Node security groups
 * 
 * This stack depends on JenkinsEksClusterStack.
 * Changes to node groups don't require cluster redeployment.
 * 
 * Requirements: 3.9, 4.1, 4.2, 4.3, 4.5, 4.7, 4.8, 8.1
 */
export class JenkinsEksNodeGroupsStack extends cdk.Stack {
  public readonly controllerNodeGroup: cdk.aws_eks.CfnNodegroup;
  public readonly agentNodeGroup: cdk.aws_eks.CfnNodegroup;
  public readonly controllerNodeRole: iam.Role;
  public readonly agentNodeRole: iam.Role;

  constructor(scope: Construct, id: string, props: JenkinsEksNodeGroupsStackProps) {
    super(scope, id, props);

    // Task 7.1: Create controller node group (on-demand)
    // Requirements: 3.9, 4.8
    
    // Create IAM role for EKS worker nodes (controller node group)
    // This role allows EC2 instances to join the EKS cluster and pull container images
    // Requirements: 3.9 - Jenkins controller runs on on-demand instances
    // Requirements: 4.8 - Jenkins controller has anti-affinity rules to NOT schedule on spot instances
    this.controllerNodeRole = new iam.Role(this, 'ControllerNodeRole', {
      roleName: `jenkins-eks-controller-node-role-${this.region}`,
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
      value: this.controllerNodeRole.roleArn,
      description: 'IAM Role ARN for EKS controller node group',
      exportName: 'JenkinsEksControllerNodeRoleArn',
    });

    // Create controller node group with on-demand instances
    // This node group will host the Jenkins controller pod
    // Requirements: 3.9 - Jenkins controller runs on on-demand instances to ensure high availability
    
    // Create launch template with user data to install nfs-utils
    const controllerLaunchTemplate = new ec2.CfnLaunchTemplate(this, 'ControllerLaunchTemplate', {
      launchTemplateName: 'jenkins-controller-node-template',
      launchTemplateData: {
        userData: cdk.Fn.base64(`MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="==MYBOUNDARY=="

--==MYBOUNDARY==
Content-Type: text/x-shellscript; charset="us-ascii"

#!/bin/bash
# Install nfs-utils for EFS mounting
dnf install -y nfs-utils

--==MYBOUNDARY==--
`),
      },
    });
    
    this.controllerNodeGroup = new cdk.aws_eks.CfnNodegroup(this, 'ControllerNodeGroup', {
      clusterName: props.cluster.clusterName,
      nodegroupName: 'jenkins-controller-nodegroup',
      nodeRole: this.controllerNodeRole.roleArn,
      
      // Use launch template
      launchTemplate: {
        id: controllerLaunchTemplate.ref,
        version: controllerLaunchTemplate.attrLatestVersionNumber,
      },
      
      // Deploy nodes in private subnets across both availability zones
      subnets: [props.privateSubnetAzA.subnetId, props.privateSubnetAzB.subnetId],
      
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

    // Output controller node group information for reference
    new cdk.CfnOutput(this, 'ControllerNodeGroupNameOutput', {
      value: this.controllerNodeGroup.nodegroupName!,
      description: 'EKS Controller Node Group Name',
      exportName: 'JenkinsEksControllerNodeGroupName',
    });

    new cdk.CfnOutput(this, 'ControllerNodeGroupArnOutput', {
      value: this.controllerNodeGroup.attrArn,
      description: 'EKS Controller Node Group ARN',
      exportName: 'JenkinsEksControllerNodeGroupArn',
    });

    // Task 7.2: Create agent node group (spot)
    // Requirements: 4.1, 4.2, 4.3, 4.5, 4.7
    
    // Create IAM role for EKS worker nodes (agent node group)
    // This role allows EC2 instances to join the EKS cluster and pull container images
    // Requirements: 4.1 - Node group for Jenkins agents uses EC2 spot instances
    // Requirements: 4.2 - Node group includes multiple instance types for spot availability
    this.agentNodeRole = new iam.Role(this, 'AgentNodeRole', {
      roleName: `jenkins-eks-agent-node-role-${this.region}`,
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
      value: this.agentNodeRole.roleArn,
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
    this.agentNodeGroup = new cdk.aws_eks.CfnNodegroup(this, 'AgentNodeGroup', {
      clusterName: props.cluster.clusterName,
      nodegroupName: 'jenkins-agent-nodegroup',
      nodeRole: this.agentNodeRole.roleArn,
      
      // Deploy nodes in private subnets across both availability zones
      subnets: [props.privateSubnetAzA.subnetId, props.privateSubnetAzB.subnetId],
      
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

    // Output agent node group information for reference
    new cdk.CfnOutput(this, 'AgentNodeGroupNameOutput', {
      value: this.agentNodeGroup.nodegroupName!,
      description: 'EKS Agent Node Group Name',
      exportName: 'JenkinsEksAgentNodeGroupName',
    });

    new cdk.CfnOutput(this, 'AgentNodeGroupArnOutput', {
      value: this.agentNodeGroup.attrArn,
      description: 'EKS Agent Node Group ARN',
      exportName: 'JenkinsEksAgentNodeGroupArn',
    });

    // Task 6.3: Create Cluster Autoscaler IAM role and service account
    // Requirements: 8.1
    
    // Create IAM policy document for Cluster Autoscaler with IRSA (IAM Roles for Service Accounts)
    // This role allows the Cluster Autoscaler to automatically scale EKS node groups
    // Requirement 8.1: Cluster Autoscaler installed and configured
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

    // Create Cluster Autoscaler service account with IRSA
    // This automatically creates the IAM role and adds the correct IRSA annotation
    const clusterAutoscalerServiceAccount = props.cluster.addServiceAccount('ClusterAutoscalerServiceAccount', {
      name: 'cluster-autoscaler',
      namespace: 'kube-system',
    });
    
    // Attach the Cluster Autoscaler policy to the auto-created role
    clusterAutoscalerServiceAccount.role.attachInlinePolicy(new iam.Policy(this, 'ClusterAutoscalerInlinePolicy', {
      policyName: 'ClusterAutoscalerPolicy',
      document: clusterAutoscalerPolicyDocument,
    }));
    
    // Output Cluster Autoscaler service account information
    new cdk.CfnOutput(this, 'ClusterAutoscalerServiceAccountRoleArnOutput', {
      value: clusterAutoscalerServiceAccount.role.roleArn,
      description: 'IAM Role ARN for Cluster Autoscaler service account (auto-created by CDK)',
      exportName: 'JenkinsEksClusterAutoscalerRoleArn',
    });

    // Task 13.1: Create Jenkins controller security group
    // Requirements: 2.4
    
    // Create security group for Jenkins controller
    // This security group controls inbound and outbound traffic for the Jenkins controller pod
    // Requirement 2.4: Jenkins controller security group allows inbound traffic on ports 8080 and 50000
    const jenkinsControllerSecurityGroup = new ec2.CfnSecurityGroup(this, 'JenkinsControllerSecurityGroup', {
      groupDescription: 'Security group for Jenkins controller - allows HTTP (8080) and JNLP (50000) traffic',
      vpcId: props.vpc.vpcId,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 8080,
          toPort: 8080,
          cidrIp: props.vpc.vpcCidrBlock,
          description: 'Allow HTTP traffic from VPC CIDR for Jenkins web UI',
        },
        {
          ipProtocol: 'tcp',
          fromPort: 50000,
          toPort: 50000,
          cidrIp: props.vpc.vpcCidrBlock,
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
      vpcId: props.vpc.vpcId,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 32768,
          toPort: 65535,
          cidrIp: props.vpc.vpcCidrBlock,
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
  }
}
