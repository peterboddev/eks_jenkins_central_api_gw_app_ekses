# Jenkins EKS Cluster - Production-Ready CI/CD Platform

A complete, production-ready Jenkins CI/CD platform deployed on Amazon EKS with cost-optimized spot instances, persistent storage, and comprehensive monitoring.

## 🚀 Quick Start

### New to this project? Start here!

**Complete Setup Guide**: See [SETUP_GUIDE.md](SETUP_GUIDE.md) for comprehensive step-by-step instructions.

### Automated Bootstrap (Recommended)

Run the bootstrap script to install all required tools and dependencies:

**Windows (PowerShell)**:
```powershell
.\scripts\bootstrap-windows.ps1
```

**Linux/Mac (Bash)**:
```bash
chmod +x scripts/bootstrap-linux.sh
./scripts/bootstrap-linux.sh
```

The bootstrap script will:
- Install AWS CLI, Node.js, kubectl, Git, Helm, and AWS CDK
- Configure AWS credentials
- Install project dependencies
- Bootstrap AWS CDK
- Prepare kubectl layer
- Configure ALB IP whitelist

### Quick Deployment

After bootstrapping, deploy the infrastructure:

**Windows**:
```powershell
.\scripts\deploy-infrastructure.ps1
```

**Linux/Mac**:
```bash
chmod +x scripts/deploy-infrastructure.sh
./scripts/deploy-infrastructure.sh
```

**Deployment time**: 30-40 minutes

For detailed instructions, see [SETUP_GUIDE.md](SETUP_GUIDE.md).

## 🎯 Features

- **High Availability**: Jenkins controller runs on on-demand instances
- **Cost Optimization**: Jenkins agents run on spot instances (70% cost savings)
- **Persistent Storage**: EFS for Jenkins home with automated daily backups (30-day retention)
- **Secure**: IRSA for AWS permissions, private VPC, encryption at rest
- **Auto-Scaling**: Cluster Autoscaler for dynamic node provisioning
- **Resilient**: Node Termination Handler for graceful spot interruption handling
- **Observable**: CloudWatch Container Insights with metrics and logs
- **Infrastructure as Code**: Complete CDK implementation
- **Property-Based Testing**: Comprehensive correctness verification

## 📋 Architecture

### Infrastructure Components

- **VPC**: 10.0.0.0/16 with private subnets across 2 AZs
- **EKS Cluster**: Kubernetes 1.28 with private endpoint
- **Node Groups**:
  - Controller: 1-2 on-demand instances (t3.large/xlarge)
  - Agents: 2-10 spot instances (m5/m5a/m6i large/xlarge)
- **Storage**:
  - EFS: Jenkins home directory with encryption, lifecycle management, and automated daily backups (30-day retention)
  - S3: Artifacts with versioning and lifecycle policy
- **Networking**:
  - 2 NAT Gateways for high availability
  - 6 VPC Endpoints for AWS service access
  - Security groups for network isolation
- **IAM**: 6 roles with IRSA for secure AWS access
- **Monitoring**: CloudWatch Container Insights with 5 alarms

### Kubernetes Components

- **Jenkins Controller**: StatefulSet with persistent EFS storage
- **EFS CSI Driver**: Dynamic volume provisioning
- **Cluster Autoscaler**: Automatic node scaling
- **Node Termination Handler**: Graceful spot interruption handling
- **CloudWatch Agent**: Metrics and log collection
- **Fluent Bit**: Log forwarding to CloudWatch

## 🚀 Quick Start

### CDK Version Requirements

This project uses:
- **aws-cdk-lib**: 2.238.0 (construct library)
- **aws-cdk CLI**: 2.1105.0 (command-line tool)

```powershell
# Install correct global CDK CLI version
npm install -g aws-cdk@2.1105.0
```

### Automated Deployment (Recommended)

**Linux/Mac:**
```bash
chmod +x scripts/deploy-infrastructure.sh
./scripts/deploy-infrastructure.sh
```

**Windows:**
```powershell
.\scripts\deploy-infrastructure.ps1
```

This automated script will deploy all infrastructure in the correct order. See [DEPLOYMENT_QUICK_START.md](DEPLOYMENT_QUICK_START.md) for details.

### Manual Deployment

See the detailed guides:
- **Quick Start**: [DEPLOYMENT_QUICK_START.md](DEPLOYMENT_QUICK_START.md)
- **Comprehensive Guide**: [docs/deployment/NETWORK_INFRASTRUCTURE_GUIDE.md](docs/deployment/NETWORK_INFRASTRUCTURE_GUIDE.md)
- **Scripts Documentation**: [scripts/README.md](scripts/README.md)

### Prerequisites

**Required Tools:**
- **AWS CLI v2.x** - [Install Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- **kubectl v1.28+** - [Install Guide](https://kubernetes.io/docs/tasks/tools/)
- **Node.js v18+** - [Download](https://nodejs.org/)
- **AWS CDK v2.x** - Install via npm: `npm install -g aws-cdk`

**Optional Tools (for manual operations):**
- **eksctl** - [Install Guide](https://eksctl.io/installation/)
- **helm** - [Install Guide](https://helm.sh/docs/intro/install/)

**AWS Account:**
- AWS account with appropriate IAM permissions
- AWS CLI configured with credentials: `aws configure`

**Note:** Binary files like `kubectl-layer.zip` are auto-generated during build and excluded from git. Do not commit binary tools (.exe, .zip, .jar) to the repository.

### Deploy in 11 Steps (~90 minutes)

```bash
# 1. Install dependencies
npm install && npm run build

# 2. Bootstrap CDK (first time only)
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
cdk bootstrap aws://${AWS_ACCOUNT_ID}/us-west-2

# 3. Deploy infrastructure (creates webhook secret automatically)
cdk deploy

# Note: This creates the GitHub webhook secret in AWS Secrets Manager
# Secret name: jenkins/github-webhook-secret

# 4. Configure kubectl
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2

# 5. Deploy EFS CSI Driver
cd k8s/efs-csi-driver && chmod +x deploy.sh && ./deploy.sh

# 6. Deploy Jenkins
cd ../jenkins && chmod +x deploy.sh && ./deploy.sh

# 7. Deploy Cluster Autoscaler
cd ../cluster-autoscaler && chmod +x deploy.sh
export CLUSTER_NAME=jenkins-eks-cluster
export CLUSTER_AUTOSCALER_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name JenkinsEksStack --query 'Stacks[0].Outputs[?OutputKey==`ClusterAutoscalerRoleArn`].OutputValue' --output text)
CLUSTER_NAME=$CLUSTER_NAME CLUSTER_AUTOSCALER_ROLE_ARN=$CLUSTER_AUTOSCALER_ROLE_ARN ./deploy.sh

# 8. Deploy Node Termination Handler
cd ../node-termination-handler && chmod +x deploy.sh && ./deploy.sh

# 9. Deploy CloudWatch Container Insights
cd ../monitoring && chmod +x deploy.sh
export AWS_REGION=us-west-2
CLUSTER_NAME=$CLUSTER_NAME AWS_REGION=$AWS_REGION ./deploy.sh

# 10. Access Jenkins
kubectl port-forward -n jenkins svc/jenkins 8080:8080
# Get password: kubectl exec -n jenkins $(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}') -- cat /var/jenkins_home/secrets/initialAdminPassword
```

Open http://localhost:8080 and complete Jenkins setup.

### Step 11: Configure GitHub Webhook (Required for CI/CD)

**When**: After Jenkins is deployed and accessible via ALB (step 10 complete)

**Why**: Enables instant build triggers when you push code to GitHub

**Prerequisites**: 
- ✅ CDK stack deployed (step 3) - this created the webhook secret
- ✅ Jenkins running and accessible (step 10)

**Setup**:

```bash
# 1. Retrieve webhook secret (automatically created by CDK in step 3)
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id jenkins/github-webhook-secret \
  --region us-west-2 \
  --query SecretString \
  --output text | jq -r .secret)

echo "Your webhook secret: $SECRET"
# Copy this secret - you'll paste it into GitHub in step 4

# 2. Get Jenkins ALB URL
ALB_URL=$(kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Your Jenkins URL: http://$ALB_URL"

# 3. Open GitHub webhook settings in your browser:
echo "Go to: https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses/settings/hooks"

# 4. Click "Add webhook" and configure:
# - Payload URL: http://$ALB_URL/github-webhook/
# - Content type: application/json
# - Secret: Paste the secret from step 1 above
# - Events: Select "Just the push event"
# - Active: ✓ Check this box
# - Click "Add webhook"

# 5. Verify webhook is working:
# - Make a test commit and push
# - Check GitHub webhook "Recent Deliveries" for green checkmark
# - Check Jenkins for triggered build
```

**Result**: Builds trigger instantly when you push code (no 5-minute polling delay)

**Troubleshooting**: See [docs/guides/GITHUB_WEBHOOK_SETUP.md](docs/guides/GITHUB_WEBHOOK_SETUP.md) for detailed setup and troubleshooting

**Note for existing deployments**: If you deployed before the webhook secret was added to CDK, you need to update your stack:
```bash
npm run build && cdk deploy
```
See [docs/guides/UPDATE_STACK_FOR_WEBHOOK.md](docs/guides/UPDATE_STACK_FOR_WEBHOOK.md) for details.

See [QUICK_START.md](QUICK_START.md) for detailed instructions.

## 📚 Documentation

**Complete Documentation Index**: See [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) for all documentation organized by topic and role.

### Quick Links

- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Complete setup guide from scratch
- **[CURRENT_STATUS.md](CURRENT_STATUS.md)** - Current infrastructure state
- **[JENKINS_JOBS_AUTOMATION_COMPLETE.md](JENKINS_JOBS_AUTOMATION_COMPLETE.md)** - Jenkins jobs automation details

### Project Documentation
- **[.kiro/task-summaries/PROJECT_HISTORY.md](.kiro/task-summaries/PROJECT_HISTORY.md)** - Complete project implementation history
- **[docs/guides/QUICK_START.md](docs/guides/QUICK_START.md)** - Fast deployment guide
- **[docs/guides/QUICK_REFERENCE.md](docs/guides/QUICK_REFERENCE.md)** - Quick reference for common commands

### Deployment Guides
- **[docs/deployment/DEPLOYMENT_GUIDE.md](docs/deployment/DEPLOYMENT_GUIDE.md)** - Comprehensive deployment instructions
- **[docs/deployment/DEPLOYMENT_PROCEDURES.md](docs/deployment/DEPLOYMENT_PROCEDURES.md)** - Step-by-step deployment procedures
- **[docs/deployment/DEPLOYMENT_CHECKLIST.md](docs/deployment/DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checklist
- **[docs/deployment/INFRASTRUCTURE_VALIDATION.md](docs/deployment/INFRASTRUCTURE_VALIDATION.md)** - Infrastructure validation report

### Feature Guides
- **[docs/guides/WEBHOOK_QUICK_START.md](docs/guides/WEBHOOK_QUICK_START.md)** - GitHub webhook setup (5 minutes)
- **[docs/guides/GITHUB_WEBHOOK_SETUP.md](docs/guides/GITHUB_WEBHOOK_SETUP.md)** - Comprehensive webhook guide
- **[docs/guides/JENKINS_AUTOMATED_CONFIG.md](docs/guides/JENKINS_AUTOMATED_CONFIG.md)** - Jenkins automated configuration
- **[docs/guides/JENKINS_GIT_INTEGRATION.md](docs/guides/JENKINS_GIT_INTEGRATION.md)** - Jenkins git integration
- **[docs/guides/AUTOMATED_OPENAPI_WORKFLOW.md](docs/guides/AUTOMATED_OPENAPI_WORKFLOW.md)** - OpenAPI-driven development workflow
- **[docs/guides/CODE_GENERATION_FROM_OPENAPI.md](docs/guides/CODE_GENERATION_FROM_OPENAPI.md)** - Code generation guide
- **[docs/guides/API_CONTRACT_MANAGEMENT.md](docs/guides/API_CONTRACT_MANAGEMENT.md)** - API contract management
- **[docs/guides/COGNITO_AUTHENTICATION_GUIDE.md](docs/guides/COGNITO_AUTHENTICATION_GUIDE.md)** - Authentication setup and usage
- **[docs/guides/JENKINS_JOBS_AS_CODE.md](docs/guides/JENKINS_JOBS_AS_CODE.md)** - Jenkins Configuration as Code
- **[docs/guides/NGINX_API_DEPLOYMENT_GUIDE.md](docs/guides/NGINX_API_DEPLOYMENT_GUIDE.md)** - nginx-api deployment guide
- **[docs/guides/EKS_VERSION_STANDARD.md](docs/guides/EKS_VERSION_STANDARD.md)** - EKS version standardization
- **[docs/guides/RECOVERY_PROCEDURES.md](docs/guides/RECOVERY_PROCEDURES.md)** - Disaster recovery procedures

### Component Documentation
- **[k8s/efs-csi-driver/README.md](k8s/efs-csi-driver/README.md)** - EFS CSI Driver
- **[k8s/jenkins/README.md](k8s/jenkins/README.md)** - Jenkins deployment
- **[k8s/cluster-autoscaler/README.md](k8s/cluster-autoscaler/README.md)** - Cluster Autoscaler
- **[k8s/node-termination-handler/README.md](k8s/node-termination-handler/README.md)** - Node Termination Handler
- **[k8s/monitoring/README.md](k8s/monitoring/README.md)** - CloudWatch Container Insights

## 🧪 Testing

### Property-Based Tests

Two comprehensive property-based tests verify correctness:

1. **Data Persistence Test**: Verifies data persists across pod restarts (100 iterations)
2. **Volume Remounting Test**: Verifies EFS remounts correctly after pod rescheduling (100 iterations)

```bash
# Run property-based tests (requires deployed cluster)
export RUN_INTEGRATION_TESTS=true
npm test -- test/property-tests/
```

### Unit Tests

```bash
# Run unit tests
npm test
```

## 💰 Cost Estimate

**Monthly Cost** (us-west-2):
- EKS Cluster: ~$73/month
- EC2 Instances: ~$90/month (1 on-demand + 2 spot)
- EFS: ~$10/month (100GB with IA)
- S3: ~$2/month (100GB)
- NAT Gateways: ~$65/month
- VPC Endpoints: ~$15/month
- CloudWatch: ~$10/month
- **Total: ~$265/month**

### Cost Optimization

- ✅ Spot instances for agents (70% savings)
- ✅ EFS lifecycle management (IA after 30 days)
- ✅ S3 lifecycle policy (Intelligent-Tiering)
- ✅ VPC endpoints reduce data transfer costs
- ✅ Cluster Autoscaler scales down unused nodes

## 🔒 Security

- ✅ Private EKS endpoint only
- ✅ Private subnets for all workloads
- ✅ VPC endpoints for AWS service access
- ✅ IRSA for pod-level AWS permissions
- ✅ No long-lived credentials
- ✅ EFS encryption at rest
- ✅ S3 encryption (SSE-S3)
- ✅ Security groups restrict traffic
- ✅ Kubernetes RBAC

## 📊 Monitoring

### CloudWatch Container Insights

- Cluster-level metrics (CPU, memory, disk, network)
- Pod-level metrics (resource utilization)
- Node-level metrics (EC2 instance performance)
- Application logs (container logs)
- System logs (Kubernetes control plane)

### CloudWatch Alarms

- Cluster health monitoring
- Node failure detection
- Disk space monitoring
- Pending pods threshold
- Spot interruption alerts

View metrics: https://console.aws.amazon.com/cloudwatch/ → Container Insights

## 🛠️ Maintenance

### Regular Tasks

**Daily**:
- Monitor Jenkins job queue
- Check spot instance interruptions
- Review CloudWatch logs

**Weekly**:
- Review EFS storage usage
- Update Jenkins plugins
- Check S3 bucket size

**Monthly**:
- Review AWS costs
- Update Jenkins version
- Check for Kubernetes updates
- Rotate credentials

### Backup and Recovery

#### Automated EFS Backup

Jenkins persistent data (configurations, jobs, plugins, build history) is automatically backed up using AWS Backup:

- **Backup Vault**: `jenkins-eks-efs-backup-vault`
- **Backup Schedule**: Daily at 2 AM UTC
- **Retention Period**: 30 days
- **Backup Window**: 1-hour start window, 2-hour completion window
- **Restore Capability**: Enabled (can restore to new or existing EFS)

**View Backups**:
```bash
# List backup vault
aws backup list-backup-vaults --region us-west-2

# List recovery points
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name jenkins-eks-efs-backup-vault \
  --region us-west-2
```

**Restore from Backup**:
```bash
# Get EFS file system ID
EFS_ID=$(aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --query 'Stacks[0].Outputs[?OutputKey==`EfsFileSystemIdOutput`].OutputValue' \
  --output text \
  --region us-west-2)

# List available recovery points
aws backup list-recovery-points-by-resource \
  --resource-arn arn:aws:elasticfilesystem:us-west-2:${AWS_ACCOUNT_ID}:file-system/${EFS_ID} \
  --region us-west-2

# Restore from recovery point (use AWS Console or CLI)
# See: https://docs.aws.amazon.com/aws-backup/latest/devguide/restoring-efs.html
```

#### Other Backups

- **Artifacts**: Versioned in S3 with 90-day retention
- **Infrastructure**: Defined as code in CDK (Git repository)

#### Complete Recovery Procedure

1. Deploy CDK stack (creates new EFS)
2. Restore EFS from AWS Backup recovery point
3. Update Jenkins PVC to use restored EFS
4. Deploy Kubernetes manifests
5. Verify Jenkins configuration and jobs

## 🔧 Troubleshooting

### Common Issues

**Jenkins pod not starting**:
```bash
kubectl describe pod -n jenkins -l app=jenkins-controller
kubectl get pvc -n jenkins
kubectl logs -n jenkins -l app=jenkins-controller
```

**Spot interruptions**:
```bash
kubectl logs -n kube-system -l app=aws-node-termination-handler
kubectl get events -n jenkins --sort-by='.lastTimestamp'
```

**Autoscaling not working**:
```bash
kubectl logs -n kube-system -l app=cluster-autoscaler
kubectl get nodes
kubectl describe nodes
```

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed troubleshooting.

## 🗑️ Clean Up

```bash
# Delete Kubernetes resources
kubectl delete namespace jenkins
kubectl delete namespace amazon-cloudwatch
kubectl delete daemonset aws-node-termination-handler -n kube-system
kubectl delete deployment cluster-autoscaler -n kube-system
kubectl delete daemonset efs-csi-node -n kube-system
kubectl delete deployment efs-csi-controller -n kube-system

# Delete CDK stack
cdk destroy
```

**Warning**: This deletes all data including Jenkins configurations and build history!

## 📝 Project Structure

```
eks_jenkins/
├── lib/
│   └── eks_jenkins-stack.ts          # CDK infrastructure definition
├── k8s/
│   ├── efs-csi-driver/                # EFS CSI Driver manifests
│   ├── jenkins/                       # Jenkins controller manifests
│   ├── cluster-autoscaler/            # Cluster Autoscaler manifests
│   ├── node-termination-handler/      # Node Termination Handler manifests
│   └── monitoring/                    # CloudWatch Container Insights manifests
├── test/
│   ├── eks_jenkins.test.ts            # CDK unit tests
│   └── property-tests/                # Property-based tests
│       ├── data-persistence.test.ts
│       └── volume-remounting.test.ts
├── .kiro/specs/jenkins-eks-cluster/   # Specification documents
│   ├── requirements.md
│   ├── design.md
│   └── tasks.md
├── QUICK_START.md                     # Quick start guide
├── DEPLOYMENT_GUIDE.md                # Comprehensive deployment guide
├── DEPLOYMENT_STATUS.md               # Component status
└── README.md                          # This file
```

## 🤝 Contributing

This project follows the spec-driven development methodology:

1. **Requirements**: See `.kiro/specs/jenkins-eks-cluster/requirements.md`
2. **Design**: See `.kiro/specs/jenkins-eks-cluster/design.md`
3. **Tasks**: See `.kiro/specs/jenkins-eks-cluster/tasks.md`

All 32 required tasks are complete. Optional tasks (unit tests, integration tests, documentation) can be added as needed.

## 📄 License

This project is provided as-is for educational and production use.

## 🔗 Resources

- [AWS EKS Documentation](https://docs.aws.amazon.com/eks/)
- [Jenkins Documentation](https://www.jenkins.io/doc/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [EFS CSI Driver](https://github.com/kubernetes-sigs/aws-efs-csi-driver)
- [Cluster Autoscaler](https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler)
- [Node Termination Handler](https://github.com/aws/aws-node-termination-handler)

## ✅ Status

**All 32 required tasks completed!**

- ✅ CDK Infrastructure (Tasks 1-7)
- ✅ Kubernetes Components (Tasks 8-10)
- ✅ Autoscaling and Resilience (Tasks 11-12)
- ✅ Security Groups (Task 13)
- ✅ Monitoring and Observability (Task 14)
- ✅ Property-Based Tests (Task 15)

**Ready for production deployment!**

---

**Built with**: AWS CDK, Amazon EKS, Jenkins, Kubernetes, TypeScript  
**Deployment Time**: ~90 minutes  
**Monthly Cost**: ~$265  
**Status**: ✅ Production Ready
