# Requirements Document: nginx-api-cluster

## Introduction

This document specifies the requirements for a separate EKS cluster that runs a REST API application exposed via AWS API Gateway. The cluster operates in its own VPC and connects to an existing Jenkins EKS cluster via AWS Transit Gateway, replicating a multi-VPC customer architecture pattern.

## Glossary

- **API_Cluster**: The EKS cluster running the nginx REST API application
- **API_Application**: The nginx-based REST API application with test endpoints
- **API_Gateway**: AWS API Gateway (HTTP API) providing public access to the REST API
- **Public_ALB**: Internet-facing Application Load Balancer fronting the API application
- **Transit_Gateway**: AWS Transit Gateway connecting the API cluster VPC to the Jenkins cluster VPC
- **ALB_Controller**: AWS Load Balancer Controller managing Application Load Balancers in Kubernetes
- **Jenkins_ECR**: Elastic Container Registry in the Jenkins account storing container images
- **Internal_ALB**: Application Load Balancer internal to the VPC, fronting the API application
- **Internal_ALB**: Application Load Balancer internal to the VPC, fronting the API application
- **Jenkins_Cluster**: The existing Jenkins EKS cluster in VPC 10.0.0.0/16
- **API_VPC**: The VPC (10.1.0.0/16) hosting the API cluster
- **Jenkins_VPC**: The existing VPC (10.0.0.0/16) hosting the Jenkins cluster
- **CDK_Stack**: AWS Cloud Development Kit infrastructure-as-code stack
- **Helm_Chart**: Kubernetes package manager chart for application deployment

## Requirements

### Requirement 1: VPC Infrastructure

**User Story:** As a platform engineer, I want a dedicated VPC for the API cluster, so that I can isolate the API workload and replicate customer multi-VPC architectures.

#### Acceptance Criteria

1. THE CDK_Stack SHALL create API_VPC with CIDR block 10.1.0.0/16
2. WHEN creating subnets, THE CDK_Stack SHALL provision public subnets across 2 availability zones
3. WHEN creating subnets, THE CDK_Stack SHALL provision private subnets across 2 availability zones
4. THE CDK_Stack SHALL create an Internet Gateway for public subnet internet access
5. THE CDK_Stack SHALL create NAT Gateways in public subnets for private subnet internet access
6. THE CDK_Stack SHALL configure route tables for public and private subnet traffic routing

### Requirement 2: EKS Cluster Provisioning

**User Story:** As a platform engineer, I want an EKS cluster in the API VPC, so that I can run containerized API workloads with Kubernetes orchestration.

#### Acceptance Criteria

1. THE CDK_Stack SHALL create API_Cluster in API_VPC private subnets
2. WHEN creating API_Cluster, THE CDK_Stack SHALL configure it with a managed node group
3. THE CDK_Stack SHALL configure API_Cluster with appropriate IAM roles for cluster and node operations
4. THE CDK_Stack SHALL enable API_Cluster control plane logging
5. THE CDK_Stack SHALL output the kubeconfig for API_Cluster access
6. THE API_Cluster SHALL be completely separate from Jenkins_Cluster with no shared resources

### Requirement 3: AWS Load Balancer Controller

**User Story:** As a platform engineer, I want the AWS Load Balancer Controller installed, so that Kubernetes Ingress resources can automatically provision and manage Application Load Balancers.

#### Acceptance Criteria

1. THE CDK_Stack SHALL create an IAM role for ALB_Controller with necessary permissions
2. THE CDK_Stack SHALL create an IAM service account for ALB_Controller in API_Cluster
3. WHEN API_Cluster is ready, THE deployment process SHALL install ALB_Controller via Helm
4. THE ALB_Controller SHALL have permissions to create and manage Application Load Balancers
5. THE ALB_Controller SHALL have permissions to create and manage Target Groups
6. THE ALB_Controller SHALL have permissions to manage security groups for load balancers

### Requirement 4: REST API Application

**User Story:** As a developer, I want a REST API application deployed to the cluster, so that I can test API Gateway integration and cross-VPC connectivity.

#### Acceptance Criteria

1. THE API_Application SHALL be based on nginx serving REST endpoints
2. THE API_Application SHALL expose a GET /health endpoint returning HTTP 200 with status information
3. THE API_Application SHALL expose a GET /api/info endpoint returning JSON with application metadata
4. THE API_Application SHALL expose a POST /api/echo endpoint that returns the request body
5. WHEN deployed via Helm, THE API_Application SHALL run as a Kubernetes Deployment with multiple replicas
6. THE API_Application SHALL be exposed via a Kubernetes Service of type ClusterIP
7. THE API_Application SHALL be fronted by a Kubernetes Ingress resource configured for Public_ALB
8. THE API_Application SHALL pull container images from Jenkins_ECR in the Jenkins account

### Requirement 5: Public Application Load Balancer

**User Story:** As a platform engineer, I want a public ALB fronting the API application, so that API Gateway can route traffic to the application over HTTPS.

#### Acceptance Criteria

1. WHEN the Ingress resource is created, THE ALB_Controller SHALL provision Public_ALB
2. THE Public_ALB SHALL be created in public subnets of API_VPC
3. THE Public_ALB SHALL have scheme set to "internet-facing"
4. THE Public_ALB SHALL route traffic to API_Application pods via Target Groups
5. THE Public_ALB SHALL perform health checks on API_Application pods
6. THE Public_ALB SHALL have security groups restricting inbound traffic to HTTPS (port 443) only from API_Gateway
7. THE Public_ALB SHALL support TLS termination with an SSL certificate
8. THE Public_ALB SHALL reject traffic from sources other than API_Gateway

### Requirement 6: API Gateway Integration

**User Story:** As a platform engineer, I want API Gateway to route requests to the public ALB, so that API consumers have a unified public endpoint.

#### Acceptance Criteria

1. THE CDK_Stack SHALL configure API_Gateway to route requests to Public_ALB via HTTP integration
2. THE API_Gateway SHALL use the Public_ALB DNS name as the integration target
3. THE API_Gateway SHALL forward requests to Public_ALB over HTTPS
4. THE API_Gateway SHALL preserve request paths and query parameters when forwarding
5. THE API_Gateway SHALL return responses from Public_ALB to clients without modification

### Requirement 7: API Gateway as Single Public Entry Point

**User Story:** As an API consumer, I want a single public API Gateway endpoint, so that I can access all REST API endpoints through one unified entry point.

#### Acceptance Criteria

1. THE CDK_Stack SHALL create API_Gateway as an HTTP API (not REST API)
2. THE API_Gateway SHALL be the only public entry point for accessing API_Application
3. THE API_Gateway SHALL have a public endpoint accessible from the internet
4. THE API_Gateway SHALL define routes for /health, /api/info, and /api/echo
5. WHEN a request is received, THE API_Gateway SHALL route it to Public_ALB over HTTPS
6. THE API_Gateway SHALL forward HTTP methods (GET, POST) to the backend
7. THE API_Gateway SHALL return responses from API_Application to clients
8. THE CDK_Stack SHALL output the API_Gateway public URL

### Requirement 8: Transit Gateway Connectivity

**User Story:** As a DevOps engineer, I want Transit Gateway connectivity between VPCs, so that Jenkins can deploy applications to the API cluster using kubectl and helm commands across VPCs.

#### Acceptance Criteria

1. THE CDK_Stack SHALL create Transit_Gateway (or use existing if available)
2. THE CDK_Stack SHALL attach API_VPC to Transit_Gateway
3. THE CDK_Stack SHALL attach Jenkins_VPC to Transit_Gateway
4. THE CDK_Stack SHALL configure route tables in API_VPC to route Jenkins_VPC CIDR (10.0.0.0/16) traffic through Transit_Gateway
5. THE CDK_Stack SHALL configure route tables in Jenkins_VPC to route API_VPC CIDR (10.1.0.0/16) traffic through Transit_Gateway
6. THE CDK_Stack SHALL configure security groups to allow Kubernetes API traffic (port 443) from Jenkins_VPC to API_Cluster control plane
7. WHEN Transit_Gateway is configured, Jenkins pods SHALL be able to execute kubectl and helm commands against API_Cluster using its kubeconfig

### Requirement 9: Helm-Based Application Deployment

**User Story:** As a DevOps engineer, I want the API application deployed via Helm, so that I can manage application configuration and updates declaratively.

#### Acceptance Criteria

1. THE deployment process SHALL provide a Helm chart for API_Application
2. THE Helm chart SHALL define Deployment, Service, and Ingress resources
3. THE Helm chart SHALL support configurable values for replicas, image, and resource limits
4. WHEN deployed, THE Helm chart SHALL create all necessary Kubernetes resources
5. THE Helm chart SHALL be deployable from Jenkins_Cluster via kubectl/helm commands

### Requirement 10: Infrastructure Separation

**User Story:** As a platform engineer, I want complete separation from the Jenkins cluster infrastructure, so that the two clusters can be managed independently.

#### Acceptance Criteria

1. THE CDK_Stack SHALL be a separate stack from the Jenkins cluster stack
2. THE API_Cluster SHALL have its own kubeconfig separate from Jenkins_Cluster
3. THE API_Application SHALL have separate Helm values from Jenkins applications
4. THE CDK_Stack SHALL not share IAM roles, security groups, or subnets with Jenkins_Cluster
5. WHEN API_Cluster is destroyed, Jenkins_Cluster SHALL remain unaffected
6. WHEN Jenkins_Cluster is destroyed, API_Cluster SHALL remain unaffected (except deployment capability)

### Requirement 11: Security Configuration

**User Story:** As a security engineer, I want proper security controls, so that the API cluster follows AWS security best practices.

#### Acceptance Criteria

1. THE API_Cluster SHALL run worker nodes in private subnets only
2. THE Public_ALB SHALL have security groups restricting inbound traffic to HTTPS (port 443) from the internet
3. THE API_Cluster control plane SHALL be accessible from Jenkins_Cluster via Transit_Gateway
4. THE CDK_Stack SHALL configure security groups with least-privilege access rules
5. THE CDK_Stack SHALL enable encryption for EKS secrets using AWS KMS
6. THE API_Cluster nodes SHALL have IAM roles with permissions to pull images from Jenkins_ECR

### Requirement 12: Monitoring and Observability

**User Story:** As an operations engineer, I want monitoring capabilities, so that I can observe API cluster health and performance.

#### Acceptance Criteria

1. THE API_Cluster SHALL have control plane logging enabled for audit, authenticator, and controller manager
2. THE API_Application SHALL expose Prometheus-compatible metrics endpoints
3. THE Public_ALB SHALL have access logging enabled to S3
4. THE API_Gateway SHALL have access logging enabled to CloudWatch
5. THE CDK_Stack SHALL create CloudWatch log groups for cluster and application logs
