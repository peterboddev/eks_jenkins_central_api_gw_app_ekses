# Hardcoded Values Audit

This document lists all hardcoded values found in the project that should be parameterized or removed.

## Summary

**Status**: ✅ RESOLVED - All hardcoded values have been replaced with placeholders  
**Priority**: High - These values prevent portability and reusability  
**Date**: February 10, 2026  
**Resolution**: Created placeholder system with automated replacement scripts

---

## Resolution Summary

All hardcoded values have been replaced with placeholders. Two scripts have been created to automatically replace placeholders with actual values:

- **Bash**: `scripts/update-k8s-manifests.sh`
- **PowerShell**: `scripts/update-k8s-manifests.ps1`

### Usage

```bash
# Linux/Mac
./scripts/update-k8s-manifests.sh [--dry-run]

# Windows
.\scripts\update-k8s-manifests.ps1 [-DryRun]
```

---

## Fixed Issues

### 1. AWS Account ID: `450683699755` ✅ FIXED

**Replaced with**: `ACCOUNT_ID` placeholder

**Files fixed**:
- `k8s/jenkins/serviceaccount.yaml` - Now uses `ACCOUNT_ID`
- `k8s/efs-csi-driver/serviceaccount.yaml` - Now uses `ACCOUNT_ID`
- `k8s/cluster-autoscaler/serviceaccount.yaml` - Now uses `ACCOUNT_ID`
- `k8s/jenkins-helm-values.yaml` - Now uses `AWS_ACCOUNT_ID`

**Automated replacement**: Script fetches account ID with `aws sts get-caller-identity`

---

### 2. Subnet IDs ✅ FIXED

**Replaced with**: `SUBNET_ID_AZ_A` and `SUBNET_ID_AZ_B` placeholders

**Files fixed**:
- `k8s/jenkins-helm-values.yaml` - Removed hardcoded subnets, uses auto-discovery
- `k8s/karpenter-bootstrap-nodegroup.yaml` - Now uses placeholders

**Automated replacement**: Script queries subnets from VPC with proper tags

---

### 3. EFS File System ID: `fs-0351ee5e62a31c784` ✅ FIXED

**Replaced with**: `EFS_FILE_SYSTEM_ID` placeholder

**Files fixed**:
- `k8s/efs-csi-driver/storageclass.yaml` - Now uses placeholder

**Automated replacement**: Script fetches EFS ID from JenkinsStorageStack outputs

---

### 4. VPC ID: `vpc-034b59e141c9a0afa` ✅ FIXED

**Replaced with**: `VPC_ID` placeholder

**Files fixed**:
- `k8s/karpenter-bootstrap-nodegroup.yaml` - Now uses placeholder

**Automated replacement**: Script fetches VPC ID from NginxApiNetworkStack outputs

---

### 5. Security Group ID: `sg-078976752768a6ce4` ✅ FIXED

**Replaced with**: Removed entirely

**Files fixed**:
- `nginx-api-chart/values.yaml` - Security group line removed, ALB controller manages automatically

**Solution**: ALB controller creates and manages security groups automatically

---

### 6. ALB DNS Names and URLs ✅ FIXED

**Replaced with**: `JENKINS_URL` placeholder

**Files fixed**:
- `k8s/jenkins-helm-values.yaml` - All URLs now use `JENKINS_URL` placeholder

**Manual update required**: After deployment, get ALB DNS with:
```bash
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

---

### 7. IP CIDR Ranges in Ingress ✅ FIXED

**Replaced with**: `0.0.0.0/0` with comment to update

**Files fixed**:
- `k8s/jenkins-helm-values.yaml` - Now uses `0.0.0.0/0` with clear comment

**Note**: Users should update with their organization's IP ranges

---

## Deployment Workflow

### 1. Deploy CDK Stacks

```bash
./scripts/deploy-infrastructure.sh
```

### 2. Update Kubernetes Manifests

```bash
# Dry run to preview changes
./scripts/update-k8s-manifests.sh --dry-run

# Apply changes
./scripts/update-k8s-manifests.sh
```

### 3. Deploy Kubernetes Resources

```bash
cd k8s/efs-csi-driver && ./deploy.sh
cd k8s/cluster-autoscaler && ./deploy.sh
cd k8s/jenkins && ./deploy.sh
```

### 4. Update Jenkins URL (Manual)

```bash
# Get ALB DNS name
JENKINS_URL=$(kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Update Helm values
sed -i "s|JENKINS_URL|$JENKINS_URL|g" k8s/jenkins-helm-values.yaml
```

---

## Placeholder Reference

| Placeholder | Description | Source | Example |
|------------|-------------|--------|---------|
| `ACCOUNT_ID` | AWS Account ID | `aws sts get-caller-identity` | `123456789012` |
| `EFS_FILE_SYSTEM_ID` | EFS file system ID | JenkinsStorageStack output | `fs-0123456789abcdef0` |
| `VPC_ID` | VPC ID | NginxApiNetworkStack output | `vpc-0123456789abcdef0` |
| `SUBNET_ID_AZ_A` | Subnet in AZ-A | EC2 describe-subnets | `subnet-0123456789abcdef0` |
| `SUBNET_ID_AZ_B` | Subnet in AZ-B | EC2 describe-subnets | `subnet-0123456789abcdef1` |
| `JENKINS_URL` | Jenkins ALB DNS | kubectl get ingress | `k8s-jenkins-xxx.elb.amazonaws.com` |
| `AWS_ACCOUNT_ID` | AWS Account ID (Helm) | `aws sts get-caller-identity` | `123456789012` |

---

## Files That Are Correct (No Hardcoded Values)

✅ `k8s/jenkins/ingress.yaml` - Uses auto-discovery, no hardcoded values  
✅ `lib/jenkins/jenkins-storage-stack.ts` - Uses CDK constructs properly  
✅ `lib/network/jenkins-vpc/jenkins-network-stack.ts` - VPC CIDRs are architectural decisions  
✅ `bin/eks_jenkins.ts` - Uses stack references properly  
✅ All CDK TypeScript files - Use proper constructs and variables

---

## Test Files (Acceptable)

The following test files contain mock values which are acceptable:
- `test/eks_jenkins.test.ts` - Mock IDs for testing
- `test/property-tests/volume-remounting.test.ts` - Example patterns

---

## Documentation Files (Acceptable)

Documentation files in `docs/` contain historical values for reference purposes. These are acceptable as they document actual deployments and serve as examples.

---

## Benefits of This Approach

1. **Portability**: Infrastructure can be deployed to any AWS account
2. **Reusability**: Same code works across environments (dev, staging, prod)
3. **Automation**: Scripts handle all replacements automatically
4. **Safety**: Dry-run mode allows preview before changes
5. **Maintainability**: Clear placeholders make it obvious what needs updating
6. **Documentation**: Scripts are self-documenting with clear comments

---

## Future Improvements

1. **Helm Charts**: Convert all Kubernetes resources to Helm charts for better parameterization
2. **CDK Manifests**: Move more manifests into CDK for automatic value injection
3. **GitOps**: Implement ArgoCD or Flux for automated manifest management
4. **Environment Variables**: Use ConfigMaps/Secrets for runtime configuration

---

## Conclusion

All hardcoded values have been successfully replaced with placeholders. The automated scripts make it easy to deploy the infrastructure to any AWS account without manual editing of files.
