# Jenkins EKS Infrastructure - Complete Setup Guide

**Last Updated**: 2026-02-12

This guide provides step-by-step instructions for setting up the complete Jenkins EKS infrastructure from scratch.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Configuration](#configuration)
4. [Deployment](#deployment)
5. [Post-Deployment](#post-deployment)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **AWS CLI** (v2.x or later)
- **Node.js** (v18.x or later)
- **npm** (v9.x or later)
- **kubectl** (v1.32 or later)
- **Git**
- **AWS CDK** (v2.x)

### AWS Account Requirements

- AWS account with appropriate permissions
- AWS credentials configured (`aws configure`)
- Region: us-west-2 (or modify in code)

### Platform-Specific Requirements

#### Windows
- PowerShell 5.1 or later
- Windows 10/11 or Windows Server 2019+

#### Linux/Mac
- Bash shell
- curl or wget

---

## Initial Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git
cd eks_jenkins_central_api_gw_app_ekses
```

### Step 2: Run Bootstrap Script

The bootstrap script will install all required tools and dependencies.

#### Windows (PowerShell)

```powershell
.\scripts\bootstrap-windows.ps1
```

#### Linux/Mac (Bash)

```bash
chmod +x scripts/bootstrap-linux.sh
./scripts/bootstrap-linux.sh
```

The bootstrap script will:
- Check for required tools
- Install missing dependencies
- Configure AWS CLI
- Install Node.js dependencies
- Bootstrap AWS CDK
- Prepare kubectl layer

### Step 3: Verify Installation

```bash
# Check AWS CLI
aws --version

# Check Node.js
node --version

# Check npm
npm --version

# Check kubectl
kubectl version --client

# Check CDK
cdk --version
```

---

## Configuration

### Step 1: Configure AWS Credentials

```bash
aws configure
```

Provide:
- AWS Access Key ID
- AWS Secret Access Key
- Default region: `us-west-2`
- Default output format: `json`

### Step 2: Configure ALB IP Whitelist

Create the IP whitelist configuration file:

```bash
# Copy the sample file
cp security/alb-ip-whitelist.sample.json security/alb-ip-whitelist.json

# Edit the file with your IPs
# Windows
notepad security/alb-ip-whitelist.json

# Linux/Mac
nano security/alb-ip-whitelist.json
```

Add your IP addresses:

```json
{
  "allowedIps": [
    {
      "cidr": "YOUR_HOME_IP/32",
      "description": "Home IP"
    },
    {
      "cidr": "YOUR_OFFICE_IP/32",
      "description": "Office IP"
    }
  ]
}
```

**Important**: The file `security/alb-ip-whitelist.json` is gitignored for security.

### Step 3: Review Configuration Files

Review and customize if needed:
- `cdk.json` - CDK configuration
- `k8s/jenkins/jcasc-main-configmap.yaml` - Jenkins Configuration as Code
- `k8s/jenkins/plugins-configmap.yaml` - Jenkins plugins
- `jenkins-jobs/seed_job.groovy` - Job DSL definitions

---

## Deployment

### Option 1: Automated Deployment (Recommended)

Use the deployment script to deploy all stacks in the correct order:

#### Windows

```powershell
.\scripts\deploy-infrastructure.ps1
```

#### Linux/Mac

```bash
chmod +x scripts/deploy-infrastructure.sh
./scripts/deploy-infrastructure.sh
```

### Option 2: Manual Deployment

Deploy stacks individually in this order:

```bash
# 1. Build the project
npm run build

# 2. Deploy network stacks
cdk deploy JenkinsNetworkStack NginxApiNetworkStack --require-approval never

# 3. Deploy storage stack
cdk deploy JenkinsStorageStack --require-approval never

# 4. Deploy transit gateway
cdk deploy TransitGatewayStack --require-approval never

# 5. Deploy ALB security group
cdk deploy JenkinsAlbStack --require-approval never

# 6. Deploy EKS cluster
cdk deploy JenkinsEksClusterStack --require-approval never

# 7. Deploy node groups
cdk deploy JenkinsEksNodeGroupsStack --require-approval never

# 8. Deploy Jenkins application
cdk deploy JenkinsApplicationStack --require-approval never

# 9. Deploy Nginx API cluster
cdk deploy NginxApiClusterStack --require-approval never
```

### Deployment Time

- **Full deployment**: 30-40 minutes
- **Network stacks**: 5-10 minutes
- **EKS cluster**: 15-20 minutes
- **Node groups**: 5-10 minutes
- **Application stack**: 3-5 minutes

---

## Post-Deployment

### Step 1: Configure kubectl

```bash
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2
```

### Step 2: Install AWS Load Balancer Controller

The service account is created by CDK, but you need to install the controller via Helm:

```bash
# Add the EKS Helm repository
helm repo add eks https://aws.github.io/eks-charts
helm repo update

# Get the service account role ARN from CDK outputs
ALB_ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name JenkinsApplicationStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBControllerServiceAccountRoleArnOutput`].OutputValue' \
  --output text)

# Install the controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=jenkins-eks-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=us-west-2 \
  --set vpcId=$(aws cloudformation describe-stacks \
    --stack-name JenkinsNetworkStack \
    --query 'Stacks[0].Outputs[?OutputKey==`VpcIdOutput`].OutputValue' \
    --output text)
```

### Step 3: Create Jenkins Secrets

The Jenkins secrets need to be created manually:

```bash
# Get the GitHub webhook secret from Secrets Manager
GITHUB_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id jenkins/github-webhook-secret \
  --region us-west-2 \
  --query SecretString \
  --output text | jq -r .secret)

# Create the Jenkins secrets
kubectl create secret generic jenkins-secrets \
  -n jenkins \
  --from-literal=admin-password=admin \
  --from-literal=github-webhook-secret=$GITHUB_SECRET
```

### Step 4: Wait for Jenkins to Start

```bash
# Watch the Jenkins pod
kubectl get pods -n jenkins -w

# Wait until the pod is Running and Ready (1/1)
# This takes about 2-3 minutes
```

### Step 5: Get Jenkins URL

```bash
# Get the ALB URL
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

Access Jenkins at: `http://<ALB_URL>`

**Default credentials**: admin / admin

---

## Verification

### Step 1: Verify Infrastructure

```bash
# Check all nodes are ready
kubectl get nodes

# Check Jenkins pod is running
kubectl get pods -n jenkins

# Check ALB ingress
kubectl get ingress -n jenkins

# Check services
kubectl get svc -n jenkins
```

### Step 2: Verify Jenkins Jobs

1. Access Jenkins UI at the ALB URL
2. Login with admin / admin
3. Verify the following jobs exist:
   - `seed-job` - The seed job that creates other jobs
   - `nginx_api_build` - Build and deploy nginx-api application
   - `nginx_docker_build` - Build nginx demo Docker image

### Step 3: Verify Seed Job

```bash
# Check seed job builds
kubectl exec -n jenkins jenkins-controller-0 -- ls -la /var/jenkins_home/jobs/seed-job/builds/

# Check the latest build log
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/jobs/seed-job/builds/lastSuccessfulBuild/log
```

You should see:
```
Processing DSL script jenkins-jobs/seed_job.groovy
Added items:
    GeneratedJob{name='nginx_api_build'}
    GeneratedJob{name='nginx_docker_build'}
Finished: SUCCESS
```

### Step 4: Verify CloudWatch Alarms

```bash
# List all alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix jenkins-eks \
  --region us-west-2
```

You should see 5 alarms:
- jenkins-eks-cluster-health
- jenkins-eks-node-failure
- jenkins-eks-disk-space
- jenkins-eks-pending-pods
- jenkins-eks-spot-interruption

---

## Troubleshooting

### Jenkins Pod Not Starting

```bash
# Check pod status
kubectl describe pod jenkins-controller-0 -n jenkins

# Check pod logs
kubectl logs jenkins-controller-0 -n jenkins

# Check events
kubectl get events -n jenkins --sort-by='.lastTimestamp'
```

### ALB Not Provisioning

```bash
# Check ALB controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller

# Check ingress status
kubectl describe ingress jenkins -n jenkins
```

### Seed Job Failing

```bash
# Check seed job configuration
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/jobs/seed-job/config.xml

# Check latest build log
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/jobs/seed-job/builds/lastFailedBuild/log
```

Common issues:
- **Script not approved**: Verify `security.globalJobDslSecurityConfiguration.useScriptSecurity: false` is in JCasC
- **Invalid script name**: Ensure script filename uses underscores, not hyphens
- **Git clone fails**: Check network connectivity and repository URL

### EFS Mount Issues

```bash
# Check EFS mount targets
aws efs describe-mount-targets \
  --file-system-id $(aws cloudformation describe-stacks \
    --stack-name JenkinsStorageStack \
    --query 'Stacks[0].Outputs[?OutputKey==`EfsFileSystemIdOutput`].OutputValue' \
    --output text) \
  --region us-west-2

# Check PV and PVC
kubectl get pv,pvc -n jenkins
```

### Node Group Issues

```bash
# Check node group status
aws eks describe-nodegroup \
  --cluster-name jenkins-eks-cluster \
  --nodegroup-name jenkins-controller-nodegroup-v2 \
  --region us-west-2

# Check node labels
kubectl get nodes --show-labels | grep workload-type
```

---

## Quick Reference Commands

### Deployment

```bash
# Full deployment
./scripts/deploy-infrastructure.sh  # Linux/Mac
.\scripts\deploy-infrastructure.ps1  # Windows

# Fast iteration (application stack only)
npm run build && cdk deploy JenkinsApplicationStack --require-approval never
```

### Monitoring

```bash
# Watch Jenkins pod
kubectl get pods -n jenkins -w

# Check Jenkins logs
kubectl logs -n jenkins jenkins-controller-0 -f

# Check all resources
kubectl get all -n jenkins
```

### Cleanup

```bash
# Destroy all stacks (in reverse order)
cdk destroy NginxApiClusterStack --force
cdk destroy JenkinsApplicationStack --force
cdk destroy JenkinsEksNodeGroupsStack --force
cdk destroy JenkinsEksClusterStack --force
cdk destroy TransitGatewayStack --force
cdk destroy JenkinsAlbStack --force
cdk destroy JenkinsStorageStack --force
cdk destroy JenkinsNetworkStack --force
cdk destroy NginxApiNetworkStack --force
```

---

## Architecture Overview

### Stack Dependencies

```
JenkinsNetworkStack
    ↓
JenkinsStorageStack
    ↓
JenkinsAlbStack
    ↓
JenkinsEksClusterStack
    ↓
JenkinsEksNodeGroupsStack
    ↓
JenkinsApplicationStack

NginxApiNetworkStack
    ↓
TransitGatewayStack
    ↓
NginxApiClusterStack
```

### Key Components

- **VPC**: Custom VPC with public and private subnets across 2 AZs
- **EFS**: Persistent storage for Jenkins home directory
- **EKS**: Kubernetes cluster (v1.32) with 2 node groups
- **ALB**: Application Load Balancer with IP whitelisting
- **S3**: Artifacts bucket for job state and build artifacts
- **Secrets Manager**: GitHub webhook secret
- **CloudWatch**: 5 alarms for monitoring

---

## Additional Resources

- [Deployment Philosophy](.kiro/steering/deployment-philosophy.md)
- [Current Status](CURRENT_STATUS.md)
- [Jenkins Jobs Setup](docs/guides/JENKINS_JOBS_SETUP.md)
- [Deployment Guide](docs/deployment/DEPLOYMENT_GUIDE.md)
- [Network Architecture](docs/deployment/NETWORK_ARCHITECTURE.md)

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the logs using the commands provided
3. Check AWS CloudFormation console for stack events
4. Review CDK outputs for resource information
