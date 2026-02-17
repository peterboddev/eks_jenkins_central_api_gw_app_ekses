# Requirements Document: ArgoCD GitOps Migration

## Introduction

This document specifies the requirements for migrating the current CDK-based Kubernetes workload deployment to a GitOps approach using ArgoCD and Helm charts. The migration maintains all existing infrastructure (VPCs, EKS clusters, networking) while transitioning workload management from CDK manifests to ArgoCD-managed Helm charts. This enables learning industry-standard Helm and GitOps practices while maintaining a working system throughout the migration.

## Glossary

- **ArgoCD**: Declarative GitOps continuous delivery tool for Kubernetes
- **Helm**: Package manager for Kubernetes that uses templated YAML files (charts)
- **GitOps**: Operational framework using Git as single source of truth for declarative infrastructure
- **Helm_Chart**: Collection of templated Kubernetes manifests with configurable values
- **ArgoCD_Application**: Custom resource that tells ArgoCD what to deploy and from where
- **CDK**: AWS Cloud Development Kit for defining cloud infrastructure in code
- **IRSA**: IAM Roles for Service Accounts - AWS mechanism for pod-level IAM permissions
- **ALB_Controller**: AWS Load Balancer Controller - manages ALBs for Kubernetes Ingress resources
- **Jenkins_Cluster**: EKS cluster running Jenkins CI/CD workloads (10.0.0.0/16 VPC)
- **Nginx_Api_Cluster**: EKS cluster running nginx REST API workloads (10.1.0.0/16 VPC)
- **Bootstrap**: Initial installation of ArgoCD via CDK before GitOps takes over
- **Monorepo**: Single Git repository containing all code (infrastructure and applications)
- **Platform_Charts**: Helm charts for platform services (ALB Controller, monitoring)
- **Application_Charts**: Helm charts for business applications (Jenkins, nginx-api)
- **Values_File**: YAML file containing configuration values for Helm chart templates
- **Sync**: ArgoCD process of applying Git state to Kubernetes cluster
- **Self_Healing**: ArgoCD feature that automatically reverts manual cluster changes

## Requirements

### Requirement 1: ArgoCD Bootstrap Infrastructure

**User Story:** As a platform engineer, I want ArgoCD installed on both EKS clusters via CDK, so that I can manage workloads through GitOps while maintaining the "no manual steps" deployment philosophy.

#### Acceptance Criteria

1. WHEN deploying the Jenkins cluster THEN the System SHALL create a new JenkinsArgoCDStack that installs ArgoCD in the argocd namespace
2. WHEN deploying the nginx-api cluster THEN the System SHALL create a new NginxApiArgoCDStack that installs ArgoCD in the argocd namespace
3. WHEN creating ArgoCD stacks THEN the System SHALL use cluster.addHelmChart() to install the official argo/argo-cd Helm chart
4. WHEN installing ArgoCD THEN the System SHALL configure it with server.service.type set to ClusterIP for ALB integration
5. WHEN ArgoCD is installed THEN the System SHALL create an Ingress resource with ALB annotations for external access
6. WHEN creating the ArgoCD Ingress THEN the System SHALL reuse the existing ALB security group pattern with IP whitelist
7. WHEN ArgoCD stacks are deployed THEN the System SHALL output the ArgoCD UI URL for each cluster
8. WHEN ArgoCD is bootstrapped THEN the System SHALL NOT manage any workloads yet (workloads added in later phases)

### Requirement 2: ArgoCD Access and Security

**User Story:** As a platform engineer, I want secure access to ArgoCD UI via ALB on Windows, so that I can manage GitOps deployments without using port-forward.

#### Acceptance Criteria

1. WHEN creating ArgoCD Ingress THEN the System SHALL use the alb IngressClass
2. WHEN configuring the ALB THEN the System SHALL set scheme to internet-facing for public access
3. WHEN configuring the ALB THEN the System SHALL set target-type to ip for direct pod routing
4. WHEN configuring ALB security THEN the System SHALL reference the existing security group with IP whitelist
5. WHEN accessing ArgoCD UI THEN the System SHALL serve it over HTTPS on port 443
6. WHEN retrieving admin credentials THEN the System SHALL provide kubectl commands to get the initial admin password
7. WHEN ArgoCD is deployed THEN the System SHALL output PowerShell-compatible commands for Windows users

### Requirement 3: Repository Structure for GitOps

**User Story:** As a developer, I want a clear monorepo structure for Helm charts and ArgoCD Applications, so that I understand where to place different types of deployments.

#### Acceptance Criteria

1. WHEN organizing the repository THEN the System SHALL create a platform/ directory for platform service Helm charts
2. WHEN organizing the repository THEN the System SHALL create a deploy/ directory for application Helm charts
3. WHEN organizing platform charts THEN the System SHALL create platform/aws-load-balancer-controller/ for the ALB Controller chart
4. WHEN organizing application charts THEN the System SHALL create deploy/jenkins/ for Jenkins Helm chart values
5. WHEN organizing application charts THEN the System SHALL create deploy/nginx-api/ for the nginx-api Helm chart
6. WHEN organizing ArgoCD Applications THEN the System SHALL create argocd-apps/ directory for Application manifests
7. WHEN creating directory structure THEN the System SHALL include README files explaining each directory's purpose
8. WHEN using the monorepo THEN the System SHALL keep all infrastructure CDK code in lib/ as before

### Requirement 4: AWS Load Balancer Controller Migration

**User Story:** As a platform engineer, I want the AWS Load Balancer Controller deployed via Helm and managed by ArgoCD, so that ALB management follows GitOps practices.

#### Acceptance Criteria

1. WHEN migrating ALB Controller THEN the System SHALL use the official eks/aws-load-balancer-controller Helm chart
2. WHEN configuring ALB Controller THEN the System SHALL create a platform/aws-load-balancer-controller/values.yaml file
3. WHEN configuring ALB Controller values THEN the System SHALL set clusterName to the correct EKS cluster name
4. WHEN configuring ALB Controller values THEN the System SHALL set serviceAccount.create to false (CDK manages IRSA)
5. WHEN configuring ALB Controller values THEN the System SHALL reference the existing service account name created by CDK
6. WHEN creating ArgoCD Application THEN the System SHALL point to the platform/aws-load-balancer-controller/ directory
7. WHEN deploying ALB Controller THEN the System SHALL maintain the existing IAM role and permissions created by CDK
8. WHEN ALB Controller is managed by ArgoCD THEN the System SHALL remove the CDK manifest deployment code

### Requirement 5: Jenkins Helm Chart Migration

**User Story:** As a platform engineer, I want Jenkins deployed using the official Helm chart and managed by ArgoCD, so that Jenkins configuration follows industry-standard practices.

#### Acceptance Criteria

1. WHEN migrating Jenkins THEN the System SHALL use the official jenkins/jenkins Helm chart from Artifact Hub
2. WHEN configuring Jenkins THEN the System SHALL create deploy/jenkins/values.yaml with all current configuration
3. WHEN configuring persistence THEN the System SHALL set persistence.existingClaim to jenkins-home-pvc (existing EFS PVC)
4. WHEN configuring service account THEN the System SHALL set serviceAccount.create to false and reference the CDK-created account
5. WHEN configuring plugins THEN the System SHALL migrate the current plugins list from the ConfigMap to values.yaml
6. WHEN configuring JCasC THEN the System SHALL migrate the current JCasC configuration to values.yaml
7. WHEN configuring Ingress THEN the System SHALL disable the chart's Ingress and keep the existing CDK-managed Ingress
8. WHEN creating ArgoCD Application THEN the System SHALL configure it to use the jenkins/jenkins chart with custom values
9. WHEN Jenkins is managed by ArgoCD THEN the System SHALL remove the CDK StatefulSet and ConfigMap code

### Requirement 6: Nginx-API Helm Chart Migration

**User Story:** As a developer, I want the nginx-api application deployed using a custom Helm chart managed by ArgoCD, so that I can learn Helm chart development with a simple application.

#### Acceptance Criteria

1. WHEN migrating nginx-api THEN the System SHALL use the existing nginx-api-chart/ directory structure
2. WHEN configuring the chart THEN the System SHALL update values.yaml with correct ECR image repository
3. WHEN configuring the chart THEN the System SHALL set image.repository to the Jenkins account ECR repository
4. WHEN configuring the chart THEN the System SHALL parameterize the AWS account ID and region in values
5. WHEN creating templates THEN the System SHALL ensure deployment.yaml, service.yaml, and ingress.yaml use values correctly
6. WHEN creating ArgoCD Application THEN the System SHALL point to the nginx-api-chart/ directory
7. WHEN nginx-api is managed by ArgoCD THEN the System SHALL remove the CDK manifest deployment code
8. WHEN the chart is deployed THEN the System SHALL maintain all existing functionality (health checks, resource limits)

### Requirement 7: ArgoCD Application Definitions

**User Story:** As a platform engineer, I want ArgoCD Application manifests for each workload, so that ArgoCD knows what to deploy and from where.

#### Acceptance Criteria

1. WHEN creating Applications THEN the System SHALL create argocd-apps/jenkins-alb-controller.yaml for the ALB Controller
2. WHEN creating Applications THEN the System SHALL create argocd-apps/jenkins-app.yaml for Jenkins
3. WHEN creating Applications THEN the System SHALL create argocd-apps/nginx-alb-controller.yaml for nginx cluster ALB Controller
4. WHEN creating Applications THEN the System SHALL create argocd-apps/nginx-api-app.yaml for nginx-api
5. WHEN configuring Applications THEN the System SHALL set source.repoURL to the current Git repository URL
6. WHEN configuring Applications THEN the System SHALL set source.path to the correct chart directory
7. WHEN configuring Applications THEN the System SHALL set destination.server to https://kubernetes.default.svc for in-cluster deployment
8. WHEN configuring Applications THEN the System SHALL set destination.namespace to the correct namespace
9. WHEN configuring Applications THEN the System SHALL enable automated sync with prune and selfHeal
10. WHEN Applications are created THEN the System SHALL apply them using kubectl apply after ArgoCD is running

### Requirement 8: Migration Strategy and Phases

**User Story:** As a platform engineer, I want a phased migration approach, so that I can safely transition to GitOps without downtime and with easy rollback.

#### Acceptance Criteria

1. WHEN planning the migration THEN the System SHALL define Phase 1 as ArgoCD bootstrap on both clusters
2. WHEN planning the migration THEN the System SHALL define Phase 2 as nginx-api cluster workload migration
3. WHEN planning the migration THEN the System SHALL define Phase 3 as Jenkins cluster workload migration
4. WHEN planning the migration THEN the System SHALL define Phase 4 as cleanup of old CDK manifest code
5. WHEN executing each phase THEN the System SHALL keep both CDK and ArgoCD deployments running in parallel
6. WHEN a phase is complete THEN the System SHALL verify all functionality before proceeding to next phase
7. WHEN issues occur THEN the System SHALL support rollback by redeploying the previous CDK stack version
8. WHEN migration is complete THEN the System SHALL document the new deployment workflow

### Requirement 9: Deployment Philosophy Update

**User Story:** As a developer, I want updated deployment philosophy documentation, so that I understand the new CDK + GitOps hybrid approach.

#### Acceptance Criteria

1. WHEN updating philosophy THEN the System SHALL document that CDK manages AWS infrastructure and ArgoCD bootstrap
2. WHEN updating philosophy THEN the System SHALL document that ArgoCD manages all Kubernetes workloads
3. WHEN updating philosophy THEN the System SHALL document that git push triggers ArgoCD sync (not cdk deploy)
4. WHEN updating philosophy THEN the System SHALL maintain the "no manual steps" principle
5. WHEN updating philosophy THEN the System SHALL document when to use CDK vs when to use Helm charts
6. WHEN updating philosophy THEN the System SHALL provide examples of the new workflow
7. WHEN updating philosophy THEN the System SHALL document how to add new applications via ArgoCD
8. WHEN updating philosophy THEN the System SHALL document troubleshooting steps for ArgoCD sync issues

### Requirement 10: Windows Environment Support

**User Story:** As a Windows user, I want PowerShell commands and Windows-compatible tooling, so that I can work with ArgoCD and Helm without switching to Linux.

#### Acceptance Criteria

1. WHEN providing commands THEN the System SHALL include PowerShell equivalents for all bash commands
2. WHEN accessing ArgoCD THEN the System SHALL use ALB (not port-forward) for Windows compatibility
3. WHEN retrieving secrets THEN the System SHALL provide PowerShell commands using aws CLI
4. WHEN working with Helm THEN the System SHALL document Helm installation on Windows
5. WHEN working with kubectl THEN the System SHALL use existing Windows kubectl setup
6. WHEN providing file paths THEN the System SHALL use forward slashes compatible with both Windows and Linux
7. WHEN creating scripts THEN the System SHALL provide both .sh and .ps1 versions

### Requirement 11: Infrastructure Preservation

**User Story:** As a platform engineer, I want all existing infrastructure unchanged, so that the migration only affects workload deployment methods.

#### Acceptance Criteria

1. WHEN migrating THEN the System SHALL keep JenkinsNetworkStack unchanged
2. WHEN migrating THEN the System SHALL keep NginxApiNetworkStack unchanged
3. WHEN migrating THEN the System SHALL keep JenkinsStorageStack unchanged (EFS)
4. WHEN migrating THEN the System SHALL keep TransitGatewayStack unchanged
5. WHEN migrating THEN the System SHALL keep JenkinsEksClusterStack unchanged
6. WHEN migrating THEN the System SHALL keep JenkinsEksNodeGroupsStack unchanged
7. WHEN migrating THEN the System SHALL keep NginxApiClusterStack node groups unchanged
8. WHEN migrating THEN the System SHALL keep all IAM roles and service accounts created by CDK
9. WHEN migrating THEN the System SHALL keep all security groups and network rules
10. WHEN migrating THEN the System SHALL only modify JenkinsApplicationStack and NginxApiClusterStack workload sections

### Requirement 12: Helm Learning Objectives

**User Story:** As a developer learning Helm, I want to understand Helm chart structure and templating, so that I can create and maintain charts for production use.

#### Acceptance Criteria

1. WHEN learning Helm THEN the System SHALL provide examples of Chart.yaml structure and metadata
2. WHEN learning Helm THEN the System SHALL provide examples of values.yaml with different data types
3. WHEN learning Helm THEN the System SHALL provide examples of template functions (include, toYaml, quote)
4. WHEN learning Helm THEN the System SHALL provide examples of conditional logic in templates
5. WHEN learning Helm THEN the System SHALL provide examples of _helpers.tpl for reusable template snippets
6. WHEN learning Helm THEN the System SHALL document how values override works (default → values.yaml → CLI)
7. WHEN learning Helm THEN the System SHALL document how to test charts locally with helm template
8. WHEN learning Helm THEN the System SHALL document how to debug chart rendering issues

### Requirement 13: GitOps Learning Objectives

**User Story:** As a developer learning GitOps, I want to understand ArgoCD workflows and best practices, so that I can manage deployments through Git effectively.

#### Acceptance Criteria

1. WHEN learning GitOps THEN the System SHALL document the git push → ArgoCD sync → cluster update workflow
2. WHEN learning GitOps THEN the System SHALL document how ArgoCD detects changes in Git
3. WHEN learning GitOps THEN the System SHALL document sync policies (manual vs automatic)
4. WHEN learning GitOps THEN the System SHALL document self-healing and how it prevents configuration drift
5. WHEN learning GitOps THEN the System SHALL document prune behavior for deleted resources
6. WHEN learning GitOps THEN the System SHALL document how to handle secrets in GitOps (sealed secrets, external secrets)
7. WHEN learning GitOps THEN the System SHALL document rollback procedures using Git history
8. WHEN learning GitOps THEN the System SHALL document multi-cluster management patterns

### Requirement 14: Testing and Validation

**User Story:** As a platform engineer, I want validation steps for each migration phase, so that I can confirm everything works before proceeding.

#### Acceptance Criteria

1. WHEN validating Phase 1 THEN the System SHALL verify ArgoCD UI is accessible via ALB on both clusters
2. WHEN validating Phase 1 THEN the System SHALL verify ArgoCD can authenticate and show empty application list
3. WHEN validating Phase 2 THEN the System SHALL verify nginx-api responds to health checks via ALB
4. WHEN validating Phase 2 THEN the System SHALL verify nginx-api ArgoCD Application shows Healthy and Synced status
5. WHEN validating Phase 3 THEN the System SHALL verify Jenkins UI is accessible and functional
6. WHEN validating Phase 3 THEN the System SHALL verify Jenkins can run existing jobs successfully
7. WHEN validating Phase 3 THEN the System SHALL verify Jenkins ArgoCD Application shows Healthy and Synced status
8. WHEN validating any phase THEN the System SHALL verify no downtime occurred during migration
9. WHEN testing GitOps THEN the System SHALL verify that git push triggers automatic sync
10. WHEN testing self-healing THEN the System SHALL verify that manual kubectl changes are reverted by ArgoCD

### Requirement 15: Documentation and Knowledge Transfer

**User Story:** As a team member, I want comprehensive documentation of the new GitOps workflow, so that anyone can understand and work with the system.

#### Acceptance Criteria

1. WHEN documenting THEN the System SHALL create ARGOCD_MIGRATION_GUIDE.md with step-by-step migration instructions
2. WHEN documenting THEN the System SHALL create HELM_CHART_GUIDE.md explaining chart structure and development
3. WHEN documenting THEN the System SHALL create GITOPS_WORKFLOW.md explaining day-to-day operations
4. WHEN documenting THEN the System SHALL update deployment-philosophy.md with the new hybrid approach
5. WHEN documenting THEN the System SHALL include architecture diagrams showing CDK vs ArgoCD responsibilities
6. WHEN documenting THEN the System SHALL include troubleshooting sections for common issues
7. WHEN documenting THEN the System SHALL include examples of adding new applications
8. WHEN documenting THEN the System SHALL include references to official Helm and ArgoCD documentation

### Requirement 16: Rollback and Safety

**User Story:** As a platform engineer, I want safe rollback procedures, so that I can quickly recover if migration issues occur.

#### Acceptance Criteria

1. WHEN issues occur THEN the System SHALL support rolling back by disabling ArgoCD Applications
2. WHEN rolling back THEN the System SHALL support redeploying previous CDK stack versions
3. WHEN rolling back THEN the System SHALL preserve all data (EFS, S3, secrets)
4. WHEN rolling back THEN the System SHALL document the exact rollback commands for each phase
5. WHEN planning rollback THEN the System SHALL identify the rollback decision point for each phase
6. WHEN executing rollback THEN the System SHALL verify system functionality after rollback
7. WHEN documenting rollback THEN the System SHALL include estimated rollback time for each phase

### Requirement 17: Secrets Management

**User Story:** As a security-conscious engineer, I want proper secrets handling in GitOps, so that sensitive data is not committed to Git.

#### Acceptance Criteria

1. WHEN handling secrets THEN the System SHALL NOT commit sensitive values to Git repository
2. WHEN configuring Jenkins THEN the System SHALL reference existing Kubernetes secrets created by CDK
3. WHEN configuring applications THEN the System SHALL use secretKeyRef in values.yaml for sensitive data
4. WHEN documenting secrets THEN the System SHALL explain that CDK continues to manage Secrets Manager and K8s secrets
5. WHEN documenting secrets THEN the System SHALL provide examples of referencing existing secrets in Helm charts
6. WHEN considering future improvements THEN the System SHALL document options like Sealed Secrets or External Secrets Operator
7. WHEN handling ArgoCD credentials THEN the System SHALL document how to retrieve and rotate admin password

### Requirement 18: Monitoring and Observability

**User Story:** As a platform engineer, I want to monitor ArgoCD sync status and application health, so that I can detect and respond to deployment issues.

#### Acceptance Criteria

1. WHEN ArgoCD is deployed THEN the System SHALL enable metrics endpoint for Prometheus scraping
2. WHEN applications are deployed THEN the System SHALL show sync status in ArgoCD UI
3. WHEN applications are deployed THEN the System SHALL show health status based on Kubernetes resource status
4. WHEN sync fails THEN the System SHALL display error messages in ArgoCD UI
5. WHEN sync fails THEN the System SHALL retain previous working version until issue is resolved
6. WHEN monitoring THEN the System SHALL document how to view ArgoCD logs for troubleshooting
7. WHEN monitoring THEN the System SHALL document how to view application events and sync history
8. WHEN monitoring THEN the System SHALL integrate with existing CloudWatch alarms where applicable

### Requirement 19: Continuous Integration with Jenkins

**User Story:** As a developer, I want Jenkins pipelines to trigger ArgoCD syncs, so that CI/CD workflows remain automated after migration.

#### Acceptance Criteria

1. WHEN Jenkins builds complete THEN the System SHALL support updating Helm chart values via Git commit
2. WHEN Jenkins updates values THEN the System SHALL commit changes to a specific branch or path
3. WHEN Git is updated THEN the System SHALL trigger ArgoCD sync automatically
4. WHEN configuring Jenkins THEN the System SHALL provide example pipeline code for GitOps updates
5. WHEN updating images THEN the System SHALL document the pattern of updating image tags in values.yaml
6. WHEN using GitOps THEN the System SHALL document the difference between push-based (Jenkins) and pull-based (ArgoCD) CD
7. WHEN integrating CI/CD THEN the System SHALL maintain existing Jenkins job functionality

### Requirement 20: Multi-Cluster Management

**User Story:** As a platform engineer, I want to understand multi-cluster ArgoCD patterns, so that I can manage both Jenkins and nginx-api clusters effectively.

#### Acceptance Criteria

1. WHEN managing multiple clusters THEN the System SHALL deploy separate ArgoCD instances (one per cluster)
2. WHEN managing multiple clusters THEN the System SHALL document the standalone ArgoCD pattern
3. WHEN managing multiple clusters THEN the System SHALL document how each ArgoCD manages its own cluster
4. WHEN considering alternatives THEN the System SHALL document the hub-and-spoke pattern for future reference
5. WHEN managing applications THEN the System SHALL keep ArgoCD Application manifests organized by cluster
6. WHEN managing applications THEN the System SHALL use clear naming conventions (jenkins-*, nginx-*)
7. WHEN documenting THEN the System SHALL explain why standalone pattern was chosen for this use case
