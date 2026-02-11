# Jenkins Automated Deployment - Requirements

## 1. Overview

Automate Jenkins job creation during CDK deployment by applying Kubernetes manifests (JCasC configuration, plugins, secrets) to the EKS cluster. This eliminates manual kubectl commands and ensures Jenkins is fully configured when the stack deployment completes.

## 2. User Stories

### 2.1 As a DevOps engineer
I want Jenkins jobs to be automatically created when I run `cdk deploy`, so that I don't need to manually run kubectl commands or configure Jenkins after deployment.

### 2.2 As a developer
I want to push code changes to the main branch and have Jenkins automatically pick them up via webhooks, so that my CI/CD pipeline works immediately after infrastructure deployment.

### 2.3 As a platform engineer
I want all Jenkins configuration (plugins, credentials, jobs) to be defined as code in Git, so that the infrastructure is reproducible and version-controlled.

## 3. Acceptance Criteria

### 3.1 Lambda Custom Resource Integration
- Lambda function is created in the CDK stack
- Lambda has kubectl layer for Kubernetes API access
- Lambda can authenticate to EKS cluster using IAM
- Custom Resource triggers Lambda during CDK deploy

### 3.2 Manifest Application
- K8s manifests are uploaded to S3 during CDK synth
- Lambda downloads manifests from S3
- Lambda applies manifests in correct order:
  1. Namespace
  2. ConfigMaps (plugins, JCasC)
  3. Secrets sync job
  4. StatefulSet, Service, Ingress
- Lambda reports success/failure to CloudFormation

### 3.3 Jenkins Configuration
- JCasC main configuration is applied (jenkins.yaml)
- Plugins are installed via init container
- Seed job is auto-created by JCasC
- GitHub webhook secret is synced from Secrets Manager
- Admin password is synced from Secrets Manager

### 3.4 Job Creation
- Seed job processes jenkins-jobs/seed-job.groovy from Git
- Pipeline jobs are created (nginx-api-build, nginx-docker-build)
- Jobs are configured with GitHub webhooks
- Jobs reference correct branch (main)

### 3.5 Error Handling
- Lambda logs errors to CloudWatch
- CloudFormation receives failure signal if manifests fail to apply
- Stack rollback occurs on failure
- Clear error messages for troubleshooting

## 4. Constraints

### 4.1 Technical Constraints
- EKS cluster has private endpoint only (no public access)
- Lambda must run in VPC with access to EKS API
- kubectl layer must be compatible with Lambda runtime
- Manifests must be stored in S3 (Lambda has no local filesystem access to Git repo)

### 4.2 Security Constraints
- Lambda IAM role has minimal permissions (EKS describe, S3 read)
- Secrets are never logged or exposed
- kubectl authentication uses IAM (no kubeconfig with credentials)

### 4.3 Operational Constraints
- Deployment must complete within CloudFormation timeout (1 hour)
- Lambda execution must complete within 15 minutes
- Manifest application must be idempotent (safe to re-run)

## 5. Dependencies

### 5.1 Existing Infrastructure
- EKS cluster (jenkins-eks-cluster)
- VPC with private subnets
- S3 bucket for artifacts
- Secrets Manager secrets (admin-password, github-webhook-secret)

### 5.2 Existing Configuration Files
- k8s/jenkins/jcasc-main-configmap.yaml
- k8s/jenkins/plugins-configmap.yaml
- k8s/jenkins/secrets-sync-job.yaml
- k8s/jenkins/statefulset.yaml
- k8s/jenkins/service.yaml
- k8s/jenkins/ingress.yaml
- k8s/jenkins/kustomization.yaml
- jenkins-jobs/seed-job.groovy

### 5.3 Build Artifacts
- kubectl-layer.zip (already automated via scripts/prepare-kubectl-layer.js)

## 6. Out of Scope

- Manual kubectl commands
- Helm chart deployment
- Jenkins plugin updates after initial deployment
- Job configuration updates (handled by seed job + Git)
- Multi-cluster deployment

## 7. Success Metrics

- Jenkins has jobs visible in UI after `cdk deploy` completes
- Seed job runs successfully on first execution
- Pipeline jobs are created from Job DSL
- GitHub webhook triggers jobs on push to main branch
- Zero manual intervention required after `cdk deploy`
