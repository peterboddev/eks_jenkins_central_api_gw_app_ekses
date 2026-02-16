# Requirements Document

## Introduction

This document specifies the requirements for migrating Jenkins deployment from individual CDK manifests to the official Jenkins Helm chart deployed via CDK. The migration maintains the deployment philosophy where everything is managed through CDK code and executed automatically during deployment, with no manual kubectl or helm commands required.

## Glossary

- **CDK**: AWS Cloud Development Kit - Infrastructure as Code framework
- **Helm_Chart**: Package manager for Kubernetes applications
- **IRSA**: IAM Roles for Service Accounts - AWS mechanism for pod-level IAM permissions
- **EFS**: Elastic File System - AWS managed NFS file system
- **JCasC**: Jenkins Configuration as Code - Plugin for managing Jenkins configuration
- **ALB**: Application Load Balancer - AWS Layer 7 load balancer
- **Seed_Job**: Initial Jenkins job that creates other jobs from Job DSL scripts
- **StatefulSet**: Kubernetes workload for stateful applications
- **PV**: PersistentVolume - Kubernetes storage abstraction
- **PVC**: PersistentVolumeClaim - Request for storage by a pod
- **ServiceAccount**: Kubernetes identity for pods

## Requirements

### Requirement 1: Helm Chart Deployment via CDK

**User Story:** As a DevOps engineer, I want to deploy Jenkins using the official Helm chart through CDK, so that I can leverage community-maintained configurations and simplify maintenance.

#### Acceptance Criteria

1. THE System SHALL deploy Jenkins using the official Jenkins Helm chart from https://charts.jenkins.io
2. WHEN deploying the Helm chart, THE System SHALL use CDK's cluster.addHelmChart() method
3. THE System SHALL configure all Helm values programmatically in TypeScript within the CDK stack
4. THE System SHALL NOT require manual helm commands or kubectl apply operations
5. WHEN the CDK stack is deployed, THE System SHALL automatically install the Helm chart with all configurations

### Requirement 2: Service Account and IRSA Integration

**User Story:** As a security engineer, I want Jenkins to use IRSA for AWS permissions, so that pods have fine-grained IAM access without storing credentials.

#### Acceptance Criteria

1. THE System SHALL create the Jenkins ServiceAccount using CDK's cluster.addServiceAccount() method
2. WHEN creating the ServiceAccount, THE System SHALL automatically generate the IAM role with IRSA trust policy
3. THE Helm_Chart SHALL reference the existing ServiceAccount created by CDK
4. THE Helm_Chart SHALL NOT create its own ServiceAccount (controller.serviceAccount.create = false)
5. THE ServiceAccount SHALL have the same IAM permissions as the current manifest-based deployment

### Requirement 3: EFS Storage Persistence

**User Story:** As a Jenkins administrator, I want Jenkins data persisted on EFS, so that build history and configurations survive pod restarts.

#### Acceptance Criteria

1. THE System SHALL continue using the existing EFS file system from JenkinsStorageStack
2. THE Helm_Chart SHALL configure persistence to use the existing StorageClass
3. WHEN Jenkins pods are created, THE System SHALL mount the EFS volume at /var/jenkins_home
4. THE System SHALL preserve all existing Jenkins data during migration
5. THE System SHALL use the same NFS mount options as the current deployment (nfsvers=4.1, rsize=1048576, wsize=1048576, hard, timeo=600, retrans=2)

### Requirement 4: JCasC Configuration

**User Story:** As a Jenkins administrator, I want Jenkins configured via JCasC, so that configuration is version-controlled and reproducible.

#### Acceptance Criteria

1. THE Helm_Chart SHALL enable JCasC configuration (controller.JCasC.defaultConfig = true)
2. THE System SHALL configure the Kubernetes cloud provider via JCasC
3. THE System SHALL configure Jenkins URL and system message via JCasC
4. THE System SHALL configure agent pod templates via JCasC
5. THE System SHALL install required plugins via Helm values (controller.installPlugins)

### Requirement 5: ALB Ingress Configuration

**User Story:** As a DevOps engineer, I want Jenkins accessible via ALB, so that users can access Jenkins through a managed load balancer.

#### Acceptance Criteria

1. THE Helm_Chart SHALL create an Ingress resource with ingressClassName: alb
2. THE Ingress SHALL use the existing ALB security group from JenkinsApplicationStack
3. THE Ingress SHALL configure ALB annotations for internet-facing, target-type: ip, and health checks
4. THE Ingress SHALL auto-discover public subnets using Kubernetes tags
5. THE Ingress SHALL depend on the AWS Load Balancer Controller ServiceAccount

### Requirement 6: Seed Job Automation

**User Story:** As a Jenkins administrator, I want seed jobs created automatically during deployment, so that I don't need manual kubectl commands after deployment.

#### Acceptance Criteria

1. THE System SHALL create the seed job via JCasC job DSL configuration
2. WHEN Jenkins starts, THE System SHALL automatically create the seed job from the JCasC configuration
3. THE Seed_Job SHALL clone the Git repository and execute the Job DSL script
4. THE System SHALL NOT require manual kubectl apply for seed job creation
5. THE Seed_Job SHALL be configured in the Helm values under controller.JCasC.configScripts.jobs

### Requirement 7: Resource Configuration

**User Story:** As a DevOps engineer, I want Jenkins controller resources properly configured, so that Jenkins has adequate CPU and memory.

#### Acceptance Criteria

1. THE Helm_Chart SHALL configure controller resources with requests: cpu=2000m, memory=8Gi
2. THE Helm_Chart SHALL configure controller resources with limits: cpu=4, memory=12Gi
3. THE Helm_Chart SHALL configure Java options: -Xmx8g -Xms4g
4. THE Helm_Chart SHALL configure Jenkins options: --sessionTimeout=1440
5. THE Helm_Chart SHALL set numExecutors to 0 to force all builds to agents

### Requirement 8: Node Placement and Tolerations

**User Story:** As a DevOps engineer, I want Jenkins controller scheduled on dedicated nodes, so that controller workload is isolated from build agents.

#### Acceptance Criteria

1. THE Helm_Chart SHALL configure nodeSelector with workload-type: jenkins-controller
2. THE Helm_Chart SHALL configure tolerations for workload-type=jenkins-controller:NoSchedule
3. WHEN the controller pod is scheduled, THE System SHALL place it only on nodes matching the nodeSelector
4. THE System SHALL maintain the same node placement strategy as the current StatefulSet

### Requirement 9: Migration Path and Data Preservation

**User Story:** As a DevOps engineer, I want a safe migration path from manifests to Helm, so that I can migrate without data loss or extended downtime.

#### Acceptance Criteria

1. THE System SHALL document the migration steps in the design document
2. WHEN migrating, THE System SHALL preserve the existing EFS data
3. THE System SHALL document any required downtime during migration
4. THE System SHALL provide a rollback strategy if migration fails
5. THE System SHALL verify that the Helm deployment uses the same PVC as the manifest deployment

### Requirement 10: Deployment Philosophy Compliance

**User Story:** As a DevOps engineer, I want the Helm deployment to follow the deployment philosophy, so that everything is managed through CDK with no manual steps.

#### Acceptance Criteria

1. THE System SHALL deploy everything via cdk deploy command
2. THE System SHALL NOT require manual helm install or helm upgrade commands
3. THE System SHALL NOT require manual kubectl apply commands
4. THE System SHALL NOT use placeholder replacement scripts
5. WHEN the stack is deployed, THE System SHALL have Jenkins fully operational without manual intervention

### Requirement 11: Plugin Management

**User Story:** As a Jenkins administrator, I want plugins managed via Helm values, so that plugin versions are tracked in code.

#### Acceptance Criteria

1. THE Helm_Chart SHALL install plugins via controller.installPlugins list
2. THE System SHALL install kubernetes plugin version 4360.v0e4b_1c40e9e5 or later
3. THE System SHALL install workflow-aggregator plugin version 600.vb_57cdd26fdd7 or later
4. THE System SHALL install git plugin version 5.7.0 or later
5. THE System SHALL install configuration-as-code plugin version 1909.vb_b_f59a_b_b_5d61 or later
6. THE System SHALL install job-dsl plugin version 1.92 or later
7. THE System SHALL install docker-workflow plugin version 580.vc0c340686b_54 or later

### Requirement 12: Monitoring and Alarms Integration

**User Story:** As a DevOps engineer, I want existing CloudWatch alarms to continue working, so that monitoring is not disrupted by the migration.

#### Acceptance Criteria

1. THE System SHALL maintain all existing CloudWatch alarms after migration
2. THE System SHALL continue monitoring cluster health, node failures, disk space, pending pods, and spot interruptions
3. WHEN the Helm deployment is active, THE CloudWatch alarms SHALL function identically to the manifest deployment
4. THE System SHALL NOT require changes to alarm configurations

### Requirement 13: Backward Compatibility

**User Story:** As a DevOps engineer, I want the Helm deployment to be compatible with existing infrastructure, so that other stacks don't need changes.

#### Acceptance Criteria

1. THE System SHALL maintain the same service name (jenkins) in the jenkins namespace
2. THE System SHALL maintain the same service port (8080)
3. THE System SHALL export the same CDK outputs as the current stack
4. THE System SHALL work with the existing JenkinsStorageStack without modifications
5. THE System SHALL work with the existing JenkinsEksClusterStack without modifications
