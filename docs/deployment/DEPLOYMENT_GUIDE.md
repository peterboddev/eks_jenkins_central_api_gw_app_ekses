# Jenkins EKS Cluster - Complete Deployment Guide

**Last Updated**: 2025-02-11

## Overview

This guide provides step-by-step instructions to deploy the complete Jenkins CI/CD platform on Amazon EKS with cost-optimized spot instances. All infrastructure is managed through AWS CDK following infrastructure-as-code principles.

## Architecture Summary

- **EKS Cluster**: Kubernetes 1.32 in us-west-2 region
- **Jenkins Controller**: Runs on on-demand instances for high availability
- **Jenkins Agents**: Run on spot instances for cost optimization
- **Storage**: EFS for Jenkins home directory (native NFS), S3 for artifacts
- **Networking**: Private VPC with NAT Gateways and VPC endpoints (deployed in both AZs)
- **Security**: IRSA for AWS permissions, encryption at rest and in transit, ALB with IP whitelist
- **Load Balancer**: Application Load Balancer with security group-based access control

## Prerequisites

### Required Tools

1. **AWS CLI** (v2.x or later)
   ```bash
   aws --version
   ```

2. **kubectl** (v1.32 or later)
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

6. **Helm** (v3.x) - For ALB Controller installation
   ```bash
   helm version
   ```

### AWS Account Setup

1. **AWS Account** with appropriate permissions
2. **AWS CLI configured** with credentials
   ```bash
   aws configure
   ```

3. **AWS Region**: us-west-2 (configured in CDK)

## Deployment Steps

### Phase 1: Configure IP Whitelist

Before deploying, configure the IP addresses that can access Jenkins:

#### Step 1.1: Create IP Whitelist Configuration

```bash
# Copy the sample configuration
cp security/alb-ip-whitelist.sample.json security/alb-ip-whitelist.json

# Edit the configuration with your IP addresses
# Replace with your actual home/office IP
```

**Configuration Format**:
```json
{
  "homeIp": "YOUR.HOME.IP/32",
  "additionalIps": [
    "OFFICE.IP/32",
    "VPN.IP/32"
  ]
}
```

**Note**: The `security/alb-ip-whitelist.json` file is gitignored to prevent committing sensitive IP addresses.

### Phase 2: Deploy CDK Infrastructure (30-45 minutes)

#### Step 2.1: Install Dependencies

```bash
cd eks_jenkins
npm install
```

#### Step 2.2: Build the CDK Project

```bash
npm run build
```

#### Step 2.3: Bootstrap CDK (First Time Only)

```bash
# Get your AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Bootstrap CDK
cdk bootstrap aws://${AWS_ACCOUNT_ID}/us-west-2
```

#### Step 2.4: Deploy All Stacks

```bash
# Deploy all infrastructure stacks in order
./scripts/deploy-infrastructure.sh

# Or deploy manually:
cdk deploy JenkinsNetworkStack --require-approval never
cdk deploy JenkinsStorageStack --require-approval never
cdk deploy TransitGatewayStack --require-approval never
cdk deploy JenkinsAlbStack --require-approval never
cdk deploy JenkinsEksClusterStack --require-approval never
cdk deploy JenkinsEksNodeGroupsStack --require-approval never
cdk deploy JenkinsApplicationStack --require-approval never
```

**Expected Duration**: 30-45 minutes

**What Gets Created**:

1. **JenkinsNetworkStack**:
   - VPC (10.0.0.0/16) with 2 private subnets, 2 public subnets
   - 2 NAT Gateways (one per AZ)
   - VPC endpoints in BOTH AZs (STS, EC2, ECR API, ECR DKR)

2. **JenkinsStorageStack**:
   - EFS file system with encryption and lifecycle management
   - EFS security group allowing NFS traffic from cluster
   - Mount targets in both AZs
   - AWS Backup plan with 30-day retention

3. **TransitGatewayStack**:
   - Transit Gateway for inter-VPC connectivity
   - Attachments to Jenkins and Nginx API VPCs

4. **JenkinsAlbStack**:
   - Security group for ALB with IP whitelist
   - Ingress rules for HTTP/HTTPS from configured IPs
   - AWS IP ranges for service access

5. **JenkinsEksClusterStack**:
   - EKS cluster with Kubernetes 1.32
   - OIDC provider for IRSA
   - Cluster logging enabled (all types)
   - CoreDNS addon with tolerations for tainted nodes
   - Private and public endpoint access

6. **JenkinsEksNodeGroupsStack**:
   - Controller node group: 1-2 on-demand t3.medium instances
   - Agent node group: 0-10 spot t3.large instances
   - Launch template with nfs-utils installation
   - Node taints and labels for workload separation

7. **JenkinsApplicationStack**:
   - ALB Controller service account with IRSA
   - Jenkins service account with IRSA
   - S3 artifacts bucket with versioning and lifecycle policy
   - GitHub webhook secret in Secrets Manager
   - CloudWatch alarms (5 alarms)
   - Security group rule: ALB → Cluster on port 8080
   - Static PV/StorageClass for EFS (native NFS)
   - All Jenkins Kubernetes manifests

#### Step 2.5: Configure kubectl

```bash
# Update kubeconfig to access the EKS cluster
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2

# Verify cluster access
kubectl get nodes

# Expected output: 2-3 nodes (controller and agent nodes)
```

### Phase 3: Install ALB Controller (5-10 minutes)

The ALB Controller service account is created by CDK, but the controller itself must be installed via Helm:

#### Step 3.1: Add Helm Repository

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update
```

#### Step 3.2: Install ALB Controller

```bash
# Get the cluster name and region
CLUSTER_NAME=jenkins-eks-cluster
AWS_REGION=us-west-2

# Get the VPC ID
VPC_ID=$(aws eks describe-cluster --name $CLUSTER_NAME --region $AWS_REGION --query "cluster.resourcesVpcConfig.vpcId" --output text)

# Install ALB Controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=$CLUSTER_NAME \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=$AWS_REGION \
  --set vpcId=$VPC_ID
```

#### Step 3.3: Verify ALB Controller

```bash
# Check deployment
kubectl get deployment -n kube-system aws-load-balancer-controller

# Check logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller

# Wait for ALB to be provisioned (2-5 minutes)
kubectl get ingress -n jenkins -w
```

### Phase 4: Access Jenkins (2-3 minutes)

#### Step 4.1: Get ALB URL

```bash
# Get the ALB DNS name
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Or use AWS CLI
aws elbv2 describe-load-balancers --region us-west-2 \
  --query 'LoadBalancers[?LoadBalancerName==`jenkins-alb`].DNSName' \
  --output text
```

#### Step 4.2: Get Initial Admin Password

```bash
# Get the initial admin password
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/secrets/initialAdminPassword
```

#### Step 4.3: Access Jenkins UI

1. Open browser to: http://<ALB-DNS-NAME>
2. Enter the initial admin password
3. Install suggested plugins
4. Create admin user
5. Configure Jenkins URL

**Note**: Jenkins is only accessible from IPs configured in `security/alb-ip-whitelist.json`

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
- [ ] VPC endpoints deployed in BOTH AZs
- [ ] EKS cluster running with Kubernetes 1.32
- [ ] EFS file system created and accessible
- [ ] S3 bucket created with versioning enabled
- [ ] IAM roles created with IRSA
- [ ] OIDC provider configured
- [ ] Controller node group: 1-2 on-demand instances
- [ ] Agent node group: 0-10 spot instances
- [ ] ALB security group created with IP whitelist
- [ ] ALB provisioned and healthy

### Kubernetes Verification

- [ ] kubectl can access the cluster
- [ ] All nodes are in Ready state
- [ ] CoreDNS pods running on both nodes
- [ ] Storage class 'jenkins-efs' exists
- [ ] Jenkins namespace created
- [ ] Jenkins service account has IRSA annotation
- [ ] Jenkins PVC is Bound
- [ ] Jenkins pod is Running
- [ ] Jenkins service is accessible
- [ ] ALB Controller deployment is running
- [ ] Ingress resource created
- [ ] ALB targets are healthy

### Jenkins Verification

- [ ] Jenkins UI accessible via ALB URL
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
- Ensure region supports EKS 1.32

### ALB Issues

**Issue**: ALB not provisioned after 10 minutes

**Solution**:
```bash
# Check ALB Controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller

# Check ingress events
kubectl describe ingress jenkins -n jenkins

# Verify service account has correct IAM role
kubectl describe sa aws-load-balancer-controller -n kube-system
```

**Issue**: ALB targets unhealthy

**Solution**:
```bash
# Check security group rules
aws ec2 describe-security-groups --group-ids sg-067b7f83aa98c7dd3

# Verify ALB can reach Jenkins pods on port 8080
kubectl get pods -n jenkins -o wide

# Check Jenkins pod logs
kubectl logs -n jenkins jenkins-controller-0
```

**Issue**: Cannot access Jenkins (403 Forbidden)

**Solution**:
- Verify your IP is in `security/alb-ip-whitelist.json`
- Redeploy JenkinsAlbStack: `cdk deploy JenkinsAlbStack --require-approval never`
- Check ALB security group rules in AWS Console

### Jenkins Deployment Issues

**Issue**: Jenkins pod stuck in Pending

**Solution**:
```bash
# Check if controller nodes exist
kubectl get nodes -l workload-type=jenkins-controller

# Check pod events
kubectl describe pod -n jenkins jenkins-controller-0

# If no controller nodes, wait for node group to be created
```

**Issue**: PVC not binding

**Solution**:
```bash
# Check storage class
kubectl get storageclass jenkins-efs

# Check PVC events
kubectl describe pvc -n jenkins jenkins-home

# Verify EFS mount targets
aws efs describe-mount-targets --file-system-id fs-095eed9d5c8fcb1b9
```

**Issue**: Jenkins pod CrashLoopBackOff

**Solution**:
```bash
# Check pod logs
kubectl logs -n jenkins jenkins-controller-0

# Check EFS mount
kubectl exec -n jenkins jenkins-controller-0 -- df -h

# Verify EFS file system is accessible
aws efs describe-file-systems --file-system-id fs-095eed9d5c8fcb1b9
```

**Issue**: CoreDNS pods not scheduling

**Solution**:
- CoreDNS addon is configured with tolerations in CDK
- Verify addon configuration: `aws eks describe-addon --cluster-name jenkins-eks-cluster --addon-name coredns`
- If needed, update addon: `cdk deploy JenkinsEksClusterStack --require-approval never`

## Cost Optimization

### Estimated Monthly Costs (us-west-2)

- **EKS Cluster**: ~$73/month (control plane)
- **EC2 Instances**:
  - Controller (t3.medium on-demand): ~$30/month
  - Agents (2x t3.large spot): ~$25/month (70% savings)
- **EFS**: ~$10/month (100GB, with IA)
- **S3**: ~$2/month (100GB)
- **NAT Gateways**: ~$65/month (2 gateways)
- **VPC Endpoints**: ~$15/month (4 interface endpoints)
- **ALB**: ~$20/month
- **Data Transfer**: Variable

**Total**: ~$240/month (baseline)

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

### Updating IP Whitelist

To add or remove IP addresses:

1. Edit `security/alb-ip-whitelist.json`
2. Rebuild and deploy:
   ```bash
   npm run build
   cdk deploy JenkinsAlbStack --require-approval never
   ```
3. Security group updates automatically (no need to redeploy ApplicationStack)

### Backup and Recovery

**Jenkins Configuration Backup**:
- Stored on EFS with 30-day retention
- AWS Backup runs daily

**Disaster Recovery**:
1. EFS snapshots available via AWS Backup
2. S3 artifacts versioned and retained for 90 days
3. Infrastructure as Code (CDK) in Git

**Recovery Procedure**:
1. Deploy CDK stacks to new region/account
2. Restore EFS from backup
3. Install ALB Controller via Helm
4. Verify Jenkins configuration

## Security Best Practices

1. **Network Security**:
   - ✅ Private EKS endpoint access
   - ✅ Private subnets for workloads
   - ✅ VPC endpoints for AWS services (in both AZs)
   - ✅ Security groups restrict traffic
   - ✅ ALB with IP whitelist

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
   - ✅ IP-based access control via ALB

## CDK Deployment Philosophy

This project follows strict infrastructure-as-code principles:

- ✅ Everything managed through CDK code
- ✅ No manual kubectl commands required
- ✅ No placeholder replacements needed
- ✅ All security group rules in CDK
- ✅ Service accounts created programmatically with IRSA
- ✅ IP whitelist managed via configuration file
- ✅ VPC endpoints deployed in both AZs
- ✅ CoreDNS addon managed by CDK

**Key Principle**: Write CDK code, run `cdk deploy`, everything works.

## Quick Reference Commands

```bash
# Update kubeconfig
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2

# Check Jenkins pod
kubectl get pods -n jenkins

# Check ALB ingress
kubectl get ingress -n jenkins

# Check nodes
kubectl get nodes

# Deploy all infrastructure
./scripts/deploy-infrastructure.sh

# Deploy only application stack (fast iteration - 3-5 min)
npm run build && cdk deploy JenkinsApplicationStack --require-approval never

# Get Jenkins URL
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Get initial admin password
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/secrets/initialAdminPassword

# Check ALB Controller
kubectl get deployment -n kube-system aws-load-balancer-controller

# Check ALB targets
aws elbv2 describe-target-health --target-group-arn <target-group-arn>
```

## Next Steps

1. **Configure Jenkins Pipelines**: Create CI/CD pipelines for your applications
2. **Set Up GitHub Webhooks**: Configure webhooks for automatic builds
3. **Configure Monitoring**: Subscribe to SNS topic for CloudWatch alarms
4. **Documentation**: Document your Jenkins pipelines and workflows
5. **Training**: Train team on Jenkins and Kubernetes

## Support and Resources

- **AWS EKS Documentation**: https://docs.aws.amazon.com/eks/
- **Jenkins Documentation**: https://www.jenkins.io/doc/
- **Kubernetes Documentation**: https://kubernetes.io/docs/
- **AWS CDK Documentation**: https://docs.aws.amazon.com/cdk/
- **AWS Load Balancer Controller**: https://kubernetes-sigs.github.io/aws-load-balancer-controller/

## Conclusion

You now have a fully functional Jenkins CI/CD platform running on Amazon EKS with:
- High availability (on-demand controller instances)
- Cost optimization (spot instance agents)
- Persistent storage (EFS with native NFS)
- Secure AWS integration (IRSA)
- Scalable infrastructure (Kubernetes)
- Secure access (ALB with IP whitelist)
- Multi-AZ deployment (VPC endpoints in both AZs)
- Fully automated deployment (CDK)

The platform is ready for production use!
