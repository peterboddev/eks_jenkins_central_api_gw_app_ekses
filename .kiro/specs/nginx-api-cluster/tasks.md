# Implementation Plan: nginx-api-cluster

## Current Status

**Infrastructure Decoupling Complete:** The nginx-api-cluster implementation leverages the decoupled infrastructure architecture:

✅ **Completed Stacks (Already Deployed):**
1. **JenkinsNetworkStack** - Jenkins VPC (10.0.0.0/16) with public/private subnets
2. **NginxApiNetworkStack** - Nginx API VPC (10.1.0.0/16) with public/private subnets, tagged for EKS/Karpenter
3. **TransitGatewayStack** - Transit Gateway with VPC attachments and cross-VPC routes
4. **JenkinsStorageStack** - EFS storage for Jenkins
5. **JenkinsEksClusterStack** - Jenkins EKS cluster (foundational layer)
6. **JenkinsEksNodeGroupsStack** - Jenkins node groups and Cluster Autoscaler
7. **JenkinsApplicationStack** - Jenkins application with ALB and monitoring
8. **NginxApiClusterStack** - Nginx API EKS cluster with Karpenter, ALB Controller, and application manifests

✅ **Application Deployment (CDK Manifests):**
- Karpenter controller with NodePool and EC2NodeClass
- AWS Load Balancer Controller with IRSA
- nginx-api application (Deployment, Service, Ingress)

🔄 **Next Steps:**
- Build and push Docker image to Jenkins ECR
- Deploy NginxApiClusterStack to create all resources
- Update API Gateway integration with ALB DNS
- Test API endpoints

**Key Architecture Points:**
- VPC infrastructure is **separate** (NginxApiNetworkStack)
- Transit Gateway is **separate** (TransitGatewayStack)
- NginxApiClusterStack **imports** VPC from NginxApiNetworkStack via props
- NginxApiClusterStack **depends on** NginxApiNetworkStack and TransitGatewayStack
- All Kubernetes resources deployed via **CDK manifests** (no manual kubectl commands)
- No VPC or Transit Gateway creation in NginxApiClusterStack

## Overview

This implementation plan creates an EKS cluster infrastructure with API Gateway integration, following the decoupled multi-VPC architecture pattern. The implementation uses AWS CDK for infrastructure provisioning, Karpenter for dynamic node scaling, and Helm for application deployment.

## Tasks

- [x] 1. Set up CDK project structure and dependencies
  - ✅ CDK TypeScript project exists with all required libraries
  - ✅ NginxApiNetworkStack created for VPC infrastructure
  - ✅ TransitGatewayStack created for inter-VPC connectivity
  - ✅ NginxApiClusterStack created for EKS cluster
  - _Requirements: 10.1_

- [x] 2. Implement VPC infrastructure (COMPLETED - NginxApiNetworkStack)
  - [x] 2.1 VPC with public and private subnets
    - ✅ VPC created with CIDR 10.1.0.0/16
    - ✅ 2 public subnets across 2 AZs
    - ✅ 2 private subnets across 2 AZs
    - ✅ Internet Gateway for public subnets
    - ✅ NAT Gateway for private subnet internet access
    - ✅ Route tables configured
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [x] 2.2 Subnet tags for EKS and Karpenter
    - ✅ Public subnets tagged with kubernetes.io/role/elb=1
    - ✅ Private subnets tagged with kubernetes.io/role/internal-elb=1
    - ✅ All subnets tagged with kubernetes.io/cluster/nginx-api-cluster=shared
    - ✅ Private subnets tagged with karpenter.sh/discovery=nginx-api-cluster
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

- [x] 8. Implement Transit Gateway connectivity (COMPLETED - TransitGatewayStack)
  - [x] 8.1 Transit Gateway created
    - ✅ TransitGatewayStack has created Transit Gateway
    - _Requirements: 8.1_
  
  - [x] 8.2 VPC attachments configured
    - ✅ Transit Gateway attachment for API VPC created
    - ✅ Transit Gateway attachment for Jenkins VPC created
    - ✅ Attachments are active
    - _Requirements: 8.2, 8.3_
  
  - [x] 8.3 Route tables configured for cross-VPC routing
    - ✅ Routes added in API VPC private subnets: 10.0.0.0/16 → Transit Gateway
    - ✅ Routes added in Jenkins VPC private subnets: 10.1.0.0/16 → Transit Gateway
    - _Requirements: 8.4, 8.5_

- [ ] 9. Verify Transit Gateway connectivity
  - [ ] 9.1 Test kubectl access from Jenkins to nginx-api-cluster (via Jenkins automation)
    - Jenkins will configure kubeconfig for nginx-api-cluster automatically
    - Jenkins will execute kubectl commands via Transit Gateway
    - Verify connectivity through Jenkins job execution (not manual commands)
    - _Requirements: 8.7_

- [ ] 10. Create nginx API application Docker image
  - [x] 10.1 Application code exists
    - ✅ Express.js application with endpoints: /health, /api/info, /api/test, /api/echo, /api/users
    - ✅ nginx reverse proxy configuration
    - ✅ Handlers in ./handlers directory
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [x] 10.2 Dockerfile exists
    - ✅ Base image: node:18-alpine with nginx
    - ✅ Exposes port 8080
    - ✅ Health check configured
    - ✅ Startup script for both services
    - _Requirements: 4.1_
  
  - [ ] 10.3 Build and push image to Jenkins ECR
    - Build Docker image
    - Tag image with Jenkins account ECR repository
    - Push image to Jenkins ECR
    - _Requirements: 4.8_

- [x] 11. Deploy nginx API application via CDK manifests
  - [x] 11.1 Create Karpenter controller deployment
    - ✅ Karpenter service account with IRSA created
    - ✅ Karpenter controller deployment (2 replicas)
    - ✅ NodePool with on-demand instances (t3.medium, t3.large, t3a.medium, t3a.large)
    - ✅ EC2NodeClass with subnet/security group discovery
    - _Requirements: 2.2, Karpenter for dynamic node provisioning_
  
  - [x] 11.2 Create ALB Controller deployment
    - ✅ ALB Controller service account with IRSA created
    - ✅ ALB Controller deployment (2 replicas)
    - ✅ Full IAM policy for ALB management
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [x] 11.3 Create nginx-api Kubernetes resources
    - ✅ Namespace: nginx-api
    - ✅ Deployment: 3 replicas with health checks
    - ✅ Service: ClusterIP type on port 80
    - ✅ Ingress: ALB with internet-facing scheme, HTTPS on port 443
    - ✅ Container image from Jenkins ECR
    - ✅ Resource requests/limits configured
    - ✅ Liveness and readiness probes on /health
    - _Requirements: 4.5, 4.6, 4.7, 9.1, 9.2, 9.3, 9.4, 9.5_

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

- [ ] 14. Deploy NginxApiClusterStack
  - [ ] 14.1 Deploy CDK stack (everything automated)
    - Run: npm run build
    - Run: cdk deploy NginxApiClusterStack --require-approval never
    - CDK automatically creates all resources (EKS cluster, Karpenter IAM roles, API Gateway, security groups)
    - No manual kubectl or AWS CLI commands needed
    - _Requirements: All infrastructure requirements_
  
  - [ ] 14.2 Verify deployment via CloudFormation outputs
    - Check CloudFormation stack status is CREATE_COMPLETE
    - Verify all CloudFormation outputs are present (API Gateway URL, cluster name, Karpenter config)
    - Verify EKS cluster is in ACTIVE state via AWS Console or CloudFormation
    - _Requirements: 2.5, All infrastructure requirements_

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
