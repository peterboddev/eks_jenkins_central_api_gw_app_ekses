# Jenkins EKS Cluster - Deployment Procedures

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Initial Deployment](#initial-deployment)
3. [Post-Deployment Verification](#post-deployment-verification)
4. [Configuration](#configuration)
5. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools
- **AWS CLI** v2.x or later
  ```powershell
  aws --version
  ```
- **kubectl** v1.28 or later
  ```powershell
  kubectl version --client
  ```
- **AWS CDK** v2.x or later
  ```powershell
  cdk --version
  ```
- **Node.js** v18.x or later
  ```powershell
  node --version
  ```

### AWS Account Requirements
- AWS Account with appropriate permissions
- IAM user or role with permissions for:
  - EKS cluster management
  - VPC and networking
  - IAM role creation
  - EFS and S3 operations
  - CloudFormation stack management

### AWS Configuration
```powershell
# Configure AWS credentials
aws configure

# Verify credentials
aws sts get-caller-identity

# Set default region
$env:AWS_DEFAULT_REGION = "us-west-2"
```

## Initial Deployment

### Step 1: Clone and Setup Project
```powershell
# Navigate to project directory
cd eks_jenkins

# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap aws://ACCOUNT-ID/us-west-2
```

### Step 2: Review Configuration
Edit `cdk.json` to customize:
- Region (default: us-west-2)
- VPC CIDR blocks
- Node group instance types
- Scaling parameters

### Step 3: Synthesize CloudFormation Template
```powershell
# Generate CloudFormation template
cdk synth

# Review the generated template
cat cdk.out/JenkinsEksStack.template.json
```

### Step 4: Deploy Infrastructure
```powershell
# Deploy the stack
cdk deploy

# Or deploy without approval prompts
cdk deploy --require-approval never
```

**Deployment Time**: Approximately 20-30 minutes

### Step 5: Configure kubectl
```powershell
# Update kubeconfig
aws eks update-kubeconfig `
    --name jenkins-eks-cluster `
    --region us-west-2

# Verify cluster access
kubectl get nodes
```

### Step 6: Deploy Kubernetes Components

#### EFS CSI Driver
```powershell
cd k8s/efs-csi-driver
.\deploy.sh
```

#### Cluster Autoscaler
```powershell
cd k8s/cluster-autoscaler
.\deploy.sh
```

#### Node Termination Handler
```powershell
cd k8s/node-termination-handler
.\deploy.sh
```

#### Jenkins Controller
```powershell
cd k8s/jenkins
.\deploy.sh
```

#### Monitoring (Optional)
```powershell
cd k8s/monitoring
.\deploy.sh
```

## Post-Deployment Verification

### 1. Verify Infrastructure
```powershell
# Check CloudFormation stack status
aws cloudformation describe-stacks `
    --stack-name JenkinsEksStack `
    --region us-west-2 `
    --query 'Stacks[0].StackStatus'

# Check EKS cluster status
aws eks describe-cluster `
    --name jenkins-eks-cluster `
    --region us-west-2 `
    --query 'cluster.status'
```

### 2. Verify Kubernetes Resources
```powershell
# Check all nodes
kubectl get nodes

# Check all pods
kubectl get pods --all-namespaces

# Check Jenkins controller
kubectl get pods -n jenkins
kubectl logs -n jenkins jenkins-controller-0 --tail=50

# Check EFS CSI Driver
kubectl get pods -n kube-system -l app=efs-csi-controller
kubectl get pods -n kube-system -l app=efs-csi-node

# Check Cluster Autoscaler
kubectl get pods -n kube-system -l app=cluster-autoscaler
kubectl logs -n kube-system -l app=cluster-autoscaler --tail=50
```

### 3. Verify Storage
```powershell
# Check EFS file system
aws efs describe-file-systems `
    --region us-west-2 `
    --query 'FileSystems[?Name==`jenkins-eks-efs`]'

# Check S3 bucket
aws s3 ls | Select-String "jenkins-.*-artifacts"

# Check PVC
kubectl get pvc -n jenkins
```

### 4. Access Jenkins
```powershell
# Port forward to Jenkins
kubectl port-forward -n jenkins svc/jenkins 8080:8080

# Get initial admin password
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/secrets/initialAdminPassword
```

Open browser to: http://localhost:8080

### 5. Verify Autoscaling
```powershell
# Check node group configuration
aws eks describe-nodegroup `
    --cluster-name jenkins-eks-cluster `
    --nodegroup-name jenkins-agent-nodegroup `
    --region us-west-2 `
    --query 'nodegroup.scalingConfig'

# Watch autoscaler logs
kubectl logs -n kube-system -l app=cluster-autoscaler -f
```

## Configuration

### Scaling Configuration
To modify agent node group scaling:
```powershell
# Update node group
aws eks update-nodegroup-config `
    --cluster-name jenkins-eks-cluster `
    --nodegroup-name jenkins-agent-nodegroup `
    --scaling-config minSize=0,maxSize=10,desiredSize=0 `
    --region us-west-2
```

### Jenkins Configuration
Jenkins is configured via Jenkins Configuration as Code (JCasC):
- Configuration file: `k8s/jenkins/agent-pod-template-configmap.yaml`
- Modify and reapply:
  ```powershell
  kubectl apply -f k8s/jenkins/agent-pod-template-configmap.yaml
  kubectl rollout restart statefulset/jenkins-controller -n jenkins
  ```

### Monitoring Configuration
CloudWatch dashboards and alarms are automatically created during deployment.

View dashboards:
```powershell
# List dashboards
aws cloudwatch list-dashboards --region us-west-2

# View specific dashboard
# Open: https://console.aws.amazon.com/cloudwatch/home?region=us-west-2#dashboards:
```

## Troubleshooting

### Jenkins Pod Not Starting
```powershell
# Check pod status
kubectl describe pod jenkins-controller-0 -n jenkins

# Check events
kubectl get events -n jenkins --sort-by='.lastTimestamp'

# Check logs
kubectl logs jenkins-controller-0 -n jenkins
```

**Common Issues:**
- Insufficient CPU/memory on controller node
- EFS mount issues
- PVC not bound

### EFS Mount Issues
```powershell
# Check EFS CSI Driver pods
kubectl get pods -n kube-system -l app=efs-csi-node

# Check EFS security group
aws ec2 describe-security-groups `
    --filters "Name=tag:Name,Values=*efs*" `
    --region us-west-2

# Verify NFS port 2049 is open from cluster security group
```

### Autoscaler Not Scaling
```powershell
# Check autoscaler logs
kubectl logs -n kube-system -l app=cluster-autoscaler --tail=100

# Check node group tags
aws eks describe-nodegroup `
    --cluster-name jenkins-eks-cluster `
    --nodegroup-name jenkins-agent-nodegroup `
    --region us-west-2 `
    --query 'nodegroup.tags'
```

**Required Tags:**
- `k8s.io/cluster-autoscaler/enabled: true`
- `k8s.io/cluster-autoscaler/jenkins-eks-cluster: owned`

### Spot Instance Interruptions
```powershell
# Check node termination handler logs
kubectl logs -n kube-system -l app=aws-node-termination-handler

# Check CloudWatch for interruption events
aws cloudwatch get-metric-statistics `
    --namespace AWS/EC2Spot `
    --metric-name InterruptionRate `
    --start-time (Get-Date).AddHours(-24) `
    --end-time (Get-Date) `
    --period 3600 `
    --statistics Average `
    --region us-west-2
```

### Network Connectivity Issues
```powershell
# Check VPC endpoints
aws ec2 describe-vpc-endpoints `
    --filters "Name=vpc-id,Values=VPC-ID" `
    --region us-west-2

# Check NAT Gateway status
aws ec2 describe-nat-gateways `
    --filter "Name=state,Values=available" `
    --region us-west-2

# Test connectivity from pod
kubectl run test-pod --image=busybox --rm -it -- /bin/sh
# Inside pod: wget -O- https://www.google.com
```

### Cleanup Failed Deployment
```powershell
# Delete Kubernetes resources first
kubectl delete namespace jenkins
kubectl delete -f k8s/cluster-autoscaler/
kubectl delete -f k8s/efs-csi-driver/
kubectl delete -f k8s/node-termination-handler/

# Delete CDK stack
cdk destroy

# Manual cleanup if needed
aws eks delete-nodegroup --cluster-name jenkins-eks-cluster --nodegroup-name jenkins-agent-nodegroup --region us-west-2
aws eks delete-nodegroup --cluster-name jenkins-eks-cluster --nodegroup-name jenkins-controller-nodegroup --region us-west-2
aws eks delete-cluster --name jenkins-eks-cluster --region us-west-2
```

## Next Steps
- Review [RECOVERY_PROCEDURES.md](RECOVERY_PROCEDURES.md) for disaster recovery
- Configure Jenkins jobs and pipelines
- Set up backup schedules
- Configure monitoring alerts
