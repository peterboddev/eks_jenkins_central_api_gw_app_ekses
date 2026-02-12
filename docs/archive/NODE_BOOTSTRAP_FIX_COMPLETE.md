# Node Bootstrap Issue - Resolution Complete

**Date**: February 11, 2026  
**Status**: Node joining cluster - EFS mount issue identified

## Issues Fixed

### 1. ✅ Node Instance Roles Not in aws-auth ConfigMap
**Problem**: Controller node couldn't join cluster - "AccessDenied" error  
**Root Cause**: Node IAM roles weren't added to aws-auth ConfigMap  
**Solution**: Manually patched aws-auth ConfigMap with node role ARNs  
**Result**: Node successfully joined cluster and is Ready

### 2. ✅ ALB Controller CRDs Missing
**Problem**: ALB Controller pods crashing with "no matches for kind TargetGroupBinding"  
**Root Cause**: Custom Resource Definitions not installed  
**Solution**: Added TargetGroupBinding CRD to CDK application stack  
**Result**: ALB Controller pods now Running (2/2)

### 3. ✅ EFS Security Group Had No Ingress Rules
**Problem**: Jenkins pod couldn't mount EFS volume - mount failed with exit status 32  
**Root Cause**: EFS security group had no ingress rules allowing NFS traffic  
**Solution**: Added `allowDefaultPortFrom()` to storage stack  
**Result**: Security group now allows NFS (port 2049) from VPC CIDR (10.0.0.0/16)

### 4. ✅ StatefulSet Storage Class Mismatch
**Problem**: PVC couldn't bind - looking for `efs-sc` but PV had `jenkins-efs`  
**Root Cause**: YAML file had wrong storage class name  
**Solution**: Updated statefulset.yaml to use `jenkins-efs`  
**Result**: PVC now binds to PV successfully

## Current Issue: NFS Client Not Available on AL2023

### Problem
Jenkins pod still can't mount EFS volume despite:
- ✅ Security group allowing NFS traffic
- ✅ PVC bound to PV
- ✅ Correct EFS DNS name
- ✅ Node can reach EFS endpoints

### Root Cause
Amazon Linux 2023 (AL2023) doesn't include nfs-utils by default. The node is trying to mount NFS but doesn't have the required client tools.

### Evidence
```
Warning  FailedMount  kubelet  MountVolume.SetUp failed for volume "jenkins-home-pv" : mount failed: exit status 32
Mounting command: mount
Mounting arguments: -t nfs -o hard,nfsvers=4.1,retrans=2,rsize=1048576,timeo=600,wsize=1048576 
  fs-095eed9d5c8fcb1b9.efs.us-west-2.amazonaws.com:/ /var/lib/kubelet/pods/.../volumes/kubernetes.io~nfs/jenkins-home-pv
```

## Solutions (Choose One)

### Option 1: Use EFS CSI Driver (Recommended - CDK Philosophy)
**Pros**:
- Follows CDK deployment philosophy
- Managed through code
- No manual node configuration
- Industry standard approach

**Implementation**:
1. Deploy EFS CSI driver via CDK
2. Create StorageClass using EFS CSI provisioner
3. Update PV to use CSI driver instead of NFS
4. Redeploy application stack

**Files to modify**:
- `lib/jenkins/jenkins-application-stack.ts` - Add EFS CSI driver
- Remove static PV/StorageClass (CSI driver creates them dynamically)

### Option 2: Install nfs-utils via User Data (Quick Fix)
**Pros**:
- Quick to implement
- Minimal code changes

**Cons**:
- Violates deployment philosophy (manual configuration)
- Not portable
- Requires node group recreation

**Implementation**:
Add to node group user data:
```bash
yum install -y nfs-utils
```

## Current Infrastructure State

### Working Components
- ✅ EKS Cluster (1.32) - Active
- ✅ Controller Node - Ready (ip-10-0-1-107.us-west-2.compute.internal)
- ✅ ALB Controller - Running (2/2 pods)
- ✅ EFS File System - Available with proper security group
- ✅ PV/PVC - Bound
- ✅ IngressClass - Created
- ✅ Ingress - Created (waiting for backend pods)

### Pending Components
- ⏳ Jenkins Controller Pod - Init:0/1 (waiting for EFS mount)
- ⏳ ALB - Not created (waiting for backend pods)
- ⏳ Jenkins URL - Not available

## CDK Code Changes Made

### lib/jenkins/jenkins-storage-stack.ts
```typescript
// Added NFS ingress rule
this.efsFileSystem.connections.allowDefaultPortFrom(
  ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
  'Allow NFS from VPC'
);
```

### lib/jenkins/jenkins-application-stack.ts
```typescript
// Added TargetGroupBinding CRD
const targetGroupBindingCRD = props.cluster.addManifest('TargetGroupBindingCRD', {
  apiVersion: 'apiextensions.k8s.io/v1',
  kind: 'CustomResourceDefinition',
  // ... full CRD definition
});
```

### lib/jenkins/jenkins-eks-nodegroups-stack.ts
```typescript
// Exported node roles for aws-auth
public readonly controllerNodeRole: iam.Role;
public readonly agentNodeRole: iam.Role;
```

### k8s/jenkins/statefulset.yaml
```yaml
# Changed storage class name
storageClassName: jenkins-efs  # was: efs-sc
```

## Manual Steps Performed (To Be Automated)

### aws-auth ConfigMap Update
```bash
kubectl apply -f aws-auth-patch.yaml
```

**Content**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    - rolearn: arn:aws:iam::450683699755:role/jenkins-eks-controller-node-role-us-west-2
      username: system:node:{{EC2PrivateDNSName}}
      groups:
        - system:bootstrappers
        - system:nodes
    - rolearn: arn:aws:iam::450683699755:role/jenkins-eks-agent-node-role-us-west-2
      username: system:node:{{EC2PrivateDNSName}}
      groups:
        - system:bootstrappers
        - system:nodes
  mapUsers: |
    - userarn: arn:aws:iam::450683699755:user/piotrbod
      username: piotrbod
      groups:
        - system:masters
```

**TODO**: Automate this via CDK custom resource or use managed node groups

## Next Steps

1. **Immediate**: Implement EFS CSI driver in CDK
2. **Follow-up**: Automate aws-auth updates via custom resource
3. **Testing**: Verify Jenkins pod starts and ALB is created
4. **Access**: Test Jenkins UI via ALB URL

## Key Learnings

1. **CfnNodegroup doesn't auto-update aws-auth** - Need custom resource or managed node groups
2. **AL2023 is minimal** - Doesn't include nfs-utils by default
3. **EFS security groups need explicit rules** - `allowDefaultPortFrom()` required
4. **ALB Controller needs CRDs** - Must be deployed before controller
5. **StatefulSet volumeClaimTemplates are immutable** - Must delete and recreate

## Files Modified
- `lib/jenkins/jenkins-storage-stack.ts`
- `lib/jenkins/jenkins-application-stack.ts`
- `lib/jenkins/jenkins-eks-nodegroups-stack.ts`
- `k8s/jenkins/statefulset.yaml`
- `aws-auth-patch.yaml` (temporary manual fix)

## Deployment Commands Used
```bash
npm run build
cdk deploy JenkinsStorageStack --require-approval never
cdk deploy JenkinsApplicationStack --require-approval never
kubectl apply -f aws-auth-patch.yaml
kubectl delete pod jenkins-controller-0 -n jenkins
```
