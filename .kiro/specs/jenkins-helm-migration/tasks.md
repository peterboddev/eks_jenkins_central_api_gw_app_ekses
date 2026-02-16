# Implementation Plan: Jenkins Helm Migration

## Overview

This implementation plan converts the Jenkins deployment from individual CDK manifests to the official Jenkins Helm chart. The migration maintains the deployment philosophy where everything is managed through CDK code with no manual steps required.

## Tasks

- [x] 1. Create Helm values configuration structure
  - Create TypeScript interface for Helm values
  - Define all configuration sections (controller, agent, persistence, rbac)
  - Organize values by functional area (identity, resources, placement, networking, configuration)
  - _Requirements: 1.3, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2_

- [x] 2. Configure ServiceAccount and IRSA
  - [x] 2.1 Keep existing ServiceAccount creation via addServiceAccount()
    - Maintain current ServiceAccount name 'jenkins-controller'
    - Maintain current namespace 'jenkins'
    - Keep IAM policy attachment unchanged
    - _Requirements: 2.1, 2.2, 2.5_
  
  - [x]* 2.2 Write property test for IAM policy completeness
    - **Property 1: IAM Policy Completeness**
    - **Validates: Requirements 2.5**
  
  - [x] 2.3 Configure Helm values to reference existing ServiceAccount
    - Set controller.serviceAccount.create = false
    - Set controller.serviceAccount.name = 'jenkins-controller'
    - _Requirements: 2.3, 2.4_

- [x] 3. Configure controller resources and Java options
  - Set controller.resources.requests.cpu = '2000m'
  - Set controller.resources.requests.memory = '8Gi'
  - Set controller.resources.limits.cpu = '4'
  - Set controller.resources.limits.memory = '12Gi'
  - Set controller.javaOpts = '-Xmx8g -Xms4g'
  - Set controller.jenkinsOpts = '--sessionTimeout=1440'
  - Set controller.numExecutors = 0
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 4. Configure node placement and tolerations
  - Set controller.nodeSelector with 'workload-type': 'jenkins-controller'
  - Set controller.tolerations for workload-type=jenkins-controller:NoSchedule
  - _Requirements: 8.1, 8.2, 8.4_

- [x] 5. Configure persistence for EFS storage
  - [x] 5.1 Keep existing StorageClass creation
    - Maintain StorageClass name 'jenkins-efs'
    - Keep NFS mount options unchanged
    - _Requirements: 3.1, 3.5_
  
  - [x] 5.2 Configure Helm persistence values
    - Set persistence.enabled = true
    - Set persistence.storageClass = 'jenkins-efs'
    - Set persistence.size = '100Gi'
    - Set persistence.accessMode = 'ReadWriteMany'
    - _Requirements: 3.2, 3.3_

- [x] 6. Configure plugins installation
  - [x] 6.1 Set controller.installPlugins list
    - Add kubernetes:4360.v0e4b_1c40e9e5
    - Add workflow-aggregator:600.vb_57cdd26fdd7
    - Add git:5.7.0
    - Add configuration-as-code:1909.vb_b_f59a_b_b_5d61
    - Add job-dsl:1.92
    - Add docker-workflow:580.vc0c340686b_54
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  
  - [x]* 6.2 Write property test for plugin version compatibility
    - **Property 3: Plugin Version Compatibility**
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.6, 11.7**

- [x] 7. Configure JCasC for Jenkins configuration
  - [x] 7.1 Enable JCasC and create welcome message config
    - Set controller.JCasC.defaultConfig = true
    - Create configScripts.welcome-message with system message
    - _Requirements: 4.1, 4.3_
  
  - [x] 7.2 Create Kubernetes cloud configuration
    - Create configScripts.kubernetes-cloud
    - Configure cloud name, serverUrl, namespace
    - Configure jenkinsUrl and jenkinsTunnel
    - Set containerCapStr and maxRequestsPerHostStr
    - _Requirements: 4.2_
  
  - [x] 7.3 Create agent pod template configuration
    - Define jenkins-agent-dind template in kubernetes-cloud config
    - Configure affinity for spot instances
    - Configure podAntiAffinity to avoid controller nodes
    - Define jnlp container with resources
    - Define docker container with DinD configuration
    - Configure volumes (workspace-volume, docker-storage)
    - _Requirements: 4.4_
  
  - [x] 7.4 Create seed job configuration
    - Create configScripts.jobs section
    - Define pipelineJob for seed-job
    - Configure git repository URL and branch
    - Configure Job DSL script path
    - Set sandbox to false
    - _Requirements: 6.1, 6.3, 6.5_

- [x] 8. Configure service and ingress
  - [x] 8.1 Configure service settings
    - Set controller.serviceType = 'ClusterIP'
    - Set controller.servicePort = 8080
    - _Requirements: 13.1, 13.2_
  
  - [x] 8.2 Configure ingress with ALB annotations
    - Set ingress.enabled = true
    - Set ingress.ingressClassName = 'alb'
    - Add annotation: alb.ingress.kubernetes.io/scheme = 'internet-facing'
    - Add annotation: alb.ingress.kubernetes.io/target-type = 'ip'
    - Add annotation: alb.ingress.kubernetes.io/healthcheck-path = '/login'
    - Add annotation: alb.ingress.kubernetes.io/listen-ports = '[{"HTTP": 80}]'
    - Add annotation: alb.ingress.kubernetes.io/security-groups with security group ID
    - Add annotation: alb.ingress.kubernetes.io/load-balancer-name = 'jenkins-alb'
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 9. Configure agent and RBAC settings
  - Set agent.enabled = false (use dynamic Kubernetes agents)
  - Set rbac.create = true
  - Set rbac.readSecrets = true
  - _Requirements: 4.2_

- [x] 10. Deploy Helm chart via CDK
  - [x] 10.1 Add Helm chart to CDK stack
    - Call cluster.addHelmChart() with chart name 'jenkins'
    - Set repository to 'https://charts.jenkins.io'
    - Set namespace to 'jenkins'
    - Set createNamespace to true
    - Pin version to '5.7.0'
    - Pass helmValues object
    - _Requirements: 1.1, 1.2, 1.5_
  
  - [x] 10.2 Set dependencies for Helm chart
    - Add dependency on jenkinsServiceAccount
    - Add dependency on albServiceAccount
    - _Requirements: 2.2, 5.5_
  
  - [x] 10.3 Maintain CDK outputs
    - Keep ServiceAccount role ARN output
    - Keep artifacts bucket outputs
    - Keep GitHub webhook secret outputs
    - Keep CloudWatch alarm outputs
    - Keep EFS NFS server output
    - Add Helm release name output
    - _Requirements: 13.3_
  
  - [x]* 10.4 Write property test for CDK output preservation
    - **Property 2: CDK Output Preservation**
    - **Validates: Requirements 13.3**

- [x] 11. Checkpoint - Verify Helm chart configuration
  - Ensure all Helm values are correctly configured
  - Verify dependencies are set correctly
  - Review JCasC configuration syntax
  - Ask the user if questions arise

- [x] 12. Remove old manifest-based deployment code
  - [x] 12.1 Comment out or remove manifest loading code
    - Remove loadManifest() function calls
    - Remove cluster.addManifest() calls for Jenkins resources
    - Keep StorageClass and PV creation (still needed)
    - _Requirements: 1.2_
  
  - [x] 12.2 Keep CloudWatch alarms unchanged
    - Maintain all alarm creation code
    - Keep SNS topic creation
    - Keep alarm actions
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  
  - [x] 12.3 Keep other stack resources unchanged
    - Keep S3 artifacts bucket creation
    - Keep GitHub webhook secret creation
    - Keep ALB Controller ServiceAccount creation
    - Keep security group rules
    - _Requirements: 13.4, 13.5_

- [x] 13. Write unit tests for Helm configuration
  - [x]* 13.1 Test Helm chart creation
    - Verify addHelmChart called with correct parameters
    - Verify chart name is 'jenkins'
    - Verify repository is 'https://charts.jenkins.io'
    - Verify namespace is 'jenkins'
    - Verify version is '5.7.0'
    - _Requirements: 1.1, 1.2_
  
  - [x]* 13.2 Test ServiceAccount configuration
    - Verify serviceAccount.create = false in Helm values
    - Verify serviceAccount.name = 'jenkins-controller'
    - Verify ServiceAccount created via addServiceAccount()
    - Verify IAM policy attached
    - _Requirements: 2.1, 2.3, 2.4_
  
  - [x]* 13.3 Test resource configuration
    - Verify controller.resources.requests values
    - Verify controller.resources.limits values
    - Verify javaOpts value
    - Verify jenkinsOpts value
    - Verify numExecutors = 0
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x]* 13.4 Test node placement configuration
    - Verify nodeSelector contains workload-type
    - Verify tolerations include workload-type toleration
    - _Requirements: 8.1, 8.2_
  
  - [x]* 13.5 Test persistence configuration
    - Verify persistence.enabled = true
    - Verify persistence.storageClass = 'jenkins-efs'
    - Verify persistence.size = '100Gi'
    - Verify persistence.accessMode = 'ReadWriteMany'
    - _Requirements: 3.2_
  
  - [x]* 13.6 Test plugins configuration
    - Verify installPlugins list contains all required plugins
    - Verify plugin versions meet minimum requirements
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  
  - [x]* 13.7 Test JCasC configuration
    - Verify JCasC.defaultConfig = true
    - Verify configScripts contains welcome-message
    - Verify configScripts contains kubernetes-cloud
    - Verify configScripts contains jobs
    - _Requirements: 4.1, 4.2, 4.3, 6.1_
  
  - [x]* 13.8 Test ingress configuration
    - Verify ingress.enabled = true
    - Verify ingress.ingressClassName = 'alb'
    - Verify all required ALB annotations present
    - Verify security group ID in annotations
    - _Requirements: 5.1, 5.2, 5.3_
  
  - [x]* 13.9 Test service configuration
    - Verify serviceType = 'ClusterIP'
    - Verify servicePort = 8080
    - _Requirements: 13.1, 13.2_
  
  - [x]* 13.10 Test dependencies
    - Verify Helm chart depends on ServiceAccount
    - Verify Helm chart depends on ALB Controller
    - _Requirements: 2.2, 5.5_
  
  - [x]* 13.11 Test CDK outputs
    - Verify all current outputs still exported
    - Verify output names unchanged
    - _Requirements: 13.3_

- [x] 14. Create migration documentation
  - Document pre-migration checklist
  - Document migration steps
  - Document rollback procedure
  - Document verification steps
  - Add troubleshooting guide
  - _Requirements: 9.1, 9.3, 9.4_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Run all unit tests
  - Run all property tests
  - Verify CDK synth succeeds
  - Review migration documentation
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The migration maintains the deployment philosophy: everything via `cdk deploy`, no manual steps
- Existing EFS data is preserved throughout the migration
- CloudWatch alarms continue working without changes
- The Helm chart version is pinned to 5.7.0 for stability
- JCasC configuration automates seed job creation, eliminating manual kubectl apply
- All configuration is in TypeScript within the CDK stack, no external YAML files
