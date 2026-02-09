# Kubernetes Manifests for Jenkins EKS Cluster

This directory contains Kubernetes manifest files for deploying components on the Jenkins EKS cluster.

## Directory Structure

```
k8s/
├── efs-csi-driver/          # EFS CSI Driver for persistent storage
│   ├── README.md            # Detailed deployment instructions
│   ├── deploy.sh            # Automated deployment script
│   ├── uninstall.sh         # Uninstall script
│   ├── kustomization.yaml   # Kustomize configuration
│   ├── namespace.yaml       # Namespace definition
│   ├── serviceaccount.yaml  # Service accounts with IRSA
│   ├── rbac.yaml            # RBAC resources
│   ├── csi-driver.yaml      # CSI driver definition
│   ├── controller-deployment.yaml  # Controller deployment
│   └── node-daemonset.yaml  # Node plugin DaemonSet
└── README.md                # This file
```

## Components

### 1. EFS CSI Driver (Task 8.1)

The EFS CSI Driver enables Kubernetes to dynamically provision and mount Amazon EFS file systems as persistent volumes. This is required for the Jenkins controller to store its home directory data.

**Status:** ✅ Completed

**Requirements:** 6.8 - EKS cluster has EFS CSI Driver installed for dynamic volume provisioning

**Deployment:**
```bash
cd k8s/efs-csi-driver
./deploy.sh
```

See [efs-csi-driver/README.md](efs-csi-driver/README.md) for detailed instructions.

## Prerequisites

Before deploying any Kubernetes components, ensure:

1. **EKS Cluster is created and accessible**
   ```bash
   aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2
   kubectl get nodes
   ```

2. **CDK Stack is deployed**
   - VPC and networking infrastructure
   - EKS cluster
   - EFS file system
   - IAM roles with IRSA
   - S3 bucket for artifacts

3. **kubectl is configured**
   ```bash
   kubectl version
   kubectl cluster-info
   ```

## Deployment Order

The components should be deployed in the following order:

1. **EFS CSI Driver** (Task 8.1) - Required for persistent storage
2. **EFS StorageClass** (Task 8.2) - Defines how to provision EFS volumes
3. **Jenkins Controller** (Task 9) - Main Jenkins server
4. **Jenkins Agent Pod Template** (Task 10) - Configuration for dynamic agents
5. **Cluster Autoscaler** (Task 11) - Auto-scaling for spot instances
6. **AWS Node Termination Handler** (Task 12) - Graceful spot interruption handling
7. **CloudWatch Container Insights** (Task 14) - Monitoring and logging

## Common Operations

### View all resources in kube-system namespace
```bash
kubectl get all -n kube-system
```

### View all resources in jenkins namespace
```bash
kubectl get all -n jenkins
```

### View logs for a pod
```bash
kubectl logs -n <namespace> <pod-name>
```

### Describe a resource
```bash
kubectl describe <resource-type> <resource-name> -n <namespace>
```

### Port-forward to Jenkins controller
```bash
kubectl port-forward -n jenkins svc/jenkins 8080:8080
```

### Execute command in a pod
```bash
kubectl exec -it -n <namespace> <pod-name> -- /bin/bash
```

## Troubleshooting

### Check cluster status
```bash
kubectl get nodes
kubectl get pods --all-namespaces
```

### Check events
```bash
kubectl get events --all-namespaces --sort-by='.lastTimestamp'
```

### Check resource usage
```bash
kubectl top nodes
kubectl top pods --all-namespaces
```

### Check IRSA configuration
```bash
kubectl describe serviceaccount <sa-name> -n <namespace>
```

### Check persistent volumes
```bash
kubectl get pv
kubectl get pvc --all-namespaces
```

## Security Considerations

1. **IRSA (IAM Roles for Service Accounts)**
   - All service accounts use IRSA for AWS permissions
   - No AWS credentials are stored in the cluster
   - IAM roles follow the principle of least privilege

2. **Network Security**
   - EKS cluster uses private endpoint access only
   - Security groups restrict traffic between components
   - VPC endpoints provide private connectivity to AWS services

3. **Encryption**
   - EFS file system is encrypted at rest
   - S3 bucket uses SSE-S3 encryption
   - Kubernetes secrets are encrypted at rest (if enabled)

## References

- [EKS User Guide](https://docs.aws.amazon.com/eks/latest/userguide/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [AWS EFS CSI Driver](https://github.com/kubernetes-sigs/aws-efs-csi-driver)
- [Jenkins on Kubernetes](https://www.jenkins.io/doc/book/installing/kubernetes/)
- [IAM Roles for Service Accounts](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
