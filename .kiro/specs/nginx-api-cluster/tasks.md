# Implementation Plan: nginx-api-cluster

## Overview

This implementation plan creates a complete EKS cluster infrastructure with API Gateway integration, following a multi-VPC architecture pattern. The implementation uses AWS CDK for infrastructure provisioning, Karpenter for dynamic node scaling, and Helm for application deployment.

## Tasks

- [x] 1. Set up CDK project structure and dependencies
  - Create new CDK TypeScript project for nginx-api-cluster
  - Install required CDK libraries (@aws-cdk/aws-ec2, @aws-cdk/aws-eks, @aws-cdk/aws-apigatewayv2, etc.)
  - Configure CDK context with Jenkins VPC ID and account details
  - Set up TypeScript configuration for CDK
  - _Requirements: 10.1_

- [x] 2. Implement VPC infrastructure
  - [x] 2.1 Create VPC with public and private subnets
    - Define VPC with CIDR 10.1.0.0/16
    - Create 2 public subnets (10.1.0.0/24, 10.1.1.0/24) across 2 AZs
    - Create 2 private subnets (10.1.10.0/24, 10.1.11.0/24) across 2 AZs
    - Add Internet Gateway for public subnets
    - Add NAT Gateways in each public subnet
    - Configure route tables for public and private routing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [x] 2.2 Add subnet tags for EKS and Karpenter
    - Tag public subnets with kubernetes.io/role/elb=1
    - Tag private subnets with kubernetes.io/role/internal-elb=1
    - Tag all subnets with kubernetes.io/cluster/<cluster-name>=shared
    - Tag private subnets with karpenter.sh/discovery=<cluster-name>
    - _Requirements: 1.2, 1.3_

- [x] 3. Implement EKS cluster
  - [x] 3.1 Create EKS cluster with control plane
    - Create EKS cluster in private subnets
    - Configure Kubernetes version 1.28
    - Enable control plane logging (audit, authenticator, controller manager)
    - Enable secrets encryption with KMS
    - Configure cluster IAM role with AmazonEKSClusterPolicy
    - _Requirements: 2.1, 2.3, 2.4, 11.5, 12.1_
  
  - [x] 3.2 Configure cluster security groups
    - Create security group for cluster control plane
    - Allow inbound 443 from Jenkins VPC CIDR (10.0.0.0/16)
    - Create security group for worker nodes
    - Allow all traffic within cluster security group
    - Allow 443 to control plane security group
    - _Requirements: 2.3, 8.6, 11.3_
  
  - [x] 3.3 Output cluster configuration
    - Export cluster name as CDK output
    - Export cluster endpoint as CDK output
    - Generate and export kubeconfig
    - _Requirements: 2.5_

- [x] 4. Checkpoint - Verify EKS cluster is created
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Karpenter infrastructure
  - [x] 5.1 Create IAM roles for Karpenter
    - Create Karpenter node IAM role with policies:
      - AmazonEKSWorkerNodePolicy
      - AmazonEKS_CNI_Policy
      - AmazonEC2ContainerRegistryReadOnly
      - AmazonSSMManagedInstanceCore
      - Custom policy for cross-account ECR access (Jenkins account)
    - Create Karpenter controller IAM role with policies:
      - EC2 instance management permissions
      - IAM PassRole for node role
      - SQS permissions for interruption handling
      - Pricing API permissions
    - Create instance profile for Karpenter nodes
    - _Requirements: 2.3, 11.6_
  
  - [x] 5.2 Create Karpenter interruption queue
    - Create SQS queue for EC2 spot interruption notifications
    - Configure EventBridge rules for EC2 instance state changes
    - Grant Karpenter controller access to SQS queue
    - _Requirements: N/A (Karpenter best practice)_
  
  - [x] 5.3 Tag security groups and subnets for Karpenter discovery
    - Tag node security group with karpenter.sh/discovery=<cluster-name>
    - Tag private subnets with karpenter.sh/discovery=<cluster-name>
    - _Requirements: N/A (Karpenter requirement)_

- [x] 6. Deploy Karpenter controller
  - [x] 6.1 Install Karpenter via Helm
    - Add Karpenter Helm repository
    - Create Kubernetes service account for Karpenter with IAM role annotation
    - Install Karpenter Helm chart with configuration:
      - Cluster name and endpoint
      - Instance profile
      - Interruption queue
      - 2 replicas for HA
    - _Requirements: N/A (Karpenter deployment)_
  
  - [x] 6.2 Create Karpenter Provisioner
    - Create Provisioner resource with:
      - On-demand capacity type
      - Instance types: t3.medium, t3.large, t3a.medium, t3a.large
      - CPU limit: 100
      - Memory limit: 100Gi
      - TTL after empty: 30 seconds
      - TTL until expired: 7 days
    - _Requirements: N/A (Karpenter configuration)_
  
  - [x] 6.3 Create AWSNodeTemplate
    - Create AWSNodeTemplate with:
      - Subnet selector using karpenter.sh/discovery tag
      - Security group selector using karpenter.sh/discovery tag
      - Instance profile reference
      - EBS volume configuration (20Gi gp3, encrypted)
      - User data for EKS bootstrap
    - _Requirements: N/A (Karpenter configuration)_

- [x] 7. Implement AWS Load Balancer Controller infrastructure
  - [x] 7.1 Create IAM role for ALB Controller
    - Create IAM role with AWSLoadBalancerControllerIAMPolicy
    - Configure trust relationship for EKS service account
    - _Requirements: 3.1, 3.4, 3.5, 3.6_
  
  - [x] 7.2 Deploy ALB Controller via Helm
    - Add EKS Helm repository
    - Create Kubernetes service account with IAM role annotation
    - Install AWS Load Balancer Controller Helm chart
    - Verify controller pods are running
    - _Requirements: 3.2, 3.3_

- [ ] 8. Implement Transit Gateway connectivity
  - [x] 8.1 Create or reference Transit Gateway
    - Check if Transit Gateway exists (from Jenkins cluster)
    - Create new Transit Gateway if not exists
    - _Requirements: 8.1_
  
  - [x] 8.2 Attach VPCs to Transit Gateway
    - Create Transit Gateway attachment for API VPC
    - Create Transit Gateway attachment for Jenkins VPC (if not exists)
    - Wait for attachments to become available
    - _Requirements: 8.2, 8.3_
  
  - [x] 8.3 Configure route tables for cross-VPC routing
    - Add route in API VPC private subnets: 10.0.0.0/16 → Transit Gateway
    - Add route in Jenkins VPC private subnets: 10.1.0.0/16 → Transit Gateway
    - _Requirements: 8.4, 8.5_

- [ ] 9. Checkpoint - Verify Transit Gateway connectivity
  - Ensure all tests pass, ask the user if questions arise.

- [-] 10. Create nginx API application Docker image
  - [ ] 10.1 Create nginx configuration file
    - Write nginx.conf with server blocks for:
      - /health endpoint (returns JSON with status and timestamp)
      - /api/info endpoint (returns JSON with app metadata)
      - /api/echo endpoint (proxies to echo server)
    - Create echo server configuration on port 8081
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [ ] 10.2 Create Dockerfile
    - Base image: nginx:alpine
    - Copy nginx configuration
    - Expose port 8080
    - Set up health check
    - _Requirements: 4.1_
  
  - [ ] 10.3 Build and push image to Jenkins ECR
    - Build Docker image
    - Tag image with Jenkins account ECR repository
    - Push image to Jenkins ECR
    - _Requirements: 4.8_

- [x] 11. Create Helm chart for nginx API application
  - [x] 11.1 Create Helm chart structure
    - Create Chart.yaml with metadata
    - Create values.yaml with default configuration
    - Create templates directory
    - Create _helpers.tpl with template functions
    - _Requirements: 9.1, 9.2_
  
  - [x] 11.2 Create Kubernetes resource templates
    - Create deployment.yaml template with:
      - 3 replicas
      - Container image from values
      - Resource requests/limits
      - Liveness and readiness probes
    - Create service.yaml template with ClusterIP type
    - Create ingress.yaml template with ALB annotations
    - _Requirements: 4.5, 4.6, 4.7, 9.2_
  
  - [x] 11.3 Configure Helm values
    - Set default replica count to 3
    - Set image repository to Jenkins ECR
    - Configure ingress annotations for internet-facing ALB
    - Configure resource requests and limits
    - _Requirements: 9.3_

- [ ] 12. Implement API Gateway
  - [x] 12.1 Create security group for ALB
    - Create security group for public ALB
    - Add inbound rule: port 443 from API Gateway managed prefix list
    - Add outbound rule: all traffic to VPC CIDR
    - _Requirements: 5.6, 5.8, 11.2_
  
  - [x] 12.2 Create API Gateway HTTP API
    - Create HTTP API (not REST API)
    - Configure CORS for GET and POST methods
    - Enable access logging to CloudWatch
    - _Requirements: 7.1, 7.3, 12.4_
  
  - [x] 12.3 Configure API Gateway routes
    - Create route for GET /health
    - Create route for ANY /api/{proxy+}
    - Configure HTTP integration to ALB DNS (will be set after ALB creation)
    - _Requirements: 7.4, 7.5, 7.6_
  
  - [x] 12.4 Output API Gateway URL
    - Export API Gateway URL as CDK output
    - _Requirements: 7.8_

- [ ] 13. Implement CloudWatch logging
  - [x] 13.1 Create CloudWatch log groups
    - Create log group for EKS control plane logs
    - Create log group for API Gateway access logs
    - Create S3 bucket for ALB access logs
    - _Requirements: 12.1, 12.3, 12.4, 12.5_

- [ ] 14. Deploy CDK stack
  - [ ] 14.1 Synthesize and deploy CDK stack
    - Run cdk synth to generate CloudFormation template
    - Run cdk deploy to provision infrastructure
    - Capture stack outputs (API Gateway URL, cluster name, kubeconfig)
    - _Requirements: All infrastructure requirements_
  
  - [ ] 14.2 Configure kubectl access
    - Update kubeconfig with API cluster credentials
    - Verify kubectl connectivity from local machine
    - _Requirements: 2.5_

- [ ] 15. Deploy nginx API application
  - [x] 15.1 Get ALB DNS name
    - Wait for ALB to be provisioned by ALB Controller
    - Get ALB DNS name from Ingress status
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 15.2 Update API Gateway integration
    - Update API Gateway HTTP integration with ALB DNS name
    - Deploy API Gateway changes
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 15.3 Deploy application via Helm
    - Package Helm chart
    - Install Helm release with values:
      - Certificate ARN for ALB
      - Security group ID for ALB
      - Cluster name for /api/info endpoint
    - Verify pods are running
    - Verify ALB target groups have healthy targets
    - _Requirements: 9.4, 9.5_

- [x] 16. Checkpoint - Verify end-to-end connectivity
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. Test API endpoints
  - [x] 17.1 Test health endpoint
    - Send GET request to API Gateway URL /health
    - Verify HTTP 200 response
    - Verify JSON contains "status" and "timestamp" fields
    - _Requirements: 4.2_
  
  - [x] 17.2 Test info endpoint
    - Send GET request to API Gateway URL /api/info
    - Verify HTTP 200 response
    - Verify JSON contains "app", "version", and "cluster" fields
    - _Requirements: 4.3_
  
  - [x] 17.3 Test echo endpoint
    - Send POST request to API Gateway URL /api/echo with JSON body
    - Verify HTTP 200 response
    - Verify response body matches request body
    - _Requirements: 4.4_

- [ ]* 18. Write property-based tests
  - [ ]* 18.1 Property test for API Gateway request forwarding
    - **Property 1: API Gateway Request Forwarding Preservation**
    - **Validates: Requirements 6.4, 7.6**
    - Generate random HTTP requests with various paths, methods, headers, and bodies
    - Send through API Gateway
    - Verify all request attributes are preserved
  
  - [ ]* 18.2 Property test for API Gateway response forwarding
    - **Property 2: API Gateway Response Forwarding Transparency**
    - **Validates: Requirements 6.5**
    - Generate random responses from ALB
    - Verify API Gateway returns them without modification
  
  - [ ]* 18.3 Property test for echo endpoint round-trip
    - **Property 3: Echo Endpoint Round-Trip Identity**
    - **Validates: Requirements 4.4**
    - Generate random request bodies
    - POST to /api/echo
    - Verify response body matches input
  
  - [ ]* 18.4 Property test for health endpoint availability
    - **Property 4: Health Endpoint Availability**
    - **Validates: Requirements 4.2**
    - Call /health endpoint multiple times
    - Verify always returns 200 with required fields
  
  - [ ]* 18.5 Property test for info endpoint metadata
    - **Property 5: Info Endpoint Metadata Completeness**
    - **Validates: Requirements 4.3**
    - Call /api/info endpoint multiple times
    - Verify always returns 200 with required fields

- [ ]* 19. Write integration tests
  - [ ]* 19.1 Test kubectl access from Jenkins
    - Execute kubectl get nodes from Jenkins pod
    - Verify command succeeds via Transit Gateway
    - _Requirements: 8.7_
  
  - [ ]* 19.2 Test cross-account ECR image pull
    - Deploy test pod with image from Jenkins ECR
    - Verify pod successfully pulls image
    - Verify pod starts successfully
    - _Requirements: 4.8, 11.6_
  
  - [ ]* 19.3 Test ALB security group restrictions
    - Attempt to connect to ALB directly (not through API Gateway)
    - Verify connection is rejected
    - _Requirements: 5.8_

- [x] 20. Final checkpoint - Verify all functionality
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Refactor EKS version configuration to be deterministic
  - [ ] 21.1 Create shared constants file
    - Create `lib/constants.ts` with EKS_VERSION constant
    - Export constant for use across all stacks
    - _Requirements: Version standardization_
  
  - [ ] 21.2 Update both stacks to use shared constant
    - Import EKS_VERSION in `lib/eks_jenkins-stack.ts`
    - Import EKS_VERSION in `lib/eks_nginx_api-stack.ts`
    - Replace hardcoded version strings with constant
    - _Requirements: Version standardization_
  
  - [ ] 21.3 Add CDK Aspect for version validation
    - Create CDK Aspect to validate all EKS clusters use standard version
    - Apply aspect in CDK app entry point
    - Fail synth if non-compliant version detected
    - _Requirements: Version standardization_
  
  - [ ] 21.4 Update documentation
    - Update `EKS_VERSION_STANDARD.md` to reference shared constant
    - Remove semantic-only keys from `cdk.context.json`
    - Document the deterministic approach
    - _Requirements: Version standardization_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Integration tests validate cross-VPC and cross-account connectivity
- The implementation follows a bottom-up approach: infrastructure → controllers → application → testing
