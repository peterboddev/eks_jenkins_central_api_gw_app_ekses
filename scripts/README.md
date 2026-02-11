# Infrastructure Deployment Scripts

This directory contains automated deployment scripts for the entire infrastructure.

## Deployment Philosophy

**Everything is managed through CDK code and executed automatically during deployment.** 

- No manual commands needed on the EKS cluster from your local environment
- No placeholder replacements or post-deployment scripts
- All Kubernetes resources are created programmatically by CDK with correct values automatically injected
- Service accounts are created with proper IRSA annotations automatically
- After CDK deployment, everything is git-push managed

For more details, see [Deployment Philosophy](../.kiro/steering/deployment-philosophy.md).

## Bootstrap Scripts

### `deploy-infrastructure.sh` (Linux/Mac - Bash)

Automated deployment script for Linux and macOS systems.

```bash
# Make script executable
chmod +x scripts/deploy-infrastructure.sh

# Run from project root
./scripts/deploy-infrastructure.sh
```

### `deploy-infrastructure.ps1` (Windows - PowerShell)

Automated deployment script for Windows systems.

```powershell
# Run from project root
.\scripts\deploy-infrastructure.ps1
```

## What The Scripts Do

1. **Verifies Prerequisites**
   - Node.js and npm installed
   - AWS CDK installed
   - AWS CLI installed and configured
   - AWS credentials valid

2. **Installs Dependencies**
   - Runs `npm install` to install all required packages

3. **Builds TypeScript**
   - Compiles TypeScript code with `npm run build`

4. **Verifies CDK Bootstrap**
   - Checks if CDK is bootstrapped in the target account/region
   - Automatically bootstraps if needed

5. **Deploys Storage Infrastructure**
   - Deploys `JenkinsStorageStack` (EFS + Backups)

6. **Deploys Transit Gateway**
   - Deploys `TransitGatewayStack` after VPCs are ready
   - Configures inter-VPC routing

7. **Deploys Jenkins EKS Cluster**
   - Deploys `JenkinsEksClusterStack` (foundational cluster only)
   - Creates EKS cluster with Kubernetes 1.32
   - Estimated time: 15-20 minutes

8. **Deploys Jenkins EKS Node Groups**
   - Deploys `JenkinsEksNodeGroupsStack` (controller + agent nodes)
   - Creates on-demand controller and spot agent node groups
   - Estimated time: 5-10 minutes

9. **Deploys Jenkins Application**
   - Deploys `JenkinsApplicationStack` (Jenkins + ALB + monitoring)
   - Automatically creates all Kubernetes resources with correct values
   - Estimated time: 3-5 minutes

10. **Deploys Nginx API Cluster**
    - Deploys `NginxApiClusterStack`
    - Waits for completion

11. **Displays Outputs**
    - Shows all CloudFormation stack outputs
    - Provides next steps for accessing Jenkins

## Platform-Specific Notes

### Linux/Mac (Bash)
- Script uses bash shell features
- Requires bash 4.0 or later
- Uses ANSI color codes for output
- Exit code 0 on success, non-zero on failure

### Windows (PowerShell)
- Script uses PowerShell 5.1+ features
- Requires PowerShell execution policy to allow scripts
- Uses PowerShell color formatting
- Exit code 0 on success, non-zero on failure

If you get execution policy errors on Windows:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

For detailed platform compatibility information, see [PLATFORM_COMPATIBILITY.md](PLATFORM_COMPATIBILITY.md).

## Requirements

- **Node.js**: v18 or later
- **npm**: v9 or later
- **AWS CDK**: 2.1105.0 (installed globally)
- **AWS CLI**: v2
- **AWS Credentials**: Configured with appropriate permissions

## CDK Versions

This project uses:
- **aws-cdk-lib**: 2.238.0 (construct library)
- **aws-cdk CLI**: 2.1105.0 (command-line tool)

To ensure compatibility, install the correct global CDK CLI version:

```powershell
npm install -g aws-cdk@2.1105.0
```

## Deployment Order

The script deploys stacks in this order:

```
1. JenkinsNetworkStack + NginxApiNetworkStack (parallel)
   ↓
2. JenkinsStorageStack (EFS + Backups)
   ↓
3. TransitGatewayStack
   ↓
4. JenkinsEksClusterStack (EKS cluster only - 15-20 min)
   ↓
5. JenkinsEksNodeGroupsStack (Node groups + Cluster Autoscaler - 5-10 min)
   ↓
6. JenkinsApplicationStack (Jenkins app + ALB + monitoring - 3-5 min)
   ↓
7. NginxApiClusterStack
```

This order is critical because:
- Application stacks depend on VPC resources from network stacks
- Storage stack must exist before EKS cluster stack (EFS is imported)
- Transit Gateway requires both VPCs to exist
- EKS cluster must exist before node groups can be created
- Node groups must exist before Jenkins application can be deployed
- Jenkins application stack is the most frequently changed (fast iteration)

## Stack Architecture

The Jenkins infrastructure is split into 3 separate stacks for faster iteration:

### 1. JenkinsEksClusterStack (Foundational - Deploy Once)
- EKS cluster with Kubernetes 1.32
- OIDC provider for IRSA
- Cluster logging enabled
- kubectl Lambda layer
- **Deployment time**: 15-20 minutes
- **Change frequency**: Rarely (only for cluster upgrades)

### 2. JenkinsEksNodeGroupsStack (Compute - Occasional Changes)
- Controller node group (on-demand instances)
- Agent node group (spot instances)
- Cluster Autoscaler service account with IRSA
- Node security groups
- **Deployment time**: 5-10 minutes
- **Change frequency**: Occasionally (when scaling or changing instance types)

### 3. JenkinsApplicationStack (Application - Frequent Iteration)
- AWS Load Balancer Controller (Helm)
- Jenkins service account with IRSA
- S3 artifacts bucket
- GitHub webhook secret
- Static PV/StorageClass for EFS
- All Jenkins Kubernetes manifests
- CloudWatch alarms for monitoring
- **Deployment time**: 3-5 minutes
- **Change frequency**: Frequently (when updating Jenkins config, plugins, or monitoring)

**Benefits of this split:**
- **Faster iteration**: Change Jenkins config → only redeploy ApplicationStack (3-5 min vs 20-30 min)
- **Isolated failures**: ALB issue → only ApplicationStack fails, cluster stays up
- **Independent scaling**: Add node group → only NodeGroupsStack changes
- **Clear separation**: Infrastructure vs compute vs application

## Error Handling

The script will:
- Stop on any error
- Display clear error messages
- Exit with non-zero code on failure

Common errors:
- **VPC Limit Reached**: Delete unused VPCs
- **Stack Already Exists**: Delete existing stack or use `cdk deploy` to update
- **Credentials Invalid**: Run `aws configure` to set up credentials

## Cleanup

To delete all infrastructure:

```powershell
# Delete in reverse order
cdk destroy NginxApiClusterStack --force
cdk destroy JenkinsApplicationStack --force
cdk destroy JenkinsEksNodeGroupsStack --force
cdk destroy JenkinsEksClusterStack --force
cdk destroy TransitGatewayStack --force
cdk destroy JenkinsStorageStack --force
cdk destroy NginxApiNetworkStack JenkinsNetworkStack --force
```

**Note**: The 3-stack Jenkins architecture allows you to iterate quickly:
- To update Jenkins config: Only redeploy `JenkinsApplicationStack` (3-5 min)
- To change node groups: Only redeploy `JenkinsEksNodeGroupsStack` (5-10 min)
- To upgrade cluster: Only redeploy `JenkinsEksClusterStack` (15-20 min)

## Manual Deployment

If you prefer manual deployment, follow these steps:

```powershell
# 1. Install dependencies
npm install

# 2. Build TypeScript
npm run build

# 3. Bootstrap CDK (one-time per account/region)
cdk bootstrap

# 4. Deploy network stacks
cdk deploy JenkinsNetworkStack NginxApiNetworkStack --require-approval never

# 5. Deploy storage stack
cdk deploy JenkinsStorageStack --require-approval never

# 6. Deploy Transit Gateway
cdk deploy TransitGatewayStack --require-approval never

# 7. Deploy Jenkins EKS Cluster (foundational - 15-20 min)
cdk deploy JenkinsEksClusterStack --require-approval never

# 8. Deploy Jenkins EKS Node Groups (5-10 min)
cdk deploy JenkinsEksNodeGroupsStack --require-approval never

# 9. Deploy Jenkins Application (3-5 min)
cdk deploy JenkinsApplicationStack --require-approval never

# 10. Deploy Nginx API Cluster
cdk deploy NginxApiClusterStack --require-approval never
```

**Iterative Development Workflow:**

After initial deployment, you can iterate quickly on specific layers:

```powershell
# Update Jenkins configuration (plugins, JCasC, etc.)
# Edit files in k8s/jenkins/ or lib/jenkins/jenkins-application-stack.ts
npm run build
cdk deploy JenkinsApplicationStack --require-approval never  # 3-5 min

# Change node group configuration (instance types, scaling, etc.)
# Edit lib/jenkins/jenkins-eks-nodegroups-stack.ts
npm run build
cdk deploy JenkinsEksNodeGroupsStack --require-approval never  # 5-10 min

# Upgrade EKS cluster version
# Edit lib/jenkins/jenkins-eks-cluster-stack.ts
npm run build
cdk deploy JenkinsEksClusterStack --require-approval never  # 15-20 min
```

## Verification

After deployment, verify the infrastructure:

```powershell
# List all stacks
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE

# List VPCs
aws ec2 describe-vpcs --query "Vpcs[].{VpcId:VpcId,CidrBlock:CidrBlock,Tags:Tags[?Key=='Name'].Value|[0]}" --output table

# List Transit Gateways
aws ec2 describe-transit-gateways --output table

# Configure kubectl for EKS cluster
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2

# Verify cluster access and resources
kubectl get nodes
kubectl get pods -n jenkins
kubectl get ingress -n jenkins

# Get Jenkins URL
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

## Troubleshooting

### Issue: CDK Version Mismatch

**Error**: "Cloud assembly schema version mismatch"

**Solution**: Ensure CDK versions match
```powershell
# Check versions
cdk --version
npm list aws-cdk aws-cdk-lib

# Update if needed
npm install -g aws-cdk@2.1105.0
npm install
```

### Issue: Another CLI Process Running

**Error**: "Another CLI (PID=XXXX) is currently synthing to cdk.out"

**Solution**: Wait for other process to complete or kill it
```powershell
# Wait a few seconds and retry
Start-Sleep -Seconds 5
cdk deploy ...
```

### Issue: AWS Credentials Not Found

**Error**: "Unable to locate credentials"

**Solution**: Configure AWS credentials
```powershell
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-west-2), Output format (json)
```

### Issue: Insufficient Permissions

**Error**: "User is not authorized to perform: cloudformation:CreateStack"

**Solution**: Ensure IAM user/role has required permissions:
- CloudFormation full access
- EC2 full access
- EKS full access
- IAM role creation
- VPC management

## Additional Resources

- [Network Infrastructure Guide](../docs/deployment/NETWORK_INFRASTRUCTURE_GUIDE.md)
- [Deployment Philosophy](../.kiro/steering/deployment-philosophy.md)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
