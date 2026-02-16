# Jenkins Helm Migration Guide

## Overview

This guide documents the migration from individual CDK manifests to the official Jenkins Helm chart for deploying Jenkins on EKS. The migration maintains the core deployment philosophy: **everything is managed through CDK code with no manual kubectl or helm commands required**.

## What Changed

### Before (Manifest-Based)
- ~10 individual Kubernetes manifest files
- Manual seed job creation via `kubectl apply`
- ConfigMaps for plugins, JCasC, and agent templates
- Custom StatefulSet configuration

### After (Helm-Based)
- Single Helm chart deployment via `cluster.addHelmChart()`
- Automatic seed job creation via JCasC
- All configuration in TypeScript (no YAML files)
- Community-maintained Helm chart with best practices

## Benefits

1. **Simplified Maintenance**: Leverage community-maintained Helm chart
2. **Reduced Code**: Single Helm chart replaces ~10 manifest files
3. **Automated Seed Jobs**: No more manual `kubectl apply` for seed jobs
4. **Easier Upgrades**: Jenkins version upgrades via Helm chart version bumps
5. **Better Defaults**: Production-ready defaults from the community

## Pre-Migration Checklist

Before migrating, ensure you have:

- [ ] Recent AWS Backup of EFS data
- [ ] Documented current Jenkins version and plugins
- [ ] Exported current Jenkins configuration
- [ ] List of all running jobs
- [ ] Current resource usage metrics
- [ ] Current Ingress DNS name documented

## Migration Steps

### Step 1: Verify Current State

```bash
# Check current Jenkins deployment
kubectl get pods -n jenkins
kubectl get svc -n jenkins
kubectl get ingress -n jenkins

# Document current Jenkins URL
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Verify EFS mount
kubectl exec -n jenkins jenkins-0 -- df -h /var/jenkins_home
```

### Step 2: Deploy Helm-Based Stack

The migration is already implemented in the code. Simply deploy the updated stack:

```bash
# Build the project
npm run build

# Deploy the updated stack
cdk deploy JenkinsApplicationStack --require-approval never
```

**What happens during deployment:**
1. CDK creates the ServiceAccount with IRSA (same as before)
2. CDK deploys the Helm chart with all configuration
3. Helm chart creates Jenkins StatefulSet, Service, and Ingress
4. Jenkins starts and applies JCasC configuration
5. Seed job is created automatically via JCasC
6. Everything is ready - no manual steps required

### Step 3: Monitor Deployment

```bash
# Watch the deployment
kubectl get pods -n jenkins -w

# Check Helm release
kubectl get helmrelease jenkins -n jenkins

# View Jenkins logs
kubectl logs -n jenkins jenkins-0 -f

# Wait for pod to be ready (typically 3-5 minutes)
kubectl wait --for=condition=ready pod/jenkins-0 -n jenkins --timeout=600s
```

### Step 4: Verify Migration

```bash
# Check pod status
kubectl get pods -n jenkins
# Expected: jenkins-0 Running

# Check service
kubectl get svc -n jenkins
# Expected: jenkins service on port 8080

# Check ingress
kubectl get ingress -n jenkins
# Expected: jenkins ingress with ALB address

# Verify EFS data accessible
kubectl exec -n jenkins jenkins-0 -- ls -la /var/jenkins_home
# Expected: All previous Jenkins data present

# Check JCasC applied
kubectl exec -n jenkins jenkins-0 -- cat /var/jenkins_home/jenkins.yaml
# Expected: JCasC configuration present

# Access Jenkins UI
JENKINS_URL=$(kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Jenkins URL: http://$JENKINS_URL"
```

### Step 5: Verify Seed Job

```bash
# Access Jenkins UI and verify:
# 1. Seed job exists
# 2. Seed job has run successfully
# 3. Jobs created by seed job are present
```

### Step 6: Verify CloudWatch Alarms

```bash
# Check alarms still functioning
aws cloudwatch describe-alarms --alarm-names \
  jenkins-eks-cluster-health \
  jenkins-eks-node-failure \
  jenkins-eks-disk-space \
  jenkins-eks-pending-pods \
  jenkins-eks-spot-interruption
```

## Rollback Strategy

If migration fails, you can rollback by reverting the code changes:

### Option 1: Git Revert

```bash
# Revert to previous commit
git revert HEAD

# Rebuild and redeploy
npm run build
cdk deploy JenkinsApplicationStack --require-approval never
```

### Option 2: Manual Rollback

1. Uncomment the old manifest-based deployment code in `jenkins-application-stack.ts`
2. Comment out the Helm chart deployment code
3. Rebuild and redeploy:

```bash
npm run build
cdk deploy JenkinsApplicationStack --require-approval never
```

### Data Recovery

If EFS data is corrupted (unlikely):

```bash
# Restore from AWS Backup
aws backup start-restore-job \
  --recovery-point-arn <arn> \
  --iam-role-arn <role-arn> \
  --metadata file-system-id=<new-fs-id>
```

## Downtime Expectations

**Estimated Downtime: 5-10 minutes**

The migration involves:
1. Deleting old StatefulSet (1-2 minutes)
2. Creating new Helm-based StatefulSet (1-2 minutes)
3. Pod startup and Jenkins initialization (3-5 minutes)

**Note**: The same EFS volume is used, so no data migration is required.

## Troubleshooting

### Issue: Helm Chart Fails to Deploy

**Symptoms**: CDK deployment fails with Helm chart error

**Cause**: Invalid Helm values or missing dependencies

**Solution**:
```bash
# Check CDK deployment logs
cdk deploy JenkinsApplicationStack 2>&1 | tee deploy.log

# Verify Helm values in code
# Check lib/jenkins/jenkins-helm-config.ts

# Fix issue and redeploy
npm run build
cdk deploy JenkinsApplicationStack
```

### Issue: Pod Fails to Start

**Symptoms**: Pod stuck in Pending or CrashLoopBackOff

**Cause**: Resource constraints, PVC binding issues, or configuration errors

**Solution**:
```bash
# Check pod status
kubectl describe pod jenkins-0 -n jenkins

# Check pod logs
kubectl logs jenkins-0 -n jenkins

# Check PVC status
kubectl get pvc -n jenkins

# Check events
kubectl get events -n jenkins --sort-by='.lastTimestamp'
```

### Issue: Ingress Has No Address

**Symptoms**: Ingress created but no ALB address after 10 minutes

**Cause**: ALB Controller not running or invalid annotations

**Solution**:
```bash
# Check ALB Controller
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check ALB Controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check ingress annotations
kubectl get ingress jenkins -n jenkins -o yaml

# Verify security group exists
aws ec2 describe-security-groups --group-ids <sg-id>
```

### Issue: Seed Job Not Created

**Symptoms**: Jenkins starts but seed job is missing

**Cause**: JCasC configuration error or Job DSL plugin not installed

**Solution**:
```bash
# Check Jenkins logs for JCasC errors
kubectl logs jenkins-0 -n jenkins | grep -i jcasc

# Verify JCasC configuration applied
kubectl exec -n jenkins jenkins-0 -- cat /var/jenkins_home/jenkins.yaml

# Check installed plugins
kubectl exec -n jenkins jenkins-0 -- cat /var/jenkins_home/plugins.txt

# Verify Job DSL plugin installed
kubectl exec -n jenkins jenkins-0 -- ls /var/jenkins_home/plugins/ | grep job-dsl
```

### Issue: IRSA Permissions Denied

**Symptoms**: Jenkins jobs fail with AWS permission errors

**Cause**: IAM policy missing permissions or trust policy incorrect

**Solution**:
```bash
# Check ServiceAccount annotation
kubectl get sa jenkins-controller -n jenkins -o yaml

# Verify IAM role exists
ROLE_ARN=$(kubectl get sa jenkins-controller -n jenkins -o jsonpath='{.metadata.annotations.eks\.amazonaws\.com/role-arn}')
aws iam get-role --role-arn $ROLE_ARN

# Check IAM policy
aws iam list-attached-role-policies --role-name <role-name>
aws iam get-role-policy --role-name <role-name> --policy-name JenkinsControllerInfrastructureDeploymentPolicy
```

## Post-Migration Verification

After successful migration, verify:

- [ ] Jenkins UI accessible via Ingress
- [ ] All previous jobs visible
- [ ] Seed job exists and has run successfully
- [ ] Jobs created by seed job are present
- [ ] Build history preserved
- [ ] Plugins installed correctly
- [ ] JCasC configuration applied
- [ ] Agent pods can be created
- [ ] Docker-in-Docker works in agents
- [ ] AWS permissions work (test AWS CLI commands in job)
- [ ] CloudWatch alarms functioning
- [ ] EFS data accessible

## Key Differences

### ServiceAccount Creation

**Before and After**: Same approach
- ServiceAccount created via `cluster.addServiceAccount()`
- IAM role automatically created with IRSA
- No changes to IRSA configuration

### Storage

**Before and After**: Same EFS volume
- Same StorageClass (`jenkins-efs`)
- Same PersistentVolume
- Same NFS mount options
- No data migration required

### Networking

**Before and After**: Same ALB configuration
- Same Ingress annotations
- Same security group
- Same ALB name
- DNS name may change (update DNS records if needed)

### Monitoring

**Before and After**: Same CloudWatch alarms
- All alarms preserved
- No changes to alarm configuration
- SNS topic unchanged

## Deployment Philosophy Compliance

This migration maintains the deployment philosophy:

✅ **No Manual Commands**: Everything via `cdk deploy`
✅ **No Placeholder Replacements**: All values resolved at deployment time
✅ **No Manual kubectl**: Helm chart deployed automatically by CDK
✅ **No Manual helm**: Helm chart managed by CDK, not manual helm commands
✅ **Git Push Managed**: Code changes → `cdk deploy` → working infrastructure

## Additional Resources

- [Jenkins Helm Chart Documentation](https://github.com/jenkinsci/helm-charts/tree/main/charts/jenkins)
- [Jenkins Configuration as Code (JCasC) Documentation](https://github.com/jenkinsci/configuration-as-code-plugin)
- [AWS Load Balancer Controller Documentation](https://kubernetes-sigs.github.io/aws-load-balancer-controller/)
- [EKS Best Practices Guide](https://aws.github.io/aws-eks-best-practices/)

## Support

If you encounter issues during migration:

1. Check the troubleshooting section above
2. Review CDK deployment logs
3. Check Kubernetes events and pod logs
4. Verify all prerequisites are met
5. Consider rollback if issues persist

## Summary

The migration from manifests to Helm chart simplifies Jenkins deployment while maintaining all functionality. The key benefits are:

- **Simplified maintenance** through community-maintained Helm chart
- **Automated seed job creation** via JCasC (no more manual kubectl)
- **Reduced code complexity** (single Helm chart vs 10+ manifests)
- **Easier upgrades** via Helm chart version bumps
- **Maintained deployment philosophy** (everything via CDK, no manual steps)

The migration is designed to be safe, with minimal downtime and a clear rollback path if needed.
