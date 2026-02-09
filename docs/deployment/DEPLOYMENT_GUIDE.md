# Jenkins EKS Cluster - Complete Deployment Guide

## Overview

This guide provides step-by-step instructions to deploy the complete Jenkins CI/CD platform on Amazon EKS with cost-optimized spot instances.

## Architecture Summary

- **EKS Cluster**: Kubernetes 1.28 in us-west-2 region
- **Jenkins Controller**: Runs on on-demand instances for high availability
- **Jenkins Agents**: Run on spot instances for cost optimization
- **Storage**: EFS for Jenkins home directory, S3 for artifacts
- **Networking**: Private VPC with NAT Gateways and VPC endpoints
- **Security**: IRSA for AWS permissions, encryption at rest and in transit

## Prerequisites

### Required Tools

1. **AWS CLI** (v2.x or later)
   ```bash
   aws --version
   ```

2. **kubectl** (v1.28 or later)
   ```bash
   kubectl version --client
   ```

3. **Node.js** (v18.x or later)
   ```bash
   node --version
   ```

4. **AWS CDK** (v2.x)
   ```bash
   npm install -g aws-cdk
   cdk --version
   ```

5. **TypeScript**
   ```bash
   npm install -g typescript
   ```

### AWS Account Setup

1. **AWS Account** with appropriate permissions
2. **AWS CLI configured** with credentials
   ```bash
   aws configure
   ```

3. **AWS Region**: us-west-2 (configured in CDK)

## Deployment Steps

### Phase 1: Deploy CDK Infrastructure (30-45 minutes)

#### Step 1.1: Install Dependencies

```bash
cd eks_jenkins
npm install
```

#### Step 1.2: Build the CDK Project

```bash
npm run build
```

#### Step 1.3: Bootstrap CDK (First Time Only)

```bash
# Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Bootstrap CDK
cdk bootstrap aws://${AWS_ACCOUNT_ID}/us-west-2
```

#### Step 1.4: Review the CloudFormation Template

```bash
# Synthesize the CloudFormation template
cdk synth

# Review the generated template
cdk synth > template.yaml
```

#### Step 1.5: Deploy the CDK Stack

```bash
# Deploy the infrastructure
cdk deploy

# Confirm the deployment when prompted
# This will create:
# - VPC with private subnets, NAT Gateways, VPC endpoints
# - EKS cluster with Kubernetes 1.28
# - EFS file system with mount targets and backup
# - S3 bucket for artifacts
# - IAM roles for IRSA
# - Node groups (controller on-demand, agent spot)
```

**Expected Duration**: 30-45 minutes

**What Gets Created**:
- VPC (10.0.0.0/16) with 2 private subnets, 2 public subnets
- 2 NAT Gateways (one per AZ)
- 6 VPC endpoints (S3, ECR API, ECR Docker, EC2, STS, CloudWatch Logs)
- EKS cluster with private endpoint access
- EFS file system with encryption and lifecycle management
- S3 bucket with versioning and lifecycle policy
- 4 IAM roles (EKS cluster, Jenkins controller, Cluster Autoscaler, EFS CSI Driver)
- OIDC provider for IRSA
- 2 node groups (controller: 1-2 on-demand, agent: 2-10 spot)

#### Step 1.6: Configure kubectl

```bash
# Update kubeconfig to access the EKS cluster
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2

# Verify cluster access
kubectl get nodes

# Expected output: 3 nodes (1 controller, 2 agent)
```

### Phase 2: Deploy EFS CSI Driver (5-10 minutes)

#### Step 2.1: Navigate to EFS CSI Driver Directory

```bash
cd k8s/efs-csi-driver
```

#### Step 2.2: Deploy EFS CSI Driver

```bash
# Make the script executable
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

**What the Script Does**:
1. Checks prerequisites (kubectl, AWS CLI)
2. Retrieves EFS CSI Driver IAM role ARN from CloudFormation
3. Updates service account with IRSA annotation
4. Deploys EFS CSI Driver components
5. Waits for components to be ready
6. Verifies deployment

#### Step 2.3: Verify EFS CSI Driver

```bash
# Check controller deployment
kubectl get deployment efs-csi-controller -n kube-system

# Check node DaemonSet
kubectl get daemonset efs-csi-node -n kube-system

# Check storage class
kubectl get storageclass efs-sc

# All should show as ready/available
```

### Phase 3: Deploy Jenkins Controller (10-15 minutes)

#### Step 3.1: Navigate to Jenkins Directory

```bash
cd ../jenkins
```

#### Step 3.2: Deploy Jenkins Controller

```bash
# Make the script executable
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

**What the Script Does**:
1. Checks prerequisites
2. Retrieves Jenkins controller IAM role ARN from CloudFormation
3. Updates service account with IRSA annotation
4. Verifies EFS CSI Driver storage class exists
5. Checks for controller nodes
6. Deploys Jenkins controller manifests
7. Waits for Jenkins pod to be ready
8. Displays access instructions

#### Step 3.3: Verify Jenkins Deployment

```bash
# Check all resources in jenkins namespace
kubectl get all -n jenkins

# Expected output:
# - StatefulSet: jenkins-controller (1/1 ready)
# - Pod: jenkins-controller-0 (Running)
# - Service: jenkins (ClusterIP)
# - PVC: jenkins-home (Bound)

# Check pod logs
kubectl logs -n jenkins -l app=jenkins-controller
```

### Phase 4: Access Jenkins (5 minutes)

#### Step 4.1: Port Forward to Jenkins

```bash
# Forward port 8080 to your local machine
kubectl port-forward -n jenkins svc/jenkins 8080:8080
```

#### Step 4.2: Get Initial Admin Password

```bash
# Get the initial admin password
kubectl exec -n jenkins -it $(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}') -- cat /var/jenkins_home/secrets/initialAdminPassword
```

#### Step 4.3: Access Jenkins UI

1. Open browser to: http://localhost:8080
2. Enter the initial admin password
3. Install suggested plugins
4. Create admin user
5. Configure Jenkins URL

### Phase 5: Configure Jenkins (15-20 minutes)

#### Step 5.1: Install Required Plugins

Navigate to **Manage Jenkins** > **Manage Plugins** > **Available** and install:

1. **Kubernetes Plugin** - For dynamic agent provisioning
2. **AWS Steps Plugin** - For AWS API interactions
3. **Pipeline Plugin** - For Jenkinsfile support (usually pre-installed)
4. **S3 Plugin** - For artifact storage
5. **Git Plugin** - For Git repository integration (usually pre-installed)

#### Step 5.2: Configure Kubernetes Cloud

1. Navigate to **Manage Jenkins** > **Manage Nodes and Clouds** > **Configure Clouds**
2. Click **Add a new cloud** > **Kubernetes**
3. Configure:
   - **Name**: kubernetes
   - **Kubernetes URL**: https://kubernetes.default
   - **Kubernetes Namespace**: jenkins
   - **Jenkins URL**: http://jenkins.jenkins.svc.cluster.local:8080
   - **Jenkins tunnel**: jenkins.jenkins.svc.cluster.local:50000
4. Click **Test Connection** to verify
5. Save configuration

#### Step 5.3: Configure Pod Template

1. In the Kubernetes cloud configuration, click **Pod Templates** > **Add Pod Template**
2. Configure:
   - **Name**: jenkins-agent
   - **Namespace**: jenkins
   - **Labels**: jenkins-agent
   - **Node Selector**: node-lifecycle=spot
   - **Service Account**: default
3. Add Container:
   - **Name**: jnlp
   - **Docker Image**: jenkins/inbound-agent:latest
   - **Working Directory**: /home/jenkins/agent
   - **Command to run**: (leave empty)
   - **Arguments to pass**: (leave empty)
4. Add Resource Requests:
   - **CPU Request**: 1
   - **Memory Request**: 2Gi
   - **CPU Limit**: 2
   - **Memory Limit**: 4Gi
5. Save configuration

## Verification Checklist

### Infrastructure Verification

- [ ] VPC created with correct CIDR (10.0.0.0/16)
- [ ] 2 private subnets in different AZs
- [ ] 2 NAT Gateways (one per AZ)
- [ ] 6 VPC endpoints created
- [ ] EKS cluster running with Kubernetes 1.28+
- [ ] EFS file system created and accessible
- [ ] S3 bucket created with versioning enabled
- [ ] 4 IAM roles created with correct permissions
- [ ] OIDC provider configured
- [ ] Controller node group: 1 on-demand instance
- [ ] Agent node group: 2 spot instances

### Kubernetes Verification

- [ ] kubectl can access the cluster
- [ ] All nodes are in Ready state
- [ ] EFS CSI Driver controller deployment: 2/2 ready
- [ ] EFS CSI Driver node DaemonSet: pods on all nodes
- [ ] Storage class 'efs-sc' exists
- [ ] Jenkins namespace created
- [ ] Jenkins service account has IRSA annotation
- [ ] Jenkins PVC is Bound
- [ ] Jenkins pod is Running
- [ ] Jenkins service is accessible

### Jenkins Verification

- [ ] Jenkins UI accessible via port-forward
- [ ] Initial admin password retrieved
- [ ] Admin user created
- [ ] Required plugins installed
- [ ] Kubernetes cloud configured
- [ ] Pod template configured
- [ ] Test pipeline runs successfully

## Test Pipeline

Create a test pipeline to verify the setup:

```groovy
pipeline {
    agent {
        kubernetes {
            label 'jenkins-agent'
            defaultContainer 'jnlp'
        }
    }
    stages {
        stage('Test') {
            steps {
                sh 'echo "Hello from Jenkins on EKS!"'
                sh 'kubectl version --client'
                sh 'aws --version'
            }
        }
    }
}
```

## Troubleshooting

### CDK Deployment Issues

**Issue**: CDK deploy fails with "Resource limit exceeded"

**Solution**: Request limit increase for:
- VPCs
- Elastic IPs
- NAT Gateways

**Issue**: EKS cluster creation fails

**Solution**: 
- Verify IAM permissions
- Check service quotas for EKS
- Ensure region supports EKS 1.28

### EFS CSI Driver Issues

**Issue**: EFS CSI Driver pods not starting

**Solution**:
```bash
# Check IAM role annotation
kubectl describe sa efs-csi-controller-sa -n kube-system

# Check pod logs
kubectl logs -n kube-system deployment/efs-csi-controller -c efs-plugin

# Verify EFS mount targets
aws efs describe-mount-targets --file-system-id <fs-id>
```

### Jenkins Deployment Issues

**Issue**: Jenkins pod stuck in Pending

**Solution**:
```bash
# Check if controller nodes exist
kubectl get nodes -l workload-type=jenkins-controller

# Check pod events
kubectl describe pod -n jenkins -l app=jenkins-controller

# If no controller nodes, wait for node group to be created
```

**Issue**: PVC not binding

**Solution**:
```bash
# Check storage class
kubectl get storageclass efs-sc

# Check PVC events
kubectl describe pvc -n jenkins jenkins-home

# Verify EFS CSI Driver is running
kubectl get pods -n kube-system -l app=efs-csi-controller
```

**Issue**: Jenkins pod CrashLoopBackOff

**Solution**:
```bash
# Check pod logs
kubectl logs -n jenkins -l app=jenkins-controller

# Check EFS mount
kubectl exec -n jenkins -it $(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}') -- df -h

# Verify EFS file system is accessible
```

## Cost Optimization

### Estimated Monthly Costs (us-west-2)

- **EKS Cluster**: ~$73/month (control plane)
- **EC2 Instances**:
  - Controller (t3.large on-demand): ~$60/month
  - Agents (2x m5.large spot): ~$30/month (70% savings)
- **EFS**: ~$10/month (100GB, with IA)
- **S3**: ~$2/month (100GB)
- **NAT Gateways**: ~$65/month (2 gateways)
- **VPC Endpoints**: ~$15/month (5 interface endpoints)
- **Data Transfer**: Variable

**Total**: ~$255/month (baseline)

### Cost Reduction Tips

1. **Use Spot Instances**: Already configured for agents (70% savings)
2. **EFS Lifecycle Management**: Already configured (transition to IA after 30 days)
3. **S3 Lifecycle Policy**: Already configured (Intelligent-Tiering after 30 days)
4. **Scale Down**: Reduce agent node group min size to 0 when not in use
5. **VPC Endpoints**: Remove unused endpoints if not needed
6. **NAT Gateways**: Consider using a single NAT Gateway for non-production

## Maintenance

### Regular Tasks

**Daily**:
- Monitor Jenkins job queue
- Check spot instance interruptions
- Review CloudWatch logs

**Weekly**:
- Review EFS storage usage
- Check S3 bucket size
- Update Jenkins plugins

**Monthly**:
- Review AWS costs
- Update Jenkins version
- Review and rotate credentials
- Check for Kubernetes updates

### Backup and Recovery

**Jenkins Configuration Backup**:
- Stored on EFS with 30-day retention
- AWS Backup runs daily

**Disaster Recovery**:
1. EFS snapshots available via AWS Backup
2. S3 artifacts versioned and retained for 90 days
3. Infrastructure as Code (CDK) in Git

**Recovery Procedure**:
1. Deploy CDK stack to new region/account
2. Restore EFS from backup
3. Deploy Kubernetes manifests
4. Verify Jenkins configuration

## Security Best Practices

1. **Network Security**:
   - ✅ Private EKS endpoint only
   - ✅ Private subnets for workloads
   - ✅ VPC endpoints for AWS services
   - ✅ Security groups restrict traffic

2. **IAM Security**:
   - ✅ IRSA for pod-level permissions
   - ✅ Least privilege IAM policies
   - ✅ No long-lived credentials

3. **Data Security**:
   - ✅ EFS encryption at rest
   - ✅ S3 encryption (SSE-S3)
   - ✅ TLS for data in transit

4. **Access Control**:
   - ✅ Kubernetes RBAC
   - ✅ Jenkins authentication
   - ✅ VPN for production access

### Phase 6: Deploy Cluster Autoscaler (5-10 minutes)

#### Step 6.1: Navigate to Cluster Autoscaler Directory

```bash
cd ../cluster-autoscaler
```

#### Step 6.2: Deploy Cluster Autoscaler

```bash
# Make the script executable
chmod +x deploy.sh

# Get required environment variables
export CLUSTER_NAME=jenkins-eks-cluster
export CLUSTER_AUTOSCALER_ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ClusterAutoscalerRoleArn`].OutputValue' \
  --output text)

# Run the deployment script
CLUSTER_NAME=$CLUSTER_NAME CLUSTER_AUTOSCALER_ROLE_ARN=$CLUSTER_AUTOSCALER_ROLE_ARN ./deploy.sh
```

#### Step 6.3: Verify Cluster Autoscaler

```bash
# Check deployment
kubectl get deployment cluster-autoscaler -n kube-system

# Check logs
kubectl logs -n kube-system -l app=cluster-autoscaler --tail=50
```

### Phase 7: Deploy Node Termination Handler (5 minutes)

#### Step 7.1: Navigate to Node Termination Handler Directory

```bash
cd ../node-termination-handler
```

#### Step 7.2: Deploy Node Termination Handler

```bash
# Make the script executable
chmod +x deploy.sh

# Run the deployment script
./deploy.sh
```

#### Step 7.3: Verify Node Termination Handler

```bash
# Check DaemonSet
kubectl get daemonset aws-node-termination-handler -n kube-system

# Check logs
kubectl logs -n kube-system -l app=aws-node-termination-handler --tail=50
```

### Phase 8: Deploy CloudWatch Container Insights (5-10 minutes)

#### Step 8.1: Navigate to Monitoring Directory

```bash
cd ../monitoring
```

#### Step 8.2: Deploy CloudWatch Container Insights

```bash
# Make the script executable
chmod +x deploy.sh

# Set environment variables
export CLUSTER_NAME=jenkins-eks-cluster
export AWS_REGION=us-west-2

# Run the deployment script
CLUSTER_NAME=$CLUSTER_NAME AWS_REGION=$AWS_REGION ./deploy.sh
```

#### Step 8.3: Verify CloudWatch Container Insights

```bash
# Check DaemonSets
kubectl get daemonset -n amazon-cloudwatch

# Check logs
kubectl logs -n amazon-cloudwatch -l name=cloudwatch-agent --tail=50
kubectl logs -n amazon-cloudwatch -l k8s-app=fluent-bit --tail=50
```

#### Step 8.4: View Metrics in CloudWatch Console

1. Open CloudWatch Console: https://console.aws.amazon.com/cloudwatch/
2. Navigate to Container Insights
3. Select your cluster: jenkins-eks-cluster
4. View performance metrics and logs

## Next Steps

1. **Configure Jenkins Pipelines**: Create CI/CD pipelines for your applications
2. **Configure Agent Pod Template**: Deploy the Jenkins agent pod template ConfigMap
3. **Configure Backups**: Verify AWS Backup is running
4. **Set Up Alerts**: Subscribe to SNS topic for CloudWatch alarms
5. **Run Property Tests**: Execute property-based tests to verify correctness
6. **Documentation**: Document your Jenkins pipelines and workflows
7. **Training**: Train team on Jenkins and Kubernetes

## Support and Resources

- **AWS EKS Documentation**: https://docs.aws.amazon.com/eks/
- **Jenkins Documentation**: https://www.jenkins.io/doc/
- **Kubernetes Documentation**: https://kubernetes.io/docs/
- **AWS CDK Documentation**: https://docs.aws.amazon.com/cdk/

## Conclusion

You now have a fully functional Jenkins CI/CD platform running on Amazon EKS with:
- High availability (on-demand controller instances)
- Cost optimization (spot instance agents)
- Persistent storage (EFS)
- Secure AWS integration (IRSA)
- Scalable infrastructure (Kubernetes)

The platform is ready for production use!
