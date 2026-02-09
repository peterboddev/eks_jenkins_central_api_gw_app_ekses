# Jenkins EKS Cluster - Deployment Success

## Deployment Summary

**Status**: ✅ Successfully Deployed  
**Date**: January 23, 2026  
**Region**: us-west-2  
**Account**: 450683699755  
**Deployment Time**: ~12 minutes

## Infrastructure Deployed

### VPC and Networking
- **VPC CIDR**: 10.0.0.0/16
- **Private Subnets**: 
  - us-west-2a: 10.0.1.0/24
  - us-west-2b: 10.0.2.0/24
- **Public Subnets**:
  - us-west-2a: 10.0.10.0/24
  - us-west-2b: 10.0.11.0/24
- **NAT Gateways**: 2 (one per AZ)
  - AZ-A: nat-0abbad46ff55fa20b (44.228.178.56)
  - AZ-B: nat-0f5aabdd8511cc379 (54.187.175.207)
- **VPC Endpoints**: S3 Gateway, ECR API, ECR Docker, EC2, STS, CloudWatch Logs

### EKS Cluster
- **Cluster Name**: jenkins-eks-cluster
- **Version**: 1.31
- **Status**: ACTIVE
- **Endpoint**: https://C93B2E3D983985CE9A2F6B9E6D08DBAF.gr7.us-west-2.eks.amazonaws.com
- **API Access**: Private endpoint only (no public access)
- **Logging**: All types enabled (API, audit, authenticator, controller manager, scheduler)

### Node Groups

#### Controller Node Group (On-Demand)
- **Name**: jenkins-controller-nodegroup
- **Status**: ACTIVE
- **Instance Types**: t3.large, t3.xlarge
- **Capacity Type**: ON_DEMAND
- **Scaling**: Min 1, Max 2, Desired 1
- **Labels**: workload-type=jenkins-controller
- **Taints**: workload-type=jenkins-controller:NO_SCHEDULE

#### Agent Node Group (Spot)
- **Name**: jenkins-agent-nodegroup
- **Status**: ACTIVE
- **Instance Types**: m5.large, m5.xlarge, m5a.large, m5a.xlarge, m6i.large, m6i.xlarge
- **Capacity Type**: SPOT
- **Scaling**: Min 2, Max 10, Desired 2
- **Labels**: workload-type=jenkins-agent, node-lifecycle=spot
- **Cluster Autoscaler**: Enabled (tags configured)

### Storage

#### EFS File System
- **File System ID**: fs-0351ee5e62a31c784
- **Performance Mode**: General Purpose
- **Throughput Mode**: Bursting
- **Encryption**: Enabled (AWS managed key)
- **Lifecycle Policy**: Transition to IA after 30 days
- **Mount Targets**: 2 (one per AZ)
- **Backup**: Daily backups with 30-day retention

#### S3 Bucket
- **Bucket Name**: jenkins-450683699755-us-west-2-artifacts
- **Versioning**: Enabled
- **Encryption**: SSE-S3
- **Lifecycle Rules**:
  - Transition to Intelligent-Tiering after 30 days
  - Delete objects after 90 days

### IAM Roles (IRSA Enabled)

#### Jenkins Controller Role
- **Role Name**: jenkins-eks-controller-role
- **ARN**: arn:aws:iam::450683699755:role/jenkins-eks-controller-role
- **Service Account**: jenkins:jenkins-controller
- **Permissions**: CloudFormation, S3, DynamoDB, EC2, VPC, IAM, EKS, STS

#### Cluster Autoscaler Role
- **Role Name**: jenkins-eks-cluster-autoscaler-role
- **ARN**: arn:aws:iam::450683699755:role/jenkins-eks-cluster-autoscaler-role
- **Service Account**: kube-system:cluster-autoscaler
- **Permissions**: Auto Scaling, EC2, EKS

#### EFS CSI Driver Role
- **Role Name**: jenkins-eks-efs-csi-driver-role
- **ARN**: arn:aws:iam::450683699755:role/jenkins-eks-efs-csi-driver-role
- **Service Account**: kube-system:efs-csi-controller-sa
- **Permissions**: EFS (DescribeFileSystems, CreateAccessPoint, etc.)

### Monitoring

#### CloudWatch Alarms
- **Cluster Health**: jenkins-eks-cluster-health
- **Node Failure**: jenkins-eks-node-failure
- **Disk Space**: jenkins-eks-disk-space (threshold: 80%)
- **Pending Pods**: jenkins-eks-pending-pods (threshold: 5 pods)
- **Spot Interruption**: jenkins-eks-spot-interruption

#### SNS Topic
- **Topic Name**: jenkins-eks-alarms
- **ARN**: arn:aws:sns:us-west-2:450683699755:jenkins-eks-alarms

### Security Groups
- **Jenkins Controller**: sg-044f8560da05126d4 (ports 8080, 50000)
- **Jenkins Agent**: sg-0385f7db35c52ec9c (ephemeral ports 32768-65535)
- **VPC Endpoints**: Allows HTTPS from VPC CIDR
- **EFS**: Allows NFS from VPC CIDR

## Next Steps

### 1. Install kubectl (Required)
kubectl is not currently installed on this system. To proceed with Kubernetes deployments:

**Windows Installation Options**:
```powershell
# Option 1: Using Chocolatey
choco install kubernetes-cli

# Option 2: Using Scoop
scoop install kubectl

# Option 3: Manual download
# Download from https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/
```

### 2. Verify Cluster Access
```bash
# Update kubeconfig (already done)
aws eks update-kubeconfig --region us-west-2 --name jenkins-eks-cluster

# Verify nodes
kubectl get nodes

# Verify namespaces
kubectl get namespaces
```

### 3. Deploy Kubernetes Components

The following components need to be deployed in order:

#### a. EFS CSI Driver
```bash
cd k8s/efs-csi-driver
./deploy.sh
```

#### b. Cluster Autoscaler
```bash
cd k8s/cluster-autoscaler
./deploy.sh
```

#### c. Node Termination Handler
```bash
cd k8s/node-termination-handler
./deploy.sh
```

#### d. Jenkins
```bash
cd k8s/jenkins
./deploy.sh
```

#### e. CloudWatch Container Insights (Optional)
```bash
cd k8s/monitoring
./deploy.sh
```

### 4. Access Jenkins

After Jenkins is deployed:

1. Get the Jenkins service endpoint:
```bash
kubectl get svc -n jenkins jenkins-controller
```

2. Port-forward to access Jenkins UI:
```bash
kubectl port-forward -n jenkins svc/jenkins-controller 8080:8080
```

3. Get the initial admin password:
```bash
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/secrets/initialAdminPassword
```

4. Access Jenkins at: http://localhost:8080

## Architecture Notes

### Why 2 Availability Zones?
EKS requires subnets in at least 2 different availability zones. This is a hard requirement from AWS and cannot be changed. The 2-AZ architecture provides:
- High availability for the control plane
- Redundancy for worker nodes
- Better fault tolerance

### Cost Optimization
Despite using 2 AZs, costs are optimized through:
- **Spot instances** for Jenkins agents (up to 90% savings)
- **Single NAT Gateway per AZ** (can be reduced to 1 total if needed)
- **Intelligent-Tiering** for S3 storage
- **EFS lifecycle management** (transition to IA after 30 days)
- **Cluster Autoscaler** to scale down when not in use

### Private Cluster
The EKS cluster uses private endpoint access only:
- No public endpoint exposed
- All communication stays within VPC
- Access requires VPN or bastion host for external access
- kubectl commands work from systems with AWS credentials

## Troubleshooting

### Cannot access cluster
- Ensure AWS credentials are configured: `aws sts get-caller-identity`
- Update kubeconfig: `aws eks update-kubeconfig --region us-west-2 --name jenkins-eks-cluster`
- Verify IAM permissions for EKS access

### Nodes not joining cluster
- Check node group status: `aws eks describe-nodegroup --cluster-name jenkins-eks-cluster --nodegroup-name <name> --region us-west-2`
- Verify security groups allow communication
- Check CloudWatch logs for node group issues

### EFS mount issues
- Verify EFS CSI driver is deployed
- Check EFS mount targets are in AVAILABLE state
- Verify security groups allow NFS traffic (port 2049)

## Cleanup

To delete all resources:
```bash
# Delete Kubernetes resources first
kubectl delete namespace jenkins
kubectl delete namespace kube-system --selector=app=cluster-autoscaler
kubectl delete namespace kube-system --selector=app=efs-csi-driver

# Delete CDK stack
cdk destroy
```

**Warning**: This will delete all data including Jenkins configurations and build history.

## Documentation References

- [README.md](README.md) - Project overview
- [QUICK_START.md](QUICK_START.md) - Quick start guide
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Detailed deployment instructions
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Pre-deployment checklist
- [k8s/README.md](k8s/README.md) - Kubernetes manifests overview

## Support

For issues or questions:
1. Check CloudWatch logs for error messages
2. Review CloudWatch alarms for infrastructure issues
3. Verify all prerequisites are met
4. Consult AWS EKS documentation

---

**Deployment completed successfully!** 🎉

The infrastructure is ready. Install kubectl and proceed with Kubernetes component deployments.
