# Implementation Plan: Jenkins EKS Cluster

## Overview

This implementation plan breaks down the Jenkins EKS cluster deployment into discrete CDK TypeScript coding tasks. The infrastructure will be built incrementally, starting with foundational networking and EKS cluster, then adding storage, Jenkins controller, spot instance node groups, and supporting components. Each task builds on previous work and includes specific requirements references for traceability.

## Tasks

- [x] 1. Set up CDK project structure and core dependencies
  - Initialize CDK TypeScript project with `cdk init app --language typescript`
  - Install required CDK libraries: @aws-cdk/aws-eks, @aws-cdk/aws-ec2, @aws-cdk/aws-iam, @aws-cdk/aws-efs, @aws-cdk/aws-s3
  - Configure CDK context for region (us-west-2) and environment
  - Create main stack class `JenkinsEksStack`
  - _Requirements: 1.1_

- [x] 2. Implement VPC and networking infrastructure
  - [x] 2.1 Create VPC with CIDR 10.0.0.0/16
    - Define VPC with 2 availability zones (us-west-2a, us-west-2b)
    - Create private subnets: 10.0.1.0/24 (AZ-A), 10.0.2.0/24 (AZ-B)
    - Enable DNS hostnames and DNS resolution
    - _Requirements: 2.1, 2.2_
  
  - [x] 2.2 Add NAT Gateways for outbound connectivity
    - Create NAT Gateway in each availability zone
    - Allocate Elastic IPs for each NAT Gateway
    - Configure route tables for private subnets
    - _Requirements: 2.3_
  
  - [x] 2.3 Create VPC endpoints for AWS services
    - Add S3 Gateway endpoint (no cost)
    - Add Interface endpoints: ECR API, ECR Docker, EC2, STS, CloudWatch Logs
    - Associate endpoints with private subnets
    - _Requirements: 2.6_
  
  - [ ]* 2.4 Write unit tests for VPC configuration
    - Test VPC CIDR block is 10.0.0.0/16
    - Test 2 private subnets exist in different AZs
    - Test NAT Gateway count equals availability zone count
    - Test VPC endpoints are created
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

- [x] 3. Implement EKS cluster with IAM roles
  - [x] 3.1 Create EKS cluster IAM role
    - Define IAM role with AmazonEKSClusterPolicy
    - Configure trust relationship for EKS service
    - _Requirements: 1.1_
  
  - [x] 3.2 Create EKS cluster resource
    - Define EKS cluster with Kubernetes version 1.28 or later
    - Configure cluster in private subnets across 2 availability zones
    - Enable private endpoint access (no public endpoint)
    - Enable all cluster logging types (api, audit, authenticator, controllerManager, scheduler)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [ ]* 3.3 Write unit tests for EKS cluster configuration
    - Test cluster is in us-west-2 region
    - Test Kubernetes version is 1.28 or later
    - Test cluster spans at least 2 AZs
    - Test all logging types are enabled
    - Test private endpoint access is configured
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 4. Implement EFS file system for Jenkins storage
  - [x] 4.1 Create EFS file system
    - Define EFS file system with encryption enabled
    - Configure General Purpose performance mode
    - Configure Bursting throughput mode
    - Enable lifecycle management (transition to IA after 30 days)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.13_
  
  - [x] 4.2 Create EFS mount targets
    - Create mount target in each availability zone
    - Associate mount targets with private subnets
    - Create security group allowing NFS traffic (port 2049) from EKS worker nodes
    - _Requirements: 6.6, 6.7_
  
  - [x] 4.3 Configure EFS backup
    - Create AWS Backup plan for EFS
    - Configure daily backup schedule
    - Set backup retention to 30 days
    - _Requirements: 6.5_
  
  - [ ]* 4.4 Write unit tests for EFS configuration
    - Test EFS encryption is enabled
    - Test performance mode is General Purpose
    - Test mount targets exist in each AZ
    - Test security group allows NFS traffic
    - Test backup plan is configured with 30-day retention
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.13_

- [x] 5. Implement S3 bucket for artifacts and job state
  - [x] 5.1 Create S3 bucket
    - Define S3 bucket with name pattern: jenkins-{account-id}-{region}-artifacts
    - Enable versioning
    - Enable SSE-S3 encryption
    - Configure lifecycle policy (transition to Intelligent-Tiering after 30 days, delete after 90 days)
    - _Requirements: 6.12, 7.1, 7.5_
  
  - [ ]* 5.2 Write unit tests for S3 bucket configuration
    - Test bucket versioning is enabled
    - Test encryption is enabled
    - Test lifecycle policy is configured
    - _Requirements: 6.12, 7.1, 7.5_

- [x] 6. Implement IAM roles for IRSA
  - [x] 6.1 Create OIDC provider for EKS cluster
    - Configure OIDC identity provider for the EKS cluster
    - _Requirements: 5.3_
  
  - [x] 6.2 Create Jenkins controller IAM role
    - Define IAM role with trust policy for IRSA
    - Add permissions for CloudFormation, S3, DynamoDB, EC2, VPC, IAM, EKS, STS
    - Configure session duration to 3600 seconds
    - _Requirements: 5.1, 5.2, 5.5, 5.7_
  
  - [x] 6.3 Create Cluster Autoscaler IAM role
    - Define IAM role with trust policy for IRSA
    - Add permissions for Auto Scaling and EC2 operations
    - Add condition for cluster-autoscaler tag
    - _Requirements: 8.1_
  
  - [x] 6.4 Create EFS CSI Driver IAM role
    - Define IAM role with trust policy for IRSA
    - Add permissions for EFS operations (DescribeAccessPoints, CreateAccessPoint, etc.)
    - _Requirements: 6.8_
  
  - [ ]* 6.5 Write unit tests for IAM roles
    - Test Jenkins controller role has required permissions
    - Test IRSA trust relationships are configured correctly
    - Test session duration is at least 3600 seconds
    - Test Cluster Autoscaler role has required permissions
    - Test EFS CSI Driver role has required permissions
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 6.8, 8.1_

- [x] 7. Implement EKS node groups
  - [x] 7.1 Create controller node group (on-demand)
    - Define node group with instance types: t3.large, t3.xlarge
    - Set capacity type to ON_DEMAND
    - Configure min/max/desired: 1/2/1
    - Add label: workload-type=jenkins-controller
    - Add taint: workload-type=jenkins-controller:NoSchedule
    - Create IAM role with EKS worker node policies
    - _Requirements: 3.9, 4.8_
  
  - [x] 7.2 Create agent node group (spot)
    - Define node group with instance types: m5.large, m5.xlarge, m5a.large, m5a.xlarge, m6i.large, m6i.xlarge
    - Set capacity type to SPOT
    - Enable capacity rebalancing
    - Configure min/max/desired: 2/10/2
    - Add labels: workload-type=jenkins-agent, node-lifecycle=spot
    - Create IAM role with EKS worker node policies
    - Add node group tags for Cluster Autoscaler auto-discovery
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.7_
  
  - [ ]* 7.3 Write unit tests for node group configuration
    - Test controller node group uses ON_DEMAND capacity
    - Test controller node group has correct labels and taints
    - Test agent node group uses SPOT capacity
    - Test agent node group has correct instance types
    - Test agent node group has min 2, max 10 nodes
    - Test agent node group has Cluster Autoscaler tags
    - _Requirements: 3.9, 4.1, 4.2, 4.5, 4.7, 4.8_

- [x] 8. Install and configure EFS CSI Driver
  - [x] 8.1 Deploy EFS CSI Driver
    - Install EFS CSI Driver using Helm chart or Kubernetes manifests
    - Create service account with IRSA annotation for EFS CSI Driver IAM role
    - Deploy CSI controller (Deployment) and node plugin (DaemonSet)
    - _Requirements: 6.8_
  
  - [x] 8.2 Create EFS storage class
    - Define StorageClass with provisioner: efs.csi.aws.com
    - Configure provisioning mode: efs-ap (EFS Access Points)
    - Set file system ID, directory permissions, GID range
    - Set base path: /jenkins
    - _Requirements: 6.8, 6.9_
  
  - [ ]* 8.3 Write unit tests for EFS CSI Driver
    - Test EFS CSI Driver pods are running
    - Test storage class is created with correct parameters
    - Test service account has IRSA annotation
    - _Requirements: 6.8, 6.9_

- [x] 9. Deploy Jenkins controller
  - [x] 9.1 Create Jenkins namespace and service account
    - Create Kubernetes namespace: jenkins
    - Create service account: jenkins-controller
    - Add IRSA annotation with Jenkins controller IAM role ARN
    - _Requirements: 5.3, 5.4_
  
  - [x] 9.2 Create Jenkins controller StatefulSet
    - Define StatefulSet with 1 replica
    - Use image: jenkins/jenkins:lts
    - Configure resource requests: 2 CPU, 4Gi memory
    - Configure resource limits: 4 CPU, 8Gi memory
    - Add node selector: workload-type=jenkins-controller
    - Add toleration for jenkins-controller taint
    - Configure environment variables (JAVA_OPTS, JENKINS_OPTS)
    - _Requirements: 3.1, 3.3, 3.9_
  
  - [x] 9.3 Create persistent volume claim for Jenkins home
    - Define PVC with storage class: efs-sc
    - Set access mode: ReadWriteMany
    - Set storage request: 100Gi (symbolic, EFS grows automatically)
    - Mount to /var/jenkins_home
    - _Requirements: 3.2, 6.1, 6.9_
  
  - [x] 9.4 Create Jenkins service
    - Define ClusterIP service
    - Expose port 8080 (HTTP) and port 50000 (JNLP)
    - _Requirements: 3.4_
  
  - [x] 9.5 Configure Jenkins pod restart policy
    - Set restart policy to Always
    - _Requirements: 3.6_
  
  - [ ]* 9.6 Write unit tests for Jenkins controller deployment
    - Test StatefulSet has 1 replica
    - Test resource requests and limits are correct
    - Test PVC uses efs-sc storage class with ReadWriteMany
    - Test service exposes ports 8080 and 50000
    - Test pod uses correct service account
    - Test node selector and tolerations are configured
    - Test restart policy is Always
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.9, 6.1, 6.9_

- [x] 10. Configure Jenkins agent pod template
  - [x] 10.1 Create Jenkins agent pod template configuration
    - Define pod template in Jenkins configuration (via ConfigMap or Jenkins Configuration as Code)
    - Use image: jenkins/inbound-agent:latest
    - Configure resource requests: 1 CPU, 2Gi memory
    - Configure resource limits: 2 CPU, 4Gi memory
    - Add node affinity to prefer spot instance nodes
    - Add pod anti-affinity to avoid controller nodes
    - Configure JENKINS_URL environment variable
    - _Requirements: 3.8, 4.6_
  
  - [ ]* 10.2 Write unit tests for agent pod template
    - Test pod template has correct resource requests and limits
    - Test node affinity prefers spot nodes
    - Test pod anti-affinity avoids controller nodes
    - _Requirements: 3.8, 4.6_

- [x] 11. Deploy Cluster Autoscaler
  - [x] 11.1 Create Cluster Autoscaler deployment
    - Create service account: cluster-autoscaler (in kube-system namespace)
    - Add IRSA annotation with Cluster Autoscaler IAM role ARN
    - Deploy Cluster Autoscaler with image: registry.k8s.io/autoscaling/cluster-autoscaler:v1.28.0
    - Configure command line flags for AWS provider and auto-discovery
    - Set scale down delay to 10 minutes
    - Set scale down utilization threshold to 0.5
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  
  - [ ]* 11.2 Write unit tests for Cluster Autoscaler
    - Test Cluster Autoscaler deployment exists
    - Test service account has IRSA annotation
    - Test command line flags are configured correctly
    - _Requirements: 8.1, 8.2, 8.5, 8.6_

- [x] 12. Deploy AWS Node Termination Handler
  - [x] 12.1 Create Node Termination Handler DaemonSet
    - Deploy DaemonSet with image: public.ecr.aws/aws-ec2/aws-node-termination-handler:latest
    - Configure to run on spot instance nodes only
    - Enable spot interruption draining
    - Enable scheduled event draining
    - Set pod termination grace period to 120 seconds
    - Set node termination grace period to 120 seconds
    - _Requirements: 4.4, 7.2, 7.7_
  
  - [ ]* 12.2 Write unit tests for Node Termination Handler
    - Test DaemonSet is deployed
    - Test DaemonSet runs on spot nodes only
    - Test termination grace periods are configured
    - _Requirements: 4.4, 7.2, 7.7_

- [x] 13. Configure security groups
  - [x] 13.1 Create Jenkins controller security group
    - Allow inbound port 8080 from VPC CIDR
    - Allow inbound port 50000 from agent security group
    - Allow all outbound traffic
    - _Requirements: 2.4_
  
  - [x] 13.2 Create Jenkins agent security group
    - Allow inbound ephemeral ports from controller security group
    - Allow all outbound traffic
    - _Requirements: 2.5_
  
  - [ ]* 13.3 Write unit tests for security groups
    - Test controller security group allows port 8080 and 50000
    - Test agent security group allows ephemeral ports
    - _Requirements: 2.4, 2.5_

- [x] 14. Configure monitoring and observability
  - [x] 14.1 Enable CloudWatch Container Insights
    - Install CloudWatch agent and Fluent Bit for log collection
    - Configure Container Insights for EKS cluster
    - _Requirements: 10.1, 10.3_
  
  - [x] 14.2 Create CloudWatch alarms
    - Create alarm for cluster health
    - Create alarm for node failures
    - Create alarm for disk space
    - Create alarm for pending pods exceeding threshold
    - Create alarm for spot instance interruptions
    - _Requirements: 10.4, 10.5_
  
  - [x]* 14.3 Create monitoring dashboards
    - Create CloudWatch dashboard showing build queue length
    - Create dashboard showing agent utilization
    - Create dashboard showing job success rates
    - _Requirements: 10.6_
  
  - [ ]* 14.4 Write unit tests for monitoring configuration
    - Test Container Insights is enabled
    - Test CloudWatch alarms are created
    - _Requirements: 10.1, 10.3, 10.4, 10.5_

- [x] 15. Write property-based tests
  - [x] 15.1 Write property test for data persistence across pod restarts
    - Implement test that writes data to Jenkins home on EFS
    - Restart Jenkins controller pod
    - Verify data is still present after restart
    - Run minimum 100 iterations
    - Tag: **Feature: jenkins-eks-cluster, Property 1: Data Persistence Across Pod Restarts**
    - _Requirements: 3.7_
  
  - [x] 15.2 Write property test for persistent volume remounting
    - Implement test that captures EFS mount info
    - Delete and reschedule Jenkins controller pod
    - Verify EFS is remounted to new pod
    - Run minimum 100 iterations
    - Tag: **Feature: jenkins-eks-cluster, Property 2: Persistent Volume Remounting**
    - _Requirements: 6.10_

- [ ] 16. Write integration tests
  - [ ]* 16.1 Write end-to-end deployment test
    - Deploy complete infrastructure to test environment
    - Verify all resources are created successfully
    - Verify Jenkins controller starts and is accessible
    - Verify agent pods can connect to controller
    - Clean up test resources
    - _Requirements: All_
  
  - [ ]* 16.2 Write spot interruption handling test
    - Simulate spot instance interruption
    - Verify node is cordoned and drained
    - Verify pods are rescheduled
    - Verify job state is preserved
    - _Requirements: 4.4, 7.1, 7.2, 7.3, 7.4_
  
  - [ ]* 16.3 Write autoscaling behavior test
    - Queue multiple Jenkins jobs
    - Verify Cluster Autoscaler provisions new nodes
    - Verify jobs execute on new nodes
    - Verify nodes scale down after jobs complete
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 17. Create deployment documentation
  - [x]* 17.1 Document deployment procedures
    - Create README with deployment instructions
    - Document prerequisites (AWS CLI, kubectl, CDK)
    - Document configuration parameters
    - Document post-deployment verification steps
  
  - [x]* 17.2 Document recovery procedures
    - Document backup restoration process
    - Document disaster recovery procedures
    - Document troubleshooting common issues
    - _Requirements: 11.5_