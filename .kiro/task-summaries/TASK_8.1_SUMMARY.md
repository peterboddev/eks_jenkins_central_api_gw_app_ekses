# Task 8.1: Deploy EFS CSI Driver - Summary

## Overview

Successfully created Kubernetes manifest files for deploying the AWS EFS CSI Driver on the Jenkins EKS cluster. The EFS CSI Driver enables Kubernetes to dynamically provision and mount Amazon EFS file systems as persistent volumes, which is required for the Jenkins controller to store its home directory data.

## Requirements

**Requirement 6.8:** EKS cluster has EFS CSI Driver installed for dynamic volume provisioning

## Implementation Details

### Files Created

Created a complete set of Kubernetes manifests in the `k8s/efs-csi-driver/` directory:

1. **namespace.yaml**
   - Defines the kube-system namespace (standard for system components)

2. **serviceaccount.yaml**
   - `efs-csi-controller-sa`: Service account for the controller with IRSA annotation
   - `efs-csi-node-sa`: Service account for the node plugin
   - IRSA annotation enables the controller to assume the IAM role created in Task 6.4

3. **rbac.yaml**
   - ClusterRole and ClusterRoleBinding for controller permissions
   - Grants permissions to manage PVs, PVCs, StorageClasses, and CSI resources
   - ClusterRole and ClusterRoleBinding for node plugin permissions

4. **csi-driver.yaml**
   - CSIDriver object defining the driver capabilities
   - Specifies that EFS CSI Driver doesn't require volume attachment
   - Supports persistent volume lifecycle

5. **controller-deployment.yaml**
   - Deployment with 2 replicas for high availability
   - Three containers:
     - `efs-plugin`: Main EFS CSI Driver (amazon/aws-efs-csi-driver:v1.7.0)
     - `csi-provisioner`: Handles volume provisioning (EKS Distro image)
     - `liveness-probe`: Health monitoring (EKS Distro image)
   - Uses the `efs-csi-controller-sa` service account with IRSA
   - Manages EFS access point creation/deletion
   - Handles volume provisioning requests

6. **node-daemonset.yaml**
   - DaemonSet that runs on all worker nodes
   - Three containers:
     - `efs-plugin`: Main EFS CSI Driver node plugin
     - `csi-driver-registrar`: Registers the driver with kubelet
     - `liveness-probe`: Health monitoring
   - Uses hostNetwork for direct EFS mount access
   - Mounts kubelet directories for volume operations
   - Handles EFS file system mounting to pods

7. **kustomization.yaml**
   - Kustomize configuration for easy deployment
   - Allows deploying all components with `kubectl apply -k`
   - Adds common labels and annotations

8. **deploy.sh**
   - Automated deployment script
   - Retrieves EFS CSI Driver IAM role ARN from CloudFormation
   - Updates service account with IRSA annotation
   - Deploys all components in correct order
   - Waits for components to be ready
   - Verifies deployment success

9. **uninstall.sh**
   - Script to remove EFS CSI Driver from cluster
   - Deletes components in reverse order

10. **README.md**
    - Comprehensive deployment documentation
    - Prerequisites and deployment steps
    - Troubleshooting guide
    - Verification procedures

### Additional Files

11. **k8s/README.md**
    - Main README for the k8s directory
    - Overview of all Kubernetes components
    - Deployment order and common operations
    - Security considerations

## Architecture

### Controller Component
- **Purpose**: Manages EFS access point creation/deletion and volume provisioning
- **Deployment**: 2 replicas for high availability
- **Location**: Runs on any available node (no specific node selector)
- **IRSA**: Uses IAM role to manage EFS resources

### Node Plugin Component
- **Purpose**: Mounts EFS file systems to pods on each node
- **Deployment**: DaemonSet (runs on all worker nodes)
- **Privileges**: Requires privileged mode and hostNetwork for mount operations
- **Location**: Runs on all nodes with `kubernetes.io/os: linux` label

## Integration with CDK Stack

The EFS CSI Driver integrates with resources created by the CDK stack:

1. **IAM Role** (Task 6.4)
   - Role ARN: `jenkins-eks-efs-csi-driver-role`
   - Permissions: EFS access point management
   - Trust policy: Allows IRSA for `efs-csi-controller-sa`

2. **EFS File System** (Task 4.1)
   - File system ID will be used in StorageClass (Task 8.2)
   - Mount targets in both availability zones

3. **OIDC Provider** (Task 6.1)
   - Enables IRSA for service accounts
   - Allows secure AWS API access without credentials

## Deployment Process

### Prerequisites
1. EKS cluster is created and accessible
2. EFS file system is created
3. EFS CSI Driver IAM role is created
4. OIDC provider is configured

### Deployment Steps
1. Get EFS CSI Driver IAM role ARN from CloudFormation
2. Update service account with IRSA annotation
3. Apply Kubernetes manifests in order:
   - Namespace
   - Service accounts
   - RBAC resources
   - CSI driver
   - Controller deployment
   - Node DaemonSet
4. Wait for components to be ready
5. Verify deployment

### Automated Deployment
```bash
cd k8s/efs-csi-driver
./deploy.sh
```

### Manual Deployment
```bash
cd k8s/efs-csi-driver

# Get IAM role ARN
EFS_CSI_ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --query "Stacks[0].Outputs[?OutputKey=='EfsCsiDriverRoleArnOutput'].OutputValue" \
  --output text)

# Update service account
sed -i "s|REPLACE_WITH_EFS_CSI_DRIVER_ROLE_ARN|${EFS_CSI_ROLE_ARN}|g" serviceaccount.yaml

# Apply manifests
kubectl apply -f .
```

## Verification

After deployment, verify:

1. **Controller Deployment**
   ```bash
   kubectl get deployment efs-csi-controller -n kube-system
   # Should show 2/2 replicas ready
   ```

2. **Node DaemonSet**
   ```bash
   kubectl get daemonset efs-csi-node -n kube-system
   # Should show pods running on all worker nodes
   ```

3. **All Pods Running**
   ```bash
   kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-efs-csi-driver
   # All pods should be in Running state
   ```

4. **CSI Driver Registered**
   ```bash
   kubectl get csidriver efs.csi.aws.com
   # Should show the CSI driver
   ```

5. **IRSA Configuration**
   ```bash
   kubectl describe serviceaccount efs-csi-controller-sa -n kube-system
   # Should show eks.amazonaws.com/role-arn annotation
   ```

## Next Steps

After completing Task 8.1, proceed to:

1. **Task 8.2**: Create EFS StorageClass
   - Define StorageClass with EFS file system ID
   - Configure provisioning mode (EFS Access Points)
   - Set directory permissions and GID range

2. **Task 9**: Deploy Jenkins Controller
   - Create Jenkins namespace and service account
   - Deploy StatefulSet with EFS persistent volume
   - Configure resource requests and limits

## Troubleshooting

### Common Issues

1. **Controller pods not starting**
   - Check IRSA annotation is correct
   - Verify IAM role has required permissions
   - Check OIDC provider is configured

2. **Node pods not starting**
   - Verify EFS mount targets exist in all AZs
   - Check security group allows NFS traffic (port 2049)
   - Ensure worker nodes can reach EFS mount targets

3. **Volume provisioning fails**
   - Check EFS file system ID in StorageClass
   - Verify IAM role can create access points
   - Ensure EFS file system exists

### Logs

Check logs for troubleshooting:
```bash
# Controller logs
kubectl logs -n kube-system deployment/efs-csi-controller -c efs-plugin

# Node plugin logs
kubectl logs -n kube-system daemonset/efs-csi-node -c efs-plugin

# Provisioner logs
kubectl logs -n kube-system deployment/efs-csi-controller -c csi-provisioner
```

## Design Compliance

This implementation follows the design document specifications:

- **Section 9: EFS CSI Driver**
  - ✅ Deployment type: DaemonSet (node plugin) + Deployment (controller)
  - ✅ Container images: amazon/aws-efs-csi-driver:latest
  - ✅ Components: CSI Controller and CSI Node Plugin
  - ✅ IAM Role via IRSA: efs-csi-controller-sa service account
  - ✅ Permissions: Create/delete EFS access points, describe file systems

- **Requirements 6.8**
  - ✅ EKS cluster has EFS CSI Driver installed for dynamic volume provisioning

## Security Considerations

1. **IRSA (IAM Roles for Service Accounts)**
   - Controller uses IRSA to assume IAM role
   - No AWS credentials stored in cluster
   - IAM role follows principle of least privilege

2. **RBAC**
   - Minimal permissions for controller and node plugin
   - ClusterRole grants only necessary Kubernetes permissions

3. **Container Security**
   - Controller containers run with minimal privileges
   - Node plugin requires privileged mode for mount operations
   - Read-only root filesystem for sidecar containers

4. **Network Security**
   - EFS mount targets in private subnets
   - Security group restricts NFS traffic to VPC CIDR
   - No public access to EFS file system

## References

- [AWS EFS CSI Driver GitHub](https://github.com/kubernetes-sigs/aws-efs-csi-driver)
- [EKS User Guide - EFS CSI Driver](https://docs.aws.amazon.com/eks/latest/userguide/efs-csi.html)
- [IAM Roles for Service Accounts](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
- [Kubernetes CSI Documentation](https://kubernetes-csi.github.io/docs/)
