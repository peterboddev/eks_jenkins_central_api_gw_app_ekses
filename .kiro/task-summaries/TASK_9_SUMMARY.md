# Tasks 9.1-9.5 Summary: Jenkins Controller Deployment

## Overview

Successfully completed tasks 9.1-9.5 to deploy the Jenkins controller on Amazon EKS. All Kubernetes manifests have been created with proper configuration for high availability, persistent storage, and AWS IAM integration.

## Completed Tasks

### Task 9.1: Create Jenkins namespace and service account ✅

**Created Files**:
- `k8s/jenkins/namespace.yaml`: Defines the `jenkins` namespace
- `k8s/jenkins/serviceaccount.yaml`: Creates `jenkins-controller` service account with IRSA annotation

**Key Features**:
- Namespace: `jenkins` for resource isolation
- Service account with IRSA annotation for AWS IAM role assumption
- Placeholder for IAM role ARN (automatically updated by deployment script)

**Requirements Satisfied**: 5.3, 5.4

### Task 9.2: Create Jenkins controller StatefulSet ✅

**Created Files**:
- `k8s/jenkins/statefulset.yaml`: Defines Jenkins controller StatefulSet

**Key Features**:
- **Replicas**: 1 (single controller instance)
- **Image**: `jenkins/jenkins:lts`
- **Resources**:
  - Requests: 2 CPU, 4Gi memory
  - Limits: 4 CPU, 8Gi memory
- **Node Placement**:
  - Node selector: `workload-type=jenkins-controller`
  - Toleration: `workload-type=jenkins-controller:NoSchedule`
- **Environment Variables**:
  - `JAVA_OPTS`: `-Xmx4g -Xms2g`
  - `JENKINS_OPTS`: `--sessionTimeout=1440`
- **Ports**:
  - HTTP: 8080
  - JNLP: 50000
- **Volume Mount**: `/var/jenkins_home` (EFS-backed)
- **Health Checks**:
  - Liveness probe: HTTP GET /login (port 8080)
  - Readiness probe: HTTP GET /login (port 8080)
- **Restart Policy**: Always (automatic restart on failure)

**Requirements Satisfied**: 3.1, 3.3, 3.9

### Task 9.3: Create persistent volume claim for Jenkins home ✅

**Created Files**:
- `k8s/jenkins/pvc.yaml`: Defines PersistentVolumeClaim for Jenkins home directory

**Key Features**:
- **Storage Class**: `efs-sc` (EFS CSI Driver)
- **Access Mode**: `ReadWriteMany` (supports multiple pod access)
- **Storage Request**: 100Gi (symbolic size, EFS grows automatically)
- **Mount Path**: `/var/jenkins_home` (configured in StatefulSet)

**Requirements Satisfied**: 3.2, 6.1, 6.9

### Task 9.4: Create Jenkins service ✅

**Created Files**:
- `k8s/jenkins/service.yaml`: Defines ClusterIP service for Jenkins controller

**Key Features**:
- **Service Type**: ClusterIP (internal cluster communication)
- **Ports**:
  - HTTP: 8080 (web interface)
  - JNLP: 50000 (agent communication)
- **Selector**: `app=jenkins-controller`

**Requirements Satisfied**: 3.4

### Task 9.5: Configure Jenkins pod restart policy ✅

**Configuration**:
- Restart policy set to `Always` in StatefulSet (task 9.2)
- Ensures automatic pod restart on failure

**Requirements Satisfied**: 3.6

## Additional Files Created

### Kustomization File
- `k8s/jenkins/kustomization.yaml`: Organizes all manifests for deployment with Kustomize

### Deployment Scripts
- `k8s/jenkins/deploy.sh`: Automated deployment script with:
  - Prerequisites checking (kubectl, AWS CLI, cluster access)
  - Automatic IAM role ARN retrieval from CloudFormation
  - Service account annotation update
  - EFS CSI Driver verification
  - Controller node group verification
  - Manifest deployment
  - Pod readiness waiting
  - Deployment information display
  - Access instructions

- `k8s/jenkins/uninstall.sh`: Automated uninstall script with:
  - Confirmation prompts
  - Resource deletion in reverse order
  - Optional namespace deletion
  - Safe cleanup

### Documentation
- `k8s/jenkins/README.md`: Comprehensive documentation including:
  - Architecture overview
  - Prerequisites and requirements
  - Deployment instructions (quick start, manual, Kustomize)
  - Configuration details
  - Access instructions
  - Verification steps
  - Troubleshooting guide
  - Uninstallation instructions
  - Requirements mapping
  - Next steps

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Jenkins Namespace                        │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Jenkins Controller StatefulSet              │    │
│  │                                                      │    │
│  │  ┌──────────────────────────────────────────────┐  │    │
│  │  │         Jenkins Controller Pod               │  │    │
│  │  │                                              │  │    │
│  │  │  Image: jenkins/jenkins:lts                 │  │    │
│  │  │  Resources: 2-4 CPU, 4-8Gi Memory           │  │    │
│  │  │  Ports: 8080 (HTTP), 50000 (JNLP)          │  │    │
│  │  │                                              │  │    │
│  │  │  Volume: /var/jenkins_home                  │  │    │
│  │  │  ↓                                           │  │    │
│  │  └──────────────────────────────────────────────┘  │    │
│  │         ↓                                           │    │
│  └─────────┼───────────────────────────────────────────┘    │
│            ↓                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │    PersistentVolumeClaim: jenkins-home              │   │
│  │    Storage Class: efs-sc                            │   │
│  │    Access Mode: ReadWriteMany                       │   │
│  │    Size: 100Gi (symbolic)                           │   │
│  └─────────────────────────────────────────────────────┘   │
│            ↓                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │    Service: jenkins (ClusterIP)                     │   │
│  │    Ports: 8080 (HTTP), 50000 (JNLP)               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │    ServiceAccount: jenkins-controller               │   │
│  │    IRSA Annotation: eks.amazonaws.com/role-arn      │   │
│  └─────────────────────────────────────────────────────┘   │
│            ↓                                                 │
└────────────┼─────────────────────────────────────────────────┘
             ↓
    ┌────────────────────────────────────────┐
    │  IAM Role: jenkins-eks-controller-role │
    │  Permissions: CloudFormation, S3,      │
    │  DynamoDB, EC2, VPC, IAM, EKS, STS    │
    └────────────────────────────────────────┘
             ↓
    ┌────────────────────────────────────────┐
    │  EFS File System                       │
    │  Storage Class: efs-sc                 │
    │  Performance Mode: General Purpose     │
    │  Encryption: Enabled                   │
    └────────────────────────────────────────┘
```

## Deployment Flow

1. **Prerequisites Check**:
   - Verify kubectl and AWS CLI are installed
   - Verify cluster access
   - Verify EFS CSI Driver is installed

2. **IAM Role Configuration**:
   - Retrieve Jenkins controller IAM role ARN from CloudFormation
   - Update service account annotation with role ARN

3. **Resource Deployment**:
   - Create namespace
   - Create service account with IRSA
   - Create PVC for persistent storage
   - Create service for internal communication
   - Create StatefulSet for Jenkins controller

4. **Verification**:
   - Wait for pod to be ready
   - Display deployment information
   - Provide access instructions

## Access Instructions

### Port Forward (Initial Setup)

```bash
# Forward port 8080 to local machine
kubectl port-forward -n jenkins svc/jenkins 8080:8080

# Open browser to http://localhost:8080
```

### Get Initial Admin Password

```bash
# Get pod name
POD_NAME=$(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}')

# Retrieve initial admin password
kubectl exec -n jenkins -it $POD_NAME -- cat /var/jenkins_home/secrets/initialAdminPassword
```

## Requirements Mapping

| Requirement | Description | Implementation |
|-------------|-------------|----------------|
| 3.1 | StatefulSet with 1 replica | `statefulset.yaml` - replicas: 1 |
| 3.2 | Persistent volume backed by EFS | `pvc.yaml` - storageClassName: efs-sc |
| 3.3 | Resource allocation (4GB memory, 2 CPU) | `statefulset.yaml` - resources section |
| 3.4 | Kubernetes Service | `service.yaml` - ClusterIP service |
| 3.6 | Automatic pod restart | `statefulset.yaml` - restartPolicy: Always |
| 3.9 | Run on on-demand instances | `statefulset.yaml` - nodeSelector and tolerations |
| 5.3 | Service account with IRSA | `serviceaccount.yaml` - IRSA annotation |
| 5.4 | Jenkins uses service account | `statefulset.yaml` - serviceAccountName |
| 6.1 | EFS backend storage | `pvc.yaml` - storageClassName: efs-sc |
| 6.9 | ReadWriteMany access mode | `pvc.yaml` - accessModes: ReadWriteMany |

## Verification Steps

### 1. Check Deployment Status

```bash
# Get all resources in jenkins namespace
kubectl get all -n jenkins

# Expected output:
# - StatefulSet: jenkins-controller (1/1 ready)
# - Pod: jenkins-controller-0 (Running)
# - Service: jenkins (ClusterIP)
# - PVC: jenkins-home (Bound)
```

### 2. Check Pod Logs

```bash
# View pod logs
kubectl logs -n jenkins -l app=jenkins-controller

# Should show Jenkins startup logs
```

### 3. Check Service Account

```bash
# Verify IRSA annotation
kubectl get sa -n jenkins jenkins-controller -o jsonpath='{.metadata.annotations.eks\.amazonaws\.com/role-arn}'

# Should output: arn:aws:iam::<account-id>:role/jenkins-eks-controller-role
```

### 4. Check Persistent Volume

```bash
# Check PVC status
kubectl get pvc -n jenkins

# Should show: jenkins-home (Bound)
```

## Troubleshooting

### Pod Not Starting

**Symptoms**: Pod stuck in Pending or ContainerCreating state

**Possible Causes**:
1. No controller nodes available (check node labels)
2. EFS mount failure (check EFS CSI Driver)
3. Insufficient resources (check node capacity)

**Solutions**:
```bash
# Check node labels
kubectl get nodes --show-labels | grep workload-type

# Check pod events
kubectl describe pod -n jenkins -l app=jenkins-controller

# Check EFS CSI Driver
kubectl get pods -n kube-system -l app=efs-csi-node
```

### PVC Not Binding

**Symptoms**: PVC stuck in Pending state

**Possible Causes**:
1. EFS CSI Driver not installed
2. Storage class not configured
3. EFS file system not accessible

**Solutions**:
```bash
# Check storage class
kubectl get storageclass efs-sc

# Check PVC events
kubectl describe pvc -n jenkins jenkins-home

# Install EFS CSI Driver if needed
cd ../efs-csi-driver && ./deploy.sh
```

### IRSA Not Working

**Symptoms**: Jenkins cannot access AWS resources

**Possible Causes**:
1. IAM role ARN not set correctly
2. OIDC provider not configured
3. Trust policy incorrect

**Solutions**:
```bash
# Check service account annotation
kubectl get sa -n jenkins jenkins-controller -o yaml

# Check pod environment variables
kubectl exec -n jenkins -it $(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}') -- env | grep AWS

# Verify IAM role trust policy in AWS console
```

## Next Steps

1. **Deploy Jenkins Controller**:
   ```bash
   cd k8s/jenkins
   ./deploy.sh
   ```

2. **Access Jenkins UI** and complete initial setup

3. **Install Required Plugins**:
   - Kubernetes Plugin (dynamic agent provisioning)
   - AWS Steps Plugin (AWS API interactions)
   - Pipeline Plugin (Jenkinsfile support)
   - S3 Plugin (artifact storage)

4. **Configure Jenkins Agents** (Task 10.1)

5. **Deploy Cluster Autoscaler** (Task 11.1)

6. **Deploy Node Termination Handler** (Task 12.1)

## Files Created

```
k8s/jenkins/
├── namespace.yaml           # Jenkins namespace
├── serviceaccount.yaml      # Service account with IRSA
├── pvc.yaml                 # Persistent volume claim
├── statefulset.yaml         # Jenkins controller StatefulSet
├── service.yaml             # ClusterIP service
├── kustomization.yaml       # Kustomize configuration
├── deploy.sh                # Deployment script
├── uninstall.sh             # Uninstall script
└── README.md                # Comprehensive documentation
```

## Summary

All tasks 9.1-9.5 have been successfully completed. The Jenkins controller deployment manifests are ready for deployment to the EKS cluster. The deployment includes:

- ✅ Namespace and service account with IRSA
- ✅ StatefulSet with proper resource allocation and node placement
- ✅ Persistent volume claim backed by EFS
- ✅ ClusterIP service for internal communication
- ✅ Automatic pod restart policy
- ✅ Deployment and uninstall scripts
- ✅ Comprehensive documentation

The manifests follow Kubernetes best practices and satisfy all specified requirements. The deployment is ready for testing once the EKS cluster, EFS CSI Driver, and controller node group are in place.
