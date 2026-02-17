# Implementation Plan: ArgoCD GitOps Migration

## Overview

This plan migrates Kubernetes workload deployment from CDK manifests to ArgoCD + Helm charts while preserving all infrastructure. The migration follows a phased approach with safe rollback points at each stage.

## Tasks

- [x] 1. Create repository structure for GitOps
  - Create platform/ directory for platform Helm charts
  - Create deploy/ directory for application Helm charts
  - Create argocd-apps/ directory for ArgoCD Application manifests
  - Add README.md files explaining each directory's purpose
  - _Requirements: 3.1, 3.2, 3.6, 3.7_

- [ ]* 1.1 Write property test for repository structure
  - **Property 1: Repository Structure Completeness**
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8**

- [x] 2. Create Jenkins ArgoCD Bootstrap Stack
  - [x] 2.1 Create lib/jenkins/jenkins-argocd-stack.ts
    - Import cluster from JenkinsEksClusterStack
    - Import ALB security group
    - Use cluster.addHelmChart() to install argo-cd chart
    - Configure server.service.type as ClusterIP
    - _Requirements: 1.1, 1.3, 1.4_
  
  - [x] 2.2 Create ArgoCD Ingress manifest
    - Set ingressClassName to alb
    - Add ALB annotations (scheme, target-type, backend-protocol)
    - Reference ALB security group
    - Add HTTPS listener on port 443
    - _Requirements: 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 2.3 Add CDK outputs
    - Output ArgoCD UI URL
    - Output kubectl command to get admin password (PowerShell compatible)
    - _Requirements: 1.7, 2.7_
  
  - [x] 2.4 Update bin/eks_jenkins.ts to instantiate JenkinsArgoCDStack
    - Add stack after JenkinsApplicationStack
    - Pass cluster and security group as props
    - _Requirements: 1.1_

- [ ]* 2.5 Write integration test for Jenkins ArgoCD bootstrap
  - **Property 2: ArgoCD Bootstrap Correctness (Jenkins)**
  - **Validates: Requirements 1.1, 1.4, 1.5, 1.6, 2.1-2.5**

- [x] 3. Create Nginx-API ArgoCD Bootstrap Stack
  - [x] 3.1 Create lib/nginx-api/nginx-api-argocd-stack.ts
    - Similar structure to Jenkins ArgoCD stack
    - Install ArgoCD via Helm
    - Create Ingress with ALB annotations
    - _Requirements: 1.2, 1.3, 1.4_
  
  - [x] 3.2 Add CDK outputs
    - Output ArgoCD UI URL
    - Output admin password retrieval command
    - _Requirements: 1.7, 2.7_
  
  - [x] 3.3 Update bin/eks_jenkins.ts to instantiate NginxApiArgoCDStack
    - Add stack after NginxApiClusterStack
    - _Requirements: 1.2_

- [ ]* 3.4 Write integration test for Nginx-API ArgoCD bootstrap
  - **Property 2: ArgoCD Bootstrap Correctness (Nginx-API)**
  - **Validates: Requirements 1.2, 1.4, 1.5, 1.6, 2.1-2.5**

- [x] 4. Deploy ArgoCD bootstrap stacks
  - Run npm run build
  - Deploy JenkinsArgoCDStack
  - Deploy NginxApiArgoCDStack
  - Verify ArgoCD UI accessible on both clusters
  - Retrieve and save admin passwords
  - _Requirements: 1.1, 1.2, 1.7_

- [x] 5. Checkpoint - Verify ArgoCD installation
  - Ensure ArgoCD UI accessible via ALB on both clusters
  - Ensure can login with admin credentials
  - Ensure no applications shown (empty state)
  - Ask user if questions arise

- [x] 6. Create AWS Load Balancer Controller platform chart
  - [x] 6.1 Create platform/aws-load-balancer-controller/Chart.yaml
    - Set apiVersion to v2
    - Add dependency on eks/aws-load-balancer-controller chart version 1.8.1
    - _Requirements: 4.1, 4.2_
  
  - [x] 6.2 Create platform/aws-load-balancer-controller/values-jenkins.yaml
    - Set clusterName to jenkins-eks-cluster
    - Set serviceAccount.create to false
    - Set serviceAccount.name to aws-load-balancer-controller
    - Set region to us-west-2
    - Add vpcId parameter (will be overridden by ArgoCD Application)
    - _Requirements: 4.3, 4.4, 4.5_
  
  - [x] 6.3 Create platform/aws-load-balancer-controller/values-nginx.yaml
    - Similar to values-jenkins.yaml but for nginx-api-cluster
    - _Requirements: 4.3, 4.4, 4.5_

- [x] 7. Create ArgoCD Applications for ALB Controller
  - [x] 7.1 Create argocd-apps/jenkins-alb-controller.yaml
    - Set source.repoURL to current Git repository
    - Set source.path to platform/aws-load-balancer-controller
    - Set source.helm.valueFiles to values-jenkins.yaml
    - Set destination.namespace to kube-system
    - Enable automated sync with prune and selfHeal
    - _Requirements: 4.6, 7.1, 7.5, 7.6, 7.7, 7.8, 7.9_
  
  - [x] 7.2 Create argocd-apps/nginx-alb-controller.yaml
    - Similar to jenkins-alb-controller.yaml but for nginx-api cluster
    - Use values-nginx.yaml
    - _Requirements: 7.3, 7.5-7.9_

- [ ]* 7.3 Write property test for ArgoCD Application manifests
  - **Property 7: ArgoCD Application Configuration Correctness**
  - **Validates: Requirements 7.5, 7.6, 7.7, 7.8, 7.9**

- [x] 8. Migrate nginx-api to Helm chart
  - [x] 8.1 Move nginx-api-chart/ to deploy/nginx-api/
    - Preserve existing chart structure
    - _Requirements: 6.1_
  
  - [x] 8.2 Update deploy/nginx-api/values.yaml
    - Set image.repository to ECR URL with account ID and region variables
    - Update image.tag to latest
    - Parameterize AWS account ID and region
    - _Requirements: 6.2, 6.3, 6.4_
  
  - [x] 8.3 Update Helm templates to use .Values correctly
    - Review deployment.yaml, service.yaml, ingress.yaml
    - Replace any hardcoded values with .Values references
    - Ensure all referenced values exist in values.yaml
    - _Requirements: 6.5_
  
  - [x] 8.4 Test chart rendering locally
    - Run helm template deploy/nginx-api
    - Run helm lint deploy/nginx-api
    - Verify no errors
    - _Requirements: 6.5_

- [ ]* 8.5 Write property test for Helm template validation
  - **Property 5: Helm Template Value References**
  - **Validates: Requirements 6.5**

- [x] 9. Create ArgoCD Application for nginx-api
  - [x] 9.1 Create argocd-apps/nginx-api-app.yaml
    - Set source.repoURL to current Git repository
    - Set source.path to deploy/nginx-api
    - Set destination.namespace to nginx-api
    - Enable automated sync with prune and selfHeal
    - _Requirements: 6.6, 7.4, 7.5-7.9_

- [ ] 10. Deploy nginx-api via ArgoCD
  - Update kubeconfig for nginx-api cluster
  - Apply ArgoCD Application: kubectl apply -f argocd-apps/nginx-api-app.yaml
  - Wait for ArgoCD to sync
  - Verify application shows Healthy and Synced in ArgoCD UI
  - Verify nginx-api responds to /health endpoint
  - _Requirements: 6.6, 14.3, 14.4_

- [ ]* 10.1 Write integration test for nginx-api health
  - **Property 11: Application Health After Migration (nginx-api)**
  - **Validates: Requirements 14.3, 14.4, 6.8**

- [ ] 11. Remove nginx-api CDK manifest code
  - [ ] 11.1 Edit lib/eks_nginx_api-stack.ts
    - Remove cluster.addManifest() calls for nginx-api Deployment
    - Remove cluster.addManifest() calls for nginx-api Service
    - Remove cluster.addManifest() calls for nginx-api Ingress
    - Keep namespace creation (or let ArgoCD create it)
    - _Requirements: 6.7_
  
  - [ ] 11.2 Redeploy NginxApiClusterStack
    - Run npm run build
    - Run cdk deploy NginxApiClusterStack
    - Verify no errors
    - Verify nginx-api still running (managed by ArgoCD)
    - _Requirements: 6.7_

- [ ]* 11.3 Write property test for CDK workload code removal
  - **Property 12: CDK Workload Code Removal (nginx-api)**
  - **Validates: Requirements 6.7**

- [ ] 12. Checkpoint - Verify nginx-api migration
  - Ensure nginx-api Application shows Healthy in ArgoCD UI
  - Ensure nginx-api responds to health checks
  - Ensure no downtime occurred
  - Test git push workflow (update values.yaml, commit, push, verify ArgoCD syncs)
  - Ask user if questions arise

- [ ] 13. Extract Jenkins configuration for Helm migration
  - [ ] 13.1 Create deploy/jenkins/values.yaml
    - Extract plugins list from k8s/jenkins/plugins-configmap.yaml
    - Convert to controller.installPlugins format
    - _Requirements: 5.2, 5.5_
  
  - [ ] 13.2 Migrate JCasC configuration
    - Extract JCasC from k8s/jenkins/jcasc-main-configmap.yaml
    - Convert to controller.JCasC.configScripts format
    - Preserve all existing configuration (welcome message, Jenkins URL, Kubernetes cloud)
    - _Requirements: 5.2, 5.6_
  
  - [ ] 13.3 Configure persistence and service account
    - Set controller.serviceAccount.create to false
    - Set controller.serviceAccount.name to jenkins-controller
    - Set persistence.enabled to true
    - Set persistence.existingClaim to jenkins-home-pvc
    - Set persistence.storageClass to efs-sc
    - _Requirements: 5.3, 5.4_
  
  - [ ] 13.4 Configure Ingress
    - Set controller.ingress.enabled to false (CDK manages Ingress separately)
    - _Requirements: 5.7_
  
  - [ ] 13.5 Configure resources and Java options
    - Migrate controller.resources from current StatefulSet
    - Migrate controller.javaOpts
    - Migrate controller.jenkinsOpts
    - Set controller.numExecutors to 0
    - _Requirements: 5.2_

- [ ]* 13.6 Write property test for plugin migration completeness
  - **Property 3: Plugin Configuration Migration Completeness**
  - **Validates: Requirements 5.5**

- [ ]* 13.7 Write property test for JCasC migration completeness
  - **Property 4: JCasC Configuration Migration Completeness**
  - **Validates: Requirements 5.6**

- [ ] 14. Create ArgoCD Application for Jenkins
  - [ ] 14.1 Create argocd-apps/jenkins-app.yaml
    - Set source.repoURL to https://charts.jenkins.io
    - Set source.chart to jenkins
    - Set source.targetRevision to 5.1.0 (or latest stable)
    - Reference deploy/jenkins/values.yaml for custom values
    - Set destination.namespace to jenkins
    - Enable automated sync with prune and selfHeal
    - _Requirements: 5.1, 5.8, 7.2, 7.5-7.9_

- [ ] 15. Deploy Jenkins via ArgoCD
  - Update kubeconfig for jenkins-eks-cluster
  - Apply ArgoCD Application: kubectl apply -f argocd-apps/jenkins-app.yaml
  - Wait for ArgoCD to sync (may take 5-10 minutes)
  - Verify application shows Healthy and Synced in ArgoCD UI
  - Verify Jenkins UI accessible
  - Run test job to verify functionality
  - _Requirements: 5.8, 14.5, 14.6, 14.7_

- [ ]* 15.1 Write integration test for Jenkins health
  - **Property 11: Application Health After Migration (Jenkins)**
  - **Validates: Requirements 14.5, 14.6, 14.7**

- [ ] 16. Remove Jenkins CDK manifest code
  - [ ] 16.1 Edit lib/jenkins/jenkins-application-stack.ts
    - Remove cluster.addManifest() calls for Jenkins StatefulSet
    - Remove cluster.addManifest() calls for Jenkins ConfigMaps (plugins, JCasC, agent)
    - Remove cluster.addManifest() calls for Jenkins Service
    - Keep PVC, PV, StorageClass (CDK-managed)
    - Keep ServiceAccount creation (CDK-managed with IRSA)
    - Keep Ingress (CDK-managed for now)
    - _Requirements: 5.9_
  
  - [ ] 16.2 Redeploy JenkinsApplicationStack
    - Run npm run build
    - Run cdk deploy JenkinsApplicationStack
    - Verify no errors
    - Verify Jenkins still running (managed by ArgoCD)
    - _Requirements: 5.9_

- [ ]* 16.3 Write property test for CDK workload code removal
  - **Property 12: CDK Workload Code Removal (Jenkins)**
  - **Validates: Requirements 5.9**

- [ ] 17. Checkpoint - Verify Jenkins migration
  - Ensure Jenkins Application shows Healthy in ArgoCD UI
  - Ensure Jenkins UI accessible and functional
  - Ensure can run existing jobs successfully
  - Ensure persistent data intact
  - Test git push workflow for Jenkins configuration updates
  - Ask user if questions arise

- [ ] 18. Deploy ALB Controller via ArgoCD (both clusters)
  - [ ] 18.1 Apply jenkins-alb-controller Application
    - kubectl apply -f argocd-apps/jenkins-alb-controller.yaml
    - Wait for sync
    - Verify ALB Controller pods running in kube-system
    - _Requirements: 4.6, 7.1_
  
  - [ ] 18.2 Apply nginx-alb-controller Application
    - Switch kubeconfig to nginx-api cluster
    - kubectl apply -f argocd-apps/nginx-alb-controller.yaml
    - Wait for sync
    - Verify ALB Controller pods running
    - _Requirements: 7.3_
  
  - [ ] 18.3 Remove ALB Controller CDK manifest code
    - Edit lib/jenkins/jenkins-application-stack.ts
    - Remove ALB Controller Deployment manifest
    - Keep ServiceAccount creation (CDK-managed with IRSA)
    - Edit lib/eks_nginx_api-stack.ts
    - Remove ALB Controller Deployment manifest
    - Keep ServiceAccount creation
    - _Requirements: 4.8_
  
  - [ ] 18.4 Redeploy application stacks
    - Run npm run build
    - Run cdk deploy JenkinsApplicationStack NginxApiClusterStack
    - Verify no errors
    - Verify ALB Controllers still running (managed by ArgoCD)
    - _Requirements: 4.8_

- [ ]* 18.5 Write property test for service account consistency
  - **Property 8: Service Account Reference Consistency**
  - **Validates: Requirements 4.4, 4.5, 5.4**

- [ ]* 18.6 Write property test for CDK workload code removal
  - **Property 12: CDK Workload Code Removal (ALB Controller)**
  - **Validates: Requirements 4.8**

- [ ] 19. Verify infrastructure preservation
  - [ ] 19.1 Verify network stacks unchanged
    - Check JenkinsNetworkStack code unchanged
    - Check NginxApiNetworkStack code unchanged
    - Check TransitGatewayStack code unchanged
    - _Requirements: 11.1, 11.2, 11.4_
  
  - [ ] 19.2 Verify EKS stacks unchanged
    - Check JenkinsEksClusterStack code unchanged
    - Check JenkinsEksNodeGroupsStack code unchanged
    - Check NginxApiClusterStack node group code unchanged
    - _Requirements: 11.5, 11.6, 11.7_
  
  - [ ] 19.3 Verify storage and IAM unchanged
    - Check JenkinsStorageStack code unchanged
    - Verify all IAM roles and service accounts still exist
    - Verify all security groups still exist
    - _Requirements: 11.3, 11.8, 11.9_

- [ ]* 19.4 Write property test for infrastructure preservation
  - **Property 6: Infrastructure Stack Preservation**
  - **Validates: Requirements 11.1-11.9**

- [ ] 20. Create documentation
  - [ ] 20.1 Create docs/ARGOCD_MIGRATION_GUIDE.md
    - Document step-by-step migration process
    - Include rollback procedures for each phase
    - Include troubleshooting section
    - _Requirements: 15.1, 16.4_
  
  - [ ] 20.2 Create docs/HELM_CHART_GUIDE.md
    - Explain Helm chart structure (Chart.yaml, values.yaml, templates/)
    - Provide examples of template functions
    - Document how to create new charts
    - Document how to test charts locally
    - _Requirements: 12.1-12.8, 15.2_
  
  - [ ] 20.3 Create docs/GITOPS_WORKFLOW.md
    - Document git push → ArgoCD sync workflow
    - Explain sync policies and self-healing
    - Document how to add new applications
    - Document rollback via Git history
    - Include CI/CD integration examples
    - _Requirements: 13.1-13.8, 15.3, 19.1-19.7_
  
  - [ ] 20.4 Update .kiro/steering/deployment-philosophy.md
    - Add section on hybrid CDK + GitOps approach
    - Document CDK vs ArgoCD responsibilities
    - Provide examples of new workflow
    - Update deployment commands
    - _Requirements: 9.1-9.8, 15.4_
  
  - [ ] 20.5 Create architecture diagrams
    - Create Mermaid diagram showing CDK vs ArgoCD boundaries
    - Create workflow diagram showing git push → sync → cluster
    - _Requirements: 15.5_

- [ ] 21. Test GitOps workflow end-to-end
  - [ ] 21.1 Test nginx-api update workflow
    - Update deploy/nginx-api/values.yaml (change replica count)
    - Commit and push to Git
    - Verify ArgoCD detects change and syncs
    - Verify new replica count in cluster
    - _Requirements: 14.9, 19.3_
  
  - [ ] 21.2 Test Jenkins configuration update
    - Update deploy/jenkins/values.yaml (add plugin)
    - Commit and push to Git
    - Verify ArgoCD syncs
    - Verify new plugin installed in Jenkins
    - _Requirements: 14.9, 19.3_
  
  - [ ] 21.3 Test self-healing
    - Manually delete a pod via kubectl
    - Verify ArgoCD recreates it
    - Manually change a ConfigMap
    - Verify ArgoCD reverts the change
    - _Requirements: 14.10_

- [ ]* 21.4 Write integration test for GitOps sync workflow
  - **Property 10: GitOps Sync Workflow**
  - **Validates: Requirements 19.1, 19.3**

- [ ] 22. Verify secrets not in Git
  - [ ] 22.1 Scan repository for sensitive data
    - Check no passwords, tokens, or keys committed
    - Verify values.yaml files use secretKeyRef for sensitive data
    - _Requirements: 17.1, 17.2_
  
  - [ ] 22.2 Document secrets management approach
    - Document that CDK manages Secrets Manager and K8s secrets
    - Provide examples of referencing secrets in Helm charts
    - Document future options (Sealed Secrets, External Secrets Operator)
    - _Requirements: 17.3, 17.4, 17.5, 17.6_

- [ ]* 22.3 Write property test for secrets not in Git
  - **Property 9: Secrets Not in Git**
  - **Validates: Requirements 17.1, 17.2**

- [ ] 23. Final checkpoint - Complete migration verification
  - Ensure all applications show Healthy in ArgoCD UI on both clusters
  - Ensure Jenkins and nginx-api fully functional
  - Ensure git push triggers automatic syncs
  - Ensure self-healing works
  - Ensure no downtime occurred during entire migration
  - Ensure all documentation complete
  - Ask user if questions arise

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Integration tests validate end-to-end functionality
- Migration follows phased approach with safe rollback points
- CDK continues to manage infrastructure, ArgoCD manages workloads
- Git becomes single source of truth for application configuration
