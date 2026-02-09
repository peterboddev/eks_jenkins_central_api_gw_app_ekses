# EFS CSI Driver Deployment

This directory contains Kubernetes manifests for deploying the AWS EFS CSI Driver on the Jenkins EKS cluster.

## Overview

The EFS CSI Driver enables Kubernetes to dynamically provision and mount Amazon EFS file systems as persistent volumes. This is required for the Jenkins controller to store its home directory data (configurations, jobs, plugins, build history) on EFS.

**Requirements:** 6.8 - EKS cluster has EFS CSI Driver installed for dynamic volume provisioning

## Components

The EFS CSI Driver consists of the following components:

1. **Service Accounts** (`serviceaccount.yaml`)
   - `efs-csi-controller-sa`: Service account for the controller with IRSA annotation
   - `efs-csi-node-sa`: Service account for the node plugin

2. **RBAC Resources** (`rbac.yaml`)
   - ClusterRole and ClusterRoleBinding for controller permissions
   - ClusterRole and ClusterRoleBinding for node plugin permissions

3. **CSI Driver** (`csi-driver.yaml`)
   - CSIDriver object defining the driver capabilities

4. **Controller Deployment** (`controller-deployment.yaml`)
   - Manages EFS access point creation/deletion
   - Handles volume provisioning requests
   - Runs 2 replicas for high availability

5. **Node DaemonSet** (`node-daemonset.yaml`)
   - Runs on all worker nodes
   - Mounts EFS file systems to pods
   - Handles volume mount/unmount operations

6. **Storage Class** (`storageclass.yaml`)
   - Defines the EFS storage class for dynamic provisioning
   - Configures EFS Access Points for isolated directories
   - Sets directory permissions and GID range

## Prerequisites

Before deploying the EFS CSI Driver, ensure:

1. The EKS cluster is created and accessible via kubectl
2. The EFS file system is created (from CDK stack)
3. The EFS CSI Driver IAM role is created (from CDK stack)
4. The OIDC provider is configured for the EKS cluster (from CDK stack)

## Deployment Steps

### Step 1: Get the EFS CSI Driver IAM Role ARN

Get the IAM role ARN from the CDK stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --query "Stacks[0].Outputs[?OutputKey=='EfsCsiDriverRoleArnOutput'].OutputValue" \
  --output text
```

### Step 2: Update the Service Account Annotation

Edit `serviceaccount.yaml` and replace `REPLACE_WITH_EFS_CSI_DRIVER_ROLE_ARN` with the actual IAM role ARN:

```yaml
annotations:
  eks.amazonaws.com/role-arn: arn:aws:iam::<account-id>:role/jenkins-eks-efs-csi-driver-role
```

Or use sed to replace it:

```bash
EFS_CSI_ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --query "Stacks[0].Outputs[?OutputKey=='EfsCsiDriverRoleArnOutput'].OutputValue" \
  --output text)

sed -i "s|REPLACE_WITH_EFS_CSI_DRIVER_ROLE_ARN|${EFS_CSI_ROLE_ARN}|g" serviceaccount.yaml
```

### Step 3: Deploy the EFS CSI Driver

Apply all manifests in order:

```bash
# Apply in the correct order
kubectl apply -f namespace.yaml
kubectl apply -f serviceaccount.yaml
kubectl apply -f rbac.yaml
kubectl apply -f csi-driver.yaml
kubectl apply -f controller-deployment.yaml
kubectl apply -f node-daemonset.yaml
```

Or apply all at once:

```bash
kubectl apply -f .
```

### Step 4: Get the EFS File System ID

Get the EFS file system ID from the CDK stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --query "Stacks[0].Outputs[?OutputKey=='EfsFileSystemIdOutput'].OutputValue" \
  --output text
```

### Step 5: Update the Storage Class

Edit `storageclass.yaml` and replace `${EFS_FILE_SYSTEM_ID}` with the actual EFS file system ID:

```yaml
parameters:
  fileSystemId: fs-0123456789abcdef0  # Replace with actual file system ID
```

Or use sed to replace it:

```bash
EFS_FILE_SYSTEM_ID=$(aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --query "Stacks[0].Outputs[?OutputKey=='EfsFileSystemIdOutput'].OutputValue" \
  --output text)

sed -i "s|\${EFS_FILE_SYSTEM_ID}|${EFS_FILE_SYSTEM_ID}|g" storageclass.yaml
```

### Step 6: Deploy the Storage Class

Apply the storage class manifest:

```bash
kubectl apply -f storageclass.yaml
```

### Step 7: Verify the Deployment

Check that all components are running:

```bash
# Check controller deployment
kubectl get deployment efs-csi-controller -n kube-system

# Check node DaemonSet
kubectl get daemonset efs-csi-node -n kube-system

# Check all pods
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-efs-csi-driver

# Check CSI driver registration
kubectl get csidriver efs.csi.aws.com

# Check storage class
kubectl get storageclass efs-sc
```

Expected output:
- Controller deployment should have 2/2 replicas ready
- Node DaemonSet should have pods running on all worker nodes
- All pods should be in Running state
- CSI driver should be registered
- Storage class `efs-sc` should be available

### Step 8: Verify IRSA Configuration

Check that the service account has the correct IRSA annotation:

```bash
kubectl describe serviceaccount efs-csi-controller-sa -n kube-system
```

You should see the annotation:
```
Annotations: eks.amazonaws.com/role-arn: arn:aws:iam::<account-id>:role/jenkins-eks-efs-csi-driver-role
```

## Troubleshooting

### Controller pods not starting

Check the controller logs:
```bash
kubectl logs -n kube-system deployment/efs-csi-controller -c efs-plugin
```

Common issues:
- IRSA annotation missing or incorrect
- IAM role doesn't have required permissions
- OIDC provider not configured correctly

### Node pods not starting

Check the node plugin logs:
```bash
kubectl logs -n kube-system daemonset/efs-csi-node -c efs-plugin
```

Common issues:
- EFS mount targets not available in all AZs
- Security group not allowing NFS traffic (port 2049)
- Worker nodes can't reach EFS mount targets

### Volume provisioning fails

Check the provisioner logs:
```bash
kubectl logs -n kube-system deployment/efs-csi-controller -c csi-provisioner
```

Common issues:
- EFS file system ID not specified in StorageClass
- IAM role doesn't have permissions to create access points
- EFS file system doesn't exist

### Storage class not working

Check the storage class configuration:
```bash
kubectl describe storageclass efs-sc
```

Verify the parameters:
- `fileSystemId` should be set to your actual EFS file system ID (not `${EFS_FILE_SYSTEM_ID}`)
- `provisioningMode` should be `efs-ap`
- `basePath` should be `/jenkins`

## Testing the Storage Class

After deploying the storage class, you can test it by creating a test PVC:

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-efs-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs-sc
  resources:
    requests:
      storage: 5Gi
EOF
```

Check the PVC status:
```bash
kubectl get pvc test-efs-pvc -n default
```

The PVC should be in `Bound` state. If it's `Pending`, check the provisioner logs.

Create a test pod to mount the volume:
```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: test-efs-pod
  namespace: default
spec:
  containers:
  - name: test
    image: busybox
    command: ["/bin/sh"]
    args: ["-c", "echo 'Hello from EFS!' > /data/test.txt && cat /data/test.txt && sleep 3600"]
    volumeMounts:
    - name: efs-volume
      mountPath: /data
  volumes:
  - name: efs-volume
    persistentVolumeClaim:
      claimName: test-efs-pvc
EOF
```

Check the pod logs to verify the file was written:
```bash
kubectl logs test-efs-pod -n default
```

You should see: `Hello from EFS!`

Clean up the test resources:
```bash
kubectl delete pod test-efs-pod -n default
kubectl delete pvc test-efs-pvc -n default
```

## Next Steps

After deploying the EFS CSI Driver and storage class, proceed to:

1. **Task 9**: Deploy Jenkins controller with EFS persistent volume
2. Configure Jenkins to use the `efs-sc` storage class for its home directory

## References

- [AWS EFS CSI Driver Documentation](https://github.com/kubernetes-sigs/aws-efs-csi-driver)
- [EKS User Guide - EFS CSI Driver](https://docs.aws.amazon.com/eks/latest/userguide/efs-csi.html)
- [IAM Roles for Service Accounts](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
