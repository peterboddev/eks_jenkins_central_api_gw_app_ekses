# Infrastructure Deployment - Quick Start

## Prerequisites

```powershell
# Verify installations
node --version        # Should be v18+
npm --version         # Should be v9+
cdk --version         # Should be 2.1105.0
aws --version         # Should be v2

# Configure AWS credentials
aws configure
```

## CDK Version Requirements

- **aws-cdk-lib**: 2.238.0 (construct library)
- **aws-cdk CLI**: 2.1105.0 (command-line tool)

```powershell
# Install correct global CDK CLI version
npm install -g aws-cdk@2.1105.0
```

## One-Command Deployment

### Linux/Mac
```bash
# Make script executable
chmod +x scripts/deploy-infrastructure.sh

# Run automated deployment
./scripts/deploy-infrastructure.sh
```

### Windows
```powershell
# Run automated deployment
.\scripts\deploy-infrastructure.ps1
```

This script will:
1. ✓ Verify prerequisites
2. ✓ Install dependencies
3. ✓ Build TypeScript
4. ✓ Bootstrap CDK (if needed)
5. ✓ Deploy network stacks
6. ✓ Deploy Transit Gateway
7. ✓ Deploy application stacks
8. ✓ Display outputs

## Manual Deployment

### Linux/Mac
```bash
# Step 1: Setup
npm install
npm run build
cdk bootstrap

# Step 2: Deploy network infrastructure
cdk deploy JenkinsNetworkStack NginxApiNetworkStack --require-approval never

# Step 3: Deploy storage infrastructure
cdk deploy JenkinsStorageStack --require-approval never

# Step 4: Deploy Transit Gateway
cdk deploy TransitGatewayStack --require-approval never

# Step 5: Deploy Jenkins EKS Cluster (15-20 min)
cdk deploy JenkinsEksClusterStack --require-approval never

# Step 6: Deploy Jenkins EKS Node Groups (5-10 min)
cdk deploy JenkinsEksNodeGroupsStack --require-approval never

# Step 7: Deploy Jenkins Application (3-5 min)
cdk deploy JenkinsApplicationStack --require-approval never

# Step 8: Deploy Nginx API Cluster
cdk deploy NginxApiClusterStack --require-approval never
```

### Windows
```powershell
# Step 1: Setup
npm install
npm run build
cdk bootstrap

# Step 2: Deploy network infrastructure
cdk deploy JenkinsNetworkStack NginxApiNetworkStack --require-approval never

# Step 3: Deploy storage infrastructure
cdk deploy JenkinsStorageStack --require-approval never

# Step 4: Deploy Transit Gateway
cdk deploy TransitGatewayStack --require-approval never

# Step 5: Deploy Jenkins EKS Cluster (15-20 min)
cdk deploy JenkinsEksClusterStack --require-approval never

# Step 6: Deploy Jenkins EKS Node Groups (5-10 min)
cdk deploy JenkinsEksNodeGroupsStack --require-approval never

# Step 7: Deploy Jenkins Application (3-5 min)
cdk deploy JenkinsApplicationStack --require-approval never

# Step 8: Deploy Nginx API Cluster
cdk deploy NginxApiClusterStack --require-approval never
```

Both platforms use the same CDK commands.

## Iterative Development

After initial deployment, iterate quickly on specific layers:

```powershell
# Update Jenkins config (plugins, JCasC, monitoring)
npm run build
cdk deploy JenkinsApplicationStack --require-approval never  # 3-5 min only!

# Change node groups (instance types, scaling)
npm run build
cdk deploy JenkinsEksNodeGroupsStack --require-approval never  # 5-10 min

# Upgrade EKS cluster version
npm run build
cdk deploy JenkinsEksClusterStack --require-approval never  # 15-20 min
```

## Stack Architecture

```
Network Layer:
├── JenkinsNetworkStack      (VPC: 10.0.0.0/16)
├── NginxApiNetworkStack     (VPC: 10.1.0.0/16)
└── TransitGatewayStack      (Inter-VPC connectivity)

Storage Layer:
└── JenkinsStorageStack      (EFS + Automated Backups)

Jenkins EKS Layer (3-Stack Split):
├── JenkinsEksClusterStack       (Cluster only - 15-20 min - Deploy once)
├── JenkinsEksNodeGroupsStack    (Node groups - 5-10 min - Occasional changes)
└── JenkinsApplicationStack      (Jenkins app - 3-5 min - Frequent iteration)

Application Layer:
└── NginxApiClusterStack     (Nginx API on EKS)
```

**Why 3 Jenkins Stacks?**

The Jenkins infrastructure is split into 3 stacks for faster iteration:

1. **JenkinsEksClusterStack** (Foundational)
   - EKS cluster, OIDC provider, logging
   - Deploy once, rarely change
   - 15-20 minutes

2. **JenkinsEksNodeGroupsStack** (Compute)
   - Node groups, Cluster Autoscaler, security groups
   - Occasional changes for scaling
   - 5-10 minutes

3. **JenkinsApplicationStack** (Application)
   - Jenkins, ALB, S3, monitoring, K8s manifests
   - Frequent changes for config updates
   - 3-5 minutes

**Benefit**: Update Jenkins config → only redeploy ApplicationStack (3-5 min vs 20-30 min)

## Post-Deployment

```powershell
# Configure kubectl
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2
aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2

# Verify clusters
kubectl get nodes

# Deploy Kubernetes resources
kubectl apply -k k8s/jenkins/
```

## Cleanup

```powershell
# Delete all infrastructure (reverse order)
cdk destroy NginxApiClusterStack --force
cdk destroy JenkinsApplicationStack --force
cdk destroy JenkinsEksNodeGroupsStack --force
cdk destroy JenkinsEksClusterStack --force
cdk destroy TransitGatewayStack --force
cdk destroy JenkinsStorageStack --force
cdk destroy NginxApiNetworkStack JenkinsNetworkStack --force
```

## Common Issues

### VPC Limit Reached
```powershell
# List VPCs
aws ec2 describe-vpcs --output table

# Delete unused VPC
aws ec2 delete-vpc --vpc-id vpc-XXXXXXXXX
```

### CDK Version Mismatch
```powershell
# Check versions
cdk --version
npm list aws-cdk aws-cdk-lib

# Update to correct versions
npm install -g aws-cdk@2.1105.0
npm install
```

### Another CLI Process Running
```powershell
# Wait and retry
Start-Sleep -Seconds 5
cdk deploy ...
```

## Documentation

- **Detailed Guide**: [docs/deployment/NETWORK_INFRASTRUCTURE_GUIDE.md](docs/deployment/NETWORK_INFRASTRUCTURE_GUIDE.md)
- **Scripts README**: [scripts/README.md](scripts/README.md)
- **Project Docs**: [docs/README.md](docs/README.md)

## Support

For issues or questions:
1. Check the troubleshooting section in the detailed guide
2. Review CloudFormation stack events in AWS Console
3. Check CloudWatch logs for EKS clusters
