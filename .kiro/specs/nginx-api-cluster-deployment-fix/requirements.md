# Requirements Document: nginx-api-cluster-deployment-fix

## Introduction

This document specifies the requirements for resolving the NginxApiClusterStack deployment failure. The stack deployment failed with error "Cluster already exists with name: nginx-api-cluster" and is currently in ROLLBACK_COMPLETE state. This is an operational bugfix to clean up the failed deployment state and successfully deploy or update the stack.

## Glossary

- **NginxApiClusterStack**: The CDK CloudFormation stack that deploys the nginx API EKS cluster
- **API_Cluster**: The existing EKS cluster named "nginx-api-cluster"
- **CloudFormation_Stack**: The AWS CloudFormation stack in ROLLBACK_COMPLETE state
- **EKS_Cluster**: Amazon Elastic Kubernetes Service cluster resource
- **CDK**: AWS Cloud Development Kit used for infrastructure-as-code
- **ROLLBACK_COMPLETE**: CloudFormation stack state indicating a failed deployment that has been rolled back
- **Stack_Deletion**: The process of removing a CloudFormation stack and its resources
- **Cluster_State**: The current operational state of the EKS cluster (active, failed, deleting)
- **Resource_Orphan**: AWS resources that exist but are not managed by CloudFormation
- **Jenkins_Infrastructure**: The successfully deployed Jenkins EKS cluster and related stacks

## Requirements

### Requirement 1: Investigate Existing Cluster State

**User Story:** As a platform engineer, I want to understand the current state of the nginx-api-cluster, so that I can determine the appropriate remediation strategy.

#### Acceptance Criteria

1. THE investigation SHALL determine if API_Cluster exists in AWS EKS
2. WHEN API_Cluster exists, THE investigation SHALL determine its operational status (ACTIVE, FAILED, DELETING)
3. THE investigation SHALL identify which resources were created by the failed deployment
4. THE investigation SHALL determine if API_Cluster is managed by CloudFormation_Stack or is a Resource_Orphan
5. THE investigation SHALL check for any dependent resources (node groups, Fargate profiles, add-ons)
6. THE investigation SHALL verify the VPC and networking resources referenced by the cluster

### Requirement 2: Analyze CloudFormation Stack State

**User Story:** As a platform engineer, I want to understand why the stack is in ROLLBACK_COMPLETE state, so that I can prevent the same failure from recurring.

#### Acceptance Criteria

1. THE analysis SHALL retrieve CloudFormation_Stack events to identify the failure cause
2. THE analysis SHALL identify which resource creation failed during deployment
3. THE analysis SHALL determine if the failure was due to resource name conflict or other causes
4. THE analysis SHALL verify if any resources were successfully created before rollback
5. THE analysis SHALL check if the stack can be updated or must be deleted and recreated

### Requirement 3: Clean Up Failed Stack

**User Story:** As a platform engineer, I want to remove the ROLLBACK_COMPLETE stack, so that I can deploy a fresh stack without conflicts.

#### Acceptance Criteria

1. WHEN CloudFormation_Stack is in ROLLBACK_COMPLETE state, THE cleanup SHALL delete the stack
2. THE cleanup SHALL verify that Stack_Deletion completes successfully
3. THE cleanup SHALL confirm that no CloudFormation resources remain after deletion
4. IF API_Cluster exists as Resource_Orphan, THE cleanup SHALL document its state for manual handling
5. THE cleanup SHALL preserve Jenkins_Infrastructure and not affect other deployed stacks

### Requirement 4: Handle Existing EKS Cluster

**User Story:** As a platform engineer, I want to determine whether to delete or reuse the existing cluster, so that I can choose the most efficient remediation path.

#### Acceptance Criteria

1. IF API_Cluster is operational and correctly configured, THE remediation SHALL consider reusing it
2. IF API_Cluster is in FAILED state or misconfigured, THE remediation SHALL delete it
3. WHEN deleting API_Cluster, THE remediation SHALL remove all dependent resources first (node groups, Fargate profiles)
4. THE remediation SHALL verify that EKS_Cluster deletion completes before proceeding
5. THE remediation SHALL handle deletion failures gracefully with clear error messages

### Requirement 5: Deploy or Update Stack Successfully

**User Story:** As a platform engineer, I want to successfully deploy the NginxApiClusterStack, so that the nginx API cluster is operational and managed by CDK.

#### Acceptance Criteria

1. WHEN the cleanup is complete, THE deployment SHALL execute `cdk deploy NginxApiClusterStack`
2. THE deployment SHALL complete without resource name conflicts
3. THE deployment SHALL create all required resources (EKS cluster, IAM roles, security groups, API Gateway)
4. THE deployment SHALL output cluster configuration values (cluster name, endpoint, ARN)
5. WHEN deployment completes, CloudFormation_Stack SHALL be in CREATE_COMPLETE or UPDATE_COMPLETE state

### Requirement 6: Verify Resource Creation

**User Story:** As a platform engineer, I want to verify that all resources were created correctly, so that I can confirm the cluster is ready for use.

#### Acceptance Criteria

1. THE verification SHALL confirm API_Cluster exists and is in ACTIVE state
2. THE verification SHALL confirm the cluster endpoint is accessible
3. THE verification SHALL verify that IAM roles for Karpenter and ALB Controller were created
4. THE verification SHALL verify that security groups were created with correct rules
5. THE verification SHALL verify that API Gateway was created and has the correct configuration
6. THE verification SHALL verify that CloudWatch log groups were created
7. THE verification SHALL confirm all CloudFormation outputs are present and correct

### Requirement 7: Test Cluster Connectivity

**User Story:** As a DevOps engineer, I want to verify kubectl access to the cluster, so that I can confirm the cluster is ready for application deployment.

#### Acceptance Criteria

1. THE testing SHALL update kubeconfig with API_Cluster credentials
2. THE testing SHALL execute `kubectl get nodes` and verify it returns successfully
3. THE testing SHALL execute `kubectl get namespaces` and verify default namespaces exist
4. THE testing SHALL verify that the cluster control plane is responsive
5. IF connectivity fails, THE testing SHALL provide diagnostic information about the failure

### Requirement 8: Document Remediation Steps

**User Story:** As a platform engineer, I want documentation of the remediation process, so that I can repeat it if similar failures occur.

#### Acceptance Criteria

1. THE documentation SHALL record the root cause of the deployment failure
2. THE documentation SHALL list all commands executed during remediation
3. THE documentation SHALL document the decision to delete or reuse the existing cluster
4. THE documentation SHALL provide a step-by-step remediation procedure
5. THE documentation SHALL include verification steps to confirm successful deployment

### Requirement 9: Prevent Future Failures

**User Story:** As a platform engineer, I want to identify preventive measures, so that similar deployment failures do not occur in the future.

#### Acceptance Criteria

1. THE analysis SHALL identify if CDK code needs modification to prevent name conflicts
2. THE analysis SHALL determine if deployment order dependencies need to be enforced
3. THE analysis SHALL recommend pre-deployment validation checks
4. IF the cluster name is hardcoded, THE analysis SHALL recommend making it configurable
5. THE analysis SHALL recommend CloudFormation stack protection settings if appropriate

### Requirement 10: Maintain Jenkins Infrastructure Integrity

**User Story:** As a platform engineer, I want to ensure Jenkins infrastructure remains operational, so that existing deployments are not disrupted.

#### Acceptance Criteria

1. THE remediation SHALL NOT modify or delete any Jenkins-related stacks
2. THE remediation SHALL NOT affect Transit Gateway connectivity to Jenkins VPC
3. THE remediation SHALL verify that Jenkins_Infrastructure remains in healthy state
4. IF any Jenkins resources are affected, THE remediation SHALL restore them immediately
5. THE remediation SHALL test that Jenkins cluster remains accessible after nginx cluster remediation
