# Jenkins Controller Deployment

This directory contains Kubernetes manifests for deploying the Jenkins controller on Amazon EKS.

## Overview

The Jenkins controller is deployed as a StatefulSet with persistent storage backed by Amazon EFS. It runs on dedicated on-demand instances to ensure high availability and reliability.

## Architecture

- **Namespace**: `jenkins`
- **Service Account**: `jenkins-controller` (with IRSA for AWS permissions)
- **StatefulSet**: `jenkins-controller` (1 replica)
- **Service**: `jenkins` (ClusterIP)
- **Persistent Volume**: EFS-backed storage for Jenkins home directory
- **Agent Pod Template**: ConfigMap with Jenkins Configuration as Code (JCasC) for dynamic agent provisioning

## Requirements

### Prerequisites

1. **EKS Cluster**: Running EKS cluster with Kubernetes 1.28 or later
2. **EFS CSI Driver**: Installed and configured with storage class `efs-sc`
3. **Controller Node Group**: On-demand instances with label `workload-type=jenkins-controller`
4. **IAM Role**: Jenkins controller IAM role created via CDK stack
5. **kubectl**: Configured to access the EKS cluster
6. **AWS CLI**: Configured with appropriate credentials

### CDK Stack Outputs Required

- `JenkinsEksControllerRoleArn`: IAM role ARN for Jenkins controller (used for IRSA)

## Deployment

### Quick Start

```bash
# Make the deployment script executable
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

The deployment script will:
1. Check prerequisites (kubectl, AWS CLI, cluster access)
2. Retrieve the Jenkins controller IAM role ARN from CloudFormation
3. Update the service account with the correct IAM role ARN
4. Verify EFS CSI Driver storage class exists
5. Deploy all Kubernetes manifests
6. Wait for the Jenkins controller pod to be ready
7. Display deployment information and access instructions

### Manual Deployment

If you prefer to deploy manually:

```bash
# 1. Update serviceaccount.yaml with your IAM role ARN
# Replace ACCOUNT_ID with your AWS account ID
sed -i 's/ACCOUNT_ID/123456789012/g' serviceaccount.yaml

# 2. Apply manifests in order
kubectl apply -f namespace.yaml
kubectl apply -f serviceaccount.yaml
kubectl apply -f pvc.yaml
kubectl apply -f service.yaml
kubectl apply -f statefulset.yaml

# 3. Verify deployment
kubectl get all -n jenkins
```

### Using Kustomize

```bash
# Deploy using kustomize
kubectl apply -k .

# Verify deployment
kubectl get all -n jenkins
```

## Configuration

### Resource Allocation

The Jenkins controller is configured with the following resources:

- **CPU Request**: 2 cores
- **CPU Limit**: 4 cores
- **Memory Request**: 4Gi
- **Memory Limit**: 8Gi

These values can be adjusted in `statefulset.yaml` based on your workload requirements.

### Environment Variables

- `JAVA_OPTS`: `-Xmx4g -Xms2g` (Java heap size)
- `JENKINS_OPTS`: `--sessionTimeout=1440` (Session timeout in minutes)

### Persistent Storage

- **Storage Class**: `efs-sc` (EFS CSI Driver)
- **Access Mode**: `ReadWriteMany`
- **Storage Request**: `100Gi` (symbolic size, EFS grows automatically)
- **Mount Path**: `/var/jenkins_home`

### Node Placement

The Jenkins controller is configured to run on dedicated on-demand instances:

- **Node Selector**: `workload-type=jenkins-controller`
- **Toleration**: `workload-type=jenkins-controller:NoSchedule`

This ensures the controller runs on reliable on-demand instances and not on spot instances.

### Jenkins Agent Pod Template

The agent pod template is configured using Jenkins Configuration as Code (JCasC) via a ConfigMap:

- **Image**: `jenkins/inbound-agent:latest`
- **CPU Request**: 1 core
- **CPU Limit**: 2 cores
- **Memory Request**: 2Gi
- **Memory Limit**: 4Gi
- **Node Affinity**: Prefers nodes with label `node-lifecycle=spot` (weight: 100)
- **Pod Anti-Affinity**: Avoids scheduling on the same node as the Jenkins controller
- **Environment Variables**:
  - `JENKINS_URL`: `http://jenkins:8080`
  - `JENKINS_TUNNEL`: `jenkins:50000`

The agent pod template is automatically loaded by Jenkins on startup through the JCasC plugin.

## Accessing Jenkins

### Port Forward (Recommended for Initial Setup)

```bash
# Forward port 8080 to your local machine
kubectl port-forward -n jenkins svc/jenkins 8080:8080

# Open browser to http://localhost:8080
```

### Get Initial Admin Password

```bash
# Get the pod name
POD_NAME=$(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}')

# Retrieve the initial admin password
kubectl exec -n jenkins -it $POD_NAME -- cat /var/jenkins_home/secrets/initialAdminPassword
```

### VPN Access (Production)

For production environments, configure VPN access to the VPC and access Jenkins via the internal service endpoint.

## Verification

### Check Pod Status

```bash
# Get all resources in jenkins namespace
kubectl get all -n jenkins

# Check pod status
kubectl get pods -n jenkins

# Check pod logs
kubectl logs -n jenkins -l app=jenkins-controller

# Describe pod for detailed information
kubectl describe pod -n jenkins -l app=jenkins-controller
```

### Check Persistent Volume

```bash
# Check PVC status
kubectl get pvc -n jenkins

# Check PV status
kubectl get pv
```

### Check Service Account

```bash
# Check service account
kubectl get sa -n jenkins jenkins-controller -o yaml

# Verify IRSA annotation
kubectl get sa -n jenkins jenkins-controller -o jsonpath='{.metadata.annotations.eks\.amazonaws\.com/role-arn}'
```

## Troubleshooting

### Pod Not Starting

1. **Check pod status**:
   ```bash
   kubectl get pods -n jenkins
   kubectl describe pod -n jenkins -l app=jenkins-controller
   ```

2. **Check pod logs**:
   ```bash
   kubectl logs -n jenkins -l app=jenkins-controller
   ```

3. **Common issues**:
   - No controller nodes available (check node labels)
   - EFS mount failure (check EFS CSI Driver and mount targets)
   - Insufficient resources (check node capacity)

### PVC Not Binding

1. **Check PVC status**:
   ```bash
   kubectl get pvc -n jenkins
   kubectl describe pvc -n jenkins jenkins-home
   ```

2. **Check storage class**:
   ```bash
   kubectl get storageclass efs-sc
   ```

3. **Common issues**:
   - EFS CSI Driver not installed
   - Storage class not configured correctly
   - EFS file system not accessible

### IRSA Not Working

1. **Check service account annotation**:
   ```bash
   kubectl get sa -n jenkins jenkins-controller -o yaml
   ```

2. **Check pod environment variables**:
   ```bash
   kubectl exec -n jenkins -it $(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}') -- env | grep AWS
   ```

3. **Common issues**:
   - IAM role ARN not set correctly
   - OIDC provider not configured
   - Trust policy not configured correctly

### Node Selector Not Working

1. **Check node labels**:
   ```bash
   kubectl get nodes --show-labels | grep workload-type
   ```

2. **Check if controller nodes exist**:
   ```bash
   kubectl get nodes -l workload-type=jenkins-controller
   ```

3. **If no controller nodes exist**, the pod will remain in Pending state. Create the controller node group via CDK stack.

## Uninstallation

### Quick Uninstall

```bash
# Make the uninstall script executable
chmod +x uninstall.sh

# Run the uninstall script
./uninstall.sh
```

The uninstall script will:
1. Confirm deletion
2. Delete all Jenkins resources
3. Optionally delete the namespace

**WARNING**: This will delete all Jenkins data. The EFS volume will be retained but the PVC will be deleted.

### Manual Uninstall

```bash
# Delete resources in reverse order
kubectl delete -f statefulset.yaml
kubectl delete -f service.yaml
kubectl delete -f pvc.yaml
kubectl delete -f serviceaccount.yaml
kubectl delete -f namespace.yaml
```

## Manifest Files

- **namespace.yaml**: Creates the `jenkins` namespace
- **serviceaccount.yaml**: Creates the `jenkins-controller` service account with IRSA annotation
- **pvc.yaml**: Creates the persistent volume claim for Jenkins home directory
- **agent-pod-template-configmap.yaml**: ConfigMap with Jenkins Configuration as Code (JCasC) for agent pod template
- **statefulset.yaml**: Deploys the Jenkins controller as a StatefulSet
- **service.yaml**: Exposes the Jenkins controller via a ClusterIP service
- **kustomization.yaml**: Kustomize configuration for deploying all resources

## Requirements Mapping

This deployment satisfies the following requirements:

- **Requirement 3.1**: Jenkins controller deployed as StatefulSet with 1 replica
- **Requirement 3.2**: Persistent volume backed by EFS with ReadWriteMany access mode
- **Requirement 3.3**: Resource allocation (4GB memory, 2 CPU cores minimum)
- **Requirement 3.4**: Kubernetes Service for internal cluster communication
- **Requirement 3.6**: Automatic pod restart enabled (restartPolicy: Always)
- **Requirement 3.9**: Runs on on-demand instances (node selector and toleration)
- **Requirement 5.3**: Service account with IRSA annotation
- **Requirement 5.4**: Jenkins controller uses service account to assume IAM role
- **Requirement 3.8**: Agent pods communicate with controller via Jenkins Remoting protocol
- **Requirement 4.6**: Agent pods have node affinity to prefer spot instance nodes
- **Requirement 6.1**: Persistent volume uses EFS backend
- **Requirement 6.9**: PVC uses ReadWriteMany access mode

## Next Steps

After deploying the Jenkins controller:

1. **Access Jenkins UI** and complete the initial setup wizard
2. **Install required plugins**:
   - Kubernetes Plugin (for dynamic agent provisioning)
   - AWS Steps Plugin (for AWS API interactions)
   - Pipeline Plugin (for Jenkinsfile support)
   - S3 Plugin (for artifact storage)
3. **Configure Jenkins agents** using the Kubernetes plugin
4. **Set up Jenkins pipelines** for your CI/CD workflows
5. **Configure backup and monitoring** for production use

## Support

For issues or questions:
- Check the troubleshooting section above
- Review pod logs: `kubectl logs -n jenkins -l app=jenkins-controller`
- Check EKS cluster events: `kubectl get events -n jenkins`
- Review CDK stack outputs for IAM role ARN and other resources
