# Jenkins Automated Deployment Guide

## Overview

This guide explains how Jenkins is automatically configured during CDK deployment using a Lambda-based Custom Resource. This eliminates the need for manual kubectl commands and ensures Jenkins is fully operational when the stack deployment completes.

## Architecture

```
CDK Deploy
    ↓
CloudFormation Stack
    ↓
S3 Bucket (manifests uploaded)
    ↓
Lambda Custom Resource
    ↓
EKS API Server (private endpoint)
    ↓
Jenkins Pods Created & Configured
```

## Components

### 1. S3 Bucket for Manifests

**Bucket Name**: `jenkins-{account}-{region}-k8s-manifests`

**Contents**: All Kubernetes manifests from `k8s/jenkins/` directory

**Lifecycle**: Automatically deleted when stack is destroyed

### 2. Lambda Function

**Name**: `jenkins-eks-k8s-applier`

**Runtime**: Python 3.12

**Timeout**: 15 minutes

**VPC**: Runs in private subnets with NAT Gateway access

**Layers**: kubectl binary (v1.32.0)

**Permissions**:
- EKS: DescribeCluster
- S3: GetObject, ListBucket
- CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
- VPC: Network interface management

### 3. Custom Resource

**Type**: `Custom::K8sManifestApplier`

**Trigger**: Runs during stack Create and Update

**Dependencies**: EKS cluster, controller node group, agent node group

## Deployment Flow

### Step 1: CDK Synth

```bash
npm run build
```

This triggers:
1. `scripts/prepare-kubectl-layer.js` downloads kubectl binary
2. Creates `nginx-api/tmp/kubectl-layer.zip`
3. CDK synthesizes CloudFormation template

### Step 2: CDK Deploy

```bash
cdk deploy JenkinsEksStack
```

This triggers:
1. CloudFormation creates S3 bucket
2. CDK uploads manifests to S3
3. CloudFormation creates Lambda function with kubectl layer
4. CloudFormation creates Custom Resource
5. Custom Resource invokes Lambda function
6. Lambda downloads manifests from S3
7. Lambda applies manifests to EKS cluster in order
8. Jenkins pods are created and configured
9. CloudFormation completes successfully

### Step 3: Verify Deployment

Check Jenkins UI:
```
http://<jenkins-alb-url>/
```

Expected results:
- Jenkins is accessible
- Seed job exists
- Pipeline jobs are created (nginx-api-build, nginx-docker-build)
- GitHub webhook is configured

## Manifest Application Order

Manifests are applied in lexicographic order:

1. `namespace.yaml` - Create jenkins namespace
2. `plugins-configmap.yaml` - Plugin list for init container
3. `jcasc-main-configmap.yaml` - JCasC configuration with seed job
4. `agent-pod-template-configmap.yaml` - Agent pod template
5. `secrets-sync-job.yaml` - Sync secrets from Secrets Manager
6. `pvc.yaml` - Persistent volume claim for EFS
7. `serviceaccount.yaml` - Jenkins service account
8. `rbac.yaml` - RBAC roles and bindings
9. `statefulset.yaml` - Jenkins controller StatefulSet
10. `service.yaml` - Jenkins service
11. `ingress.yaml` - Jenkins ingress (ALB)

## Configuration Details

### JCasC Configuration

**File**: `k8s/jenkins/jcasc-main-configmap.yaml`

**Features**:
- Security realm with admin user
- Authorization strategy
- Kubernetes cloud configuration
- Credentials from Secrets Manager
- Seed job definition
- GitHub plugin configuration

### Seed Job

**File**: `jenkins-jobs/seed-job.groovy`

**Purpose**: Creates pipeline jobs from Job DSL scripts in Git

**Trigger**: Runs automatically on Jenkins startup

**Jobs Created**:
- `nginx-api-build` - Build and deploy nginx-api application
- `nginx-docker-build` - Build nginx demo Docker image

### Secrets Management

**Admin Password**: `jenkins/admin-password` (Secrets Manager)

**GitHub Webhook Secret**: `jenkins/github-webhook-secret` (Secrets Manager)

**Sync Method**: Kubernetes Job (`secrets-sync-job.yaml`) runs on startup

## Troubleshooting

### Lambda Execution Logs

View logs in CloudWatch:
```bash
aws logs tail /aws/lambda/jenkins-eks-k8s-applier --follow
```

### Check Custom Resource Status

```bash
aws cloudformation describe-stack-resources \
  --stack-name JenkinsEksStack \
  --logical-resource-id K8sManifestApplier
```

### Verify Manifests in S3

```bash
aws s3 ls s3://jenkins-{account}-{region}-k8s-manifests/k8s/jenkins/
```

### Check Jenkins Pods

```bash
kubectl get pods -n jenkins
kubectl logs -n jenkins jenkins-controller-0
```

### Common Issues

#### Issue: Lambda timeout

**Cause**: Manifests taking too long to apply

**Solution**: Increase Lambda timeout or reduce manifest count

#### Issue: kubectl not found

**Cause**: kubectl layer not properly packaged

**Solution**: Delete `nginx-api/tmp/kubectl-layer.zip` and run `npm run build`

#### Issue: EKS API unreachable

**Cause**: Lambda not in VPC or NAT Gateway issue

**Solution**: Verify Lambda VPC configuration and NAT Gateway

#### Issue: Manifests not applied

**Cause**: S3 upload failed or incorrect prefix

**Solution**: Check S3 bucket contents and manifest prefix

## Manual Intervention (if needed)

If automated deployment fails, you can manually apply manifests:

### 1. Configure kubectl

```bash
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2
```

### 2. Apply manifests

```bash
kubectl apply -f k8s/jenkins/
```

### 3. Verify deployment

```bash
kubectl get pods -n jenkins
kubectl get svc -n jenkins
kubectl get ingress -n jenkins
```

## Updating Configuration

### Update JCasC Configuration

1. Edit `k8s/jenkins/jcasc-main-configmap.yaml`
2. Run `cdk deploy JenkinsEksStack`
3. Lambda re-applies manifests
4. Jenkins auto-reloads configuration

### Update Job Definitions

1. Edit `jenkins-jobs/seed-job.groovy`
2. Push to Git (main branch)
3. GitHub webhook triggers seed job
4. Seed job updates pipeline jobs

### Update Plugins

1. Edit `k8s/jenkins/plugins-configmap.yaml`
2. Run `cdk deploy JenkinsEksStack`
3. Lambda re-applies manifests
4. Jenkins StatefulSet restarts with new plugins

## Rollback

### Stack Rollback

If deployment fails, CloudFormation automatically rolls back:

```bash
aws cloudformation describe-stack-events \
  --stack-name JenkinsEksStack \
  --query 'StackEvents[?ResourceStatus==`ROLLBACK_IN_PROGRESS`]'
```

### Manual Rollback

To manually rollback Jenkins configuration:

```bash
# Delete Jenkins namespace
kubectl delete namespace jenkins

# Re-apply previous manifests
kubectl apply -f k8s/jenkins/
```

## Best Practices

1. **Test changes locally** before deploying to production
2. **Use Git branches** for configuration changes
3. **Monitor CloudWatch Logs** during deployment
4. **Backup Jenkins data** before major updates
5. **Use semantic versioning** for plugin versions
6. **Document custom configurations** in JCasC YAML

## Security Considerations

1. **Secrets never logged** - Lambda function does not log secrets
2. **IAM authentication** - kubectl uses IAM for EKS access
3. **Private endpoint** - EKS API only accessible from VPC
4. **Encrypted storage** - S3 bucket uses SSE-S3 encryption
5. **Minimal permissions** - Lambda role has least privilege

## Performance

- **Deployment time**: 5-10 minutes (including Lambda execution)
- **Lambda execution**: 2-5 minutes (manifest application)
- **Jenkins startup**: 3-5 minutes (plugin installation, JCasC)
- **Total time**: 10-20 minutes from `cdk deploy` to Jenkins ready

## Cost

- **Lambda execution**: ~$0.01 per deployment
- **S3 storage**: ~$0.01 per month
- **Data transfer**: Minimal (manifests are small)
- **Total**: Negligible compared to EKS cluster costs

## References

- [Jenkins Configuration as Code](https://github.com/jenkinsci/configuration-as-code-plugin)
- [Job DSL Plugin](https://github.com/jenkinsci/job-dsl-plugin)
- [AWS Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html)
- [EKS IAM Authentication](https://docs.aws.amazon.com/eks/latest/userguide/managing-auth.html)
