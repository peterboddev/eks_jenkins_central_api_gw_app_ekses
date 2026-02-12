# Documentation Index

Complete guide to all documentation in this project.

## 🚀 Getting Started

**New to this project? Start here:**

1. **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Complete setup guide from scratch
2. **[scripts/bootstrap-windows.ps1](scripts/bootstrap-windows.ps1)** - Windows bootstrap script
3. **[scripts/bootstrap-linux.sh](scripts/bootstrap-linux.sh)** - Linux/Mac bootstrap script
4. **[README.md](README.md)** - Project overview and quick start

## 📋 Core Documentation

### Setup and Deployment

- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Complete step-by-step setup guide
  - Prerequisites and tool installation
  - Configuration steps
  - Deployment procedures
  - Post-deployment setup
  - Verification steps
  - Troubleshooting

- **[DEPLOYMENT_QUICK_START.md](DEPLOYMENT_QUICK_START.md)** - Fast deployment guide
- **[docs/deployment/DEPLOYMENT_GUIDE.md](docs/deployment/DEPLOYMENT_GUIDE.md)** - Comprehensive deployment instructions
- **[docs/deployment/DEPLOYMENT_PROCEDURES.md](docs/deployment/DEPLOYMENT_PROCEDURES.md)** - Step-by-step procedures
- **[docs/deployment/DEPLOYMENT_CHECKLIST.md](docs/deployment/DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checklist

### Current Status

- **[CURRENT_STATUS.md](CURRENT_STATUS.md)** - Current infrastructure state
  - Deployment status
  - Jenkins access information
  - Recent fixes applied
  - Next steps
  - Quick commands

### Architecture

- **[docs/deployment/JENKINS_3_STACK_ARCHITECTURE.md](docs/deployment/JENKINS_3_STACK_ARCHITECTURE.md)** - 3-stack architecture design
- **[docs/deployment/NETWORK_ARCHITECTURE.md](docs/deployment/NETWORK_ARCHITECTURE.md)** - Network architecture
- **[docs/deployment/NETWORK_INFRASTRUCTURE_GUIDE.md](docs/deployment/NETWORK_INFRASTRUCTURE_GUIDE.md)** - Network infrastructure guide

### Philosophy and Standards

- **[.kiro/steering/deployment-philosophy.md](.kiro/steering/deployment-philosophy.md)** - Deployment philosophy
  - Core principles
  - CDK-first approach
  - No manual steps
  - Infrastructure as code

## 🔧 Configuration Guides

### Jenkins Configuration

- **[docs/guides/JENKINS_AUTOMATED_CONFIG.md](docs/guides/JENKINS_AUTOMATED_CONFIG.md)** - Jenkins automated configuration
- **[docs/guides/JENKINS_JOBS_AS_CODE.md](docs/guides/JENKINS_JOBS_AS_CODE.md)** - Jenkins Configuration as Code (JCasC)
- **[docs/guides/JENKINS_JOBS_SETUP.md](docs/guides/JENKINS_JOBS_SETUP.md)** - Jenkins jobs setup
- **[docs/guides/JENKINS_JOB_DSL_SETUP.md](docs/guides/JENKINS_JOB_DSL_SETUP.md)** - Job DSL setup
- **[docs/guides/JENKINS_AUTOMATED_DEPLOYMENT.md](docs/guides/JENKINS_AUTOMATED_DEPLOYMENT.md)** - Automated deployment

### GitHub Integration

- **[docs/guides/WEBHOOK_QUICK_START.md](docs/guides/WEBHOOK_QUICK_START.md)** - GitHub webhook quick start (5 minutes)
- **[docs/guides/GITHUB_WEBHOOK_SETUP.md](docs/guides/GITHUB_WEBHOOK_SETUP.md)** - Comprehensive webhook guide
- **[docs/guides/JENKINS_GIT_INTEGRATION.md](docs/guides/JENKINS_GIT_INTEGRATION.md)** - Jenkins Git integration

### Security

- **[docs/deployment/JENKINS_ALB_SECURITY_GROUP.md](docs/deployment/JENKINS_ALB_SECURITY_GROUP.md)** - ALB security group configuration
- **[docs/guides/SECRETS_MANAGEMENT.md](docs/guides/SECRETS_MANAGEMENT.md)** - Secrets management
- **[docs/guides/COGNITO_AUTHENTICATION_GUIDE.md](docs/guides/COGNITO_AUTHENTICATION_GUIDE.md)** - Authentication setup

## 🛠️ Operational Guides

### Scripts

- **[scripts/README.md](scripts/README.md)** - Scripts documentation
- **[scripts/PLATFORM_COMPATIBILITY.md](scripts/PLATFORM_COMPATIBILITY.md)** - Platform compatibility
- **[scripts/bootstrap-windows.ps1](scripts/bootstrap-windows.ps1)** - Windows bootstrap
- **[scripts/bootstrap-linux.sh](scripts/bootstrap-linux.sh)** - Linux/Mac bootstrap
- **[scripts/deploy-infrastructure.ps1](scripts/deploy-infrastructure.ps1)** - Windows deployment
- **[scripts/deploy-infrastructure.sh](scripts/deploy-infrastructure.sh)** - Linux/Mac deployment

### Maintenance

- **[docs/guides/RECOVERY_PROCEDURES.md](docs/guides/RECOVERY_PROCEDURES.md)** - Disaster recovery
- **[docs/guides/QUICK_REFERENCE.md](docs/guides/QUICK_REFERENCE.md)** - Quick reference commands
- **[docs/guides/SETUP_TOOLS.md](docs/guides/SETUP_TOOLS.md)** - Tool setup

### Monitoring

- **[docs/deployment/INFRASTRUCTURE_VALIDATION.md](docs/deployment/INFRASTRUCTURE_VALIDATION.md)** - Infrastructure validation
- **[config/monitoring-dashboard.json](config/monitoring-dashboard.json)** - CloudWatch dashboard

## 📦 Component Documentation

### Kubernetes Components

- **[k8s/jenkins/README.md](k8s/jenkins/README.md)** - Jenkins deployment
- **[k8s/cluster-autoscaler/README.md](k8s/cluster-autoscaler/README.md)** - Cluster Autoscaler
- **[k8s/efs-csi-driver/README.md](k8s/efs-csi-driver/README.md)** - EFS CSI Driver
- **[k8s/monitoring/README.md](k8s/monitoring/README.md)** - CloudWatch Container Insights

### Application Deployment

- **[docs/guides/NGINX_API_DEPLOYMENT_GUIDE.md](docs/guides/NGINX_API_DEPLOYMENT_GUIDE.md)** - nginx-api deployment
- **[docs/guides/NGINX_DOCKER_JOB_SETUP.md](docs/guides/NGINX_DOCKER_JOB_SETUP.md)** - nginx Docker job setup
- **[docs/guides/JENKINS_TO_APP_CLUSTER_CONNECTIVITY.md](docs/guides/JENKINS_TO_APP_CLUSTER_CONNECTIVITY.md)** - Jenkins to app cluster connectivity

## 🔄 Development Workflow

### OpenAPI-Driven Development

- **[docs/guides/AUTOMATED_OPENAPI_WORKFLOW.md](docs/guides/AUTOMATED_OPENAPI_WORKFLOW.md)** - OpenAPI workflow
- **[docs/guides/CODE_GENERATION_FROM_OPENAPI.md](docs/guides/CODE_GENERATION_FROM_OPENAPI.md)** - Code generation
- **[docs/guides/API_CONTRACT_MANAGEMENT.md](docs/guides/API_CONTRACT_MANAGEMENT.md)** - API contract management
- **[docs/guides/OPENAPI_INTEGRATION_COMPLETE.md](docs/deployment/OPENAPI_INTEGRATION_COMPLETE.md)** - OpenAPI integration

### Project Organization

- **[docs/guides/PROJECT_ORGANIZATION.md](docs/guides/PROJECT_ORGANIZATION.md)** - Project structure
- **[docs/guides/WORKFLOW_SUMMARY.md](docs/guides/WORKFLOW_SUMMARY.md)** - Workflow summary
- **[docs/guides/EKS_VERSION_STANDARD.md](docs/guides/EKS_VERSION_STANDARD.md)** - EKS version standard

## 📊 Status and History

### Deployment Status

- **[docs/deployment/DEPLOYMENT_STATUS.md](docs/deployment/DEPLOYMENT_STATUS.md)** - Component status
- **[docs/deployment/DEPLOYMENT_SUCCESS.md](docs/deployment/DEPLOYMENT_SUCCESS.md)** - Deployment success
- **[docs/deployment/DEPLOYMENT_READINESS_REPORT.md](docs/deployment/DEPLOYMENT_READINESS_REPORT.md)** - Readiness report
- **[docs/deployment/FINAL_SETUP_COMPLETE.md](docs/deployment/FINAL_SETUP_COMPLETE.md)** - Final setup

### Completion Reports

- **[docs/deployment/ALB_SETUP_COMPLETE.md](docs/deployment/ALB_SETUP_COMPLETE.md)** - ALB setup
- **[docs/deployment/AUTHENTICATION_COMPLETE.md](docs/deployment/AUTHENTICATION_COMPLETE.md)** - Authentication
- **[docs/deployment/JENKINS_AUTOMATION_COMPLETE.md](docs/deployment/JENKINS_AUTOMATION_COMPLETE.md)** - Jenkins automation
- **[docs/deployment/NGINX_API_CLUSTER_COMPLETE.md](docs/deployment/NGINX_API_CLUSTER_COMPLETE.md)** - Nginx API cluster
- **[docs/deployment/NODEJS_APPLICATION_COMPLETE.md](docs/deployment/NODEJS_APPLICATION_COMPLETE.md)** - Node.js application
- **[docs/deployment/TRANSIT_GATEWAY_SETUP_COMPLETE.md](docs/deployment/TRANSIT_GATEWAY_SETUP_COMPLETE.md)** - Transit Gateway

### Investigation Reports

- **[ALB_INVESTIGATION_COMPLETE.md](ALB_INVESTIGATION_COMPLETE.md)** - ALB investigation
- **[JENKINS_ALB_STATUS.md](JENKINS_ALB_STATUS.md)** - Jenkins ALB status
- **[HARDCODED_VALUES_AUDIT.md](HARDCODED_VALUES_AUDIT.md)** - Hardcoded values audit
- **[HARDCODED_VALUES_FIXED.md](HARDCODED_VALUES_FIXED.md)** - Hardcoded values fixes
- **[NODE_BOOTSTRAP_FIX_COMPLETE.md](NODE_BOOTSTRAP_FIX_COMPLETE.md)** - Node bootstrap fix
- **[STACK_DECOUPLING_COMPLETE.md](STACK_DECOUPLING_COMPLETE.md)** - Stack decoupling

## 🧪 Testing and Validation

### Cache Testing

- **[docs/guides/CACHE_QUICK_REFERENCE.md](docs/guides/CACHE_QUICK_REFERENCE.md)** - Cache quick reference
- **[docs/guides/CREATE_CACHED_JOB.md](docs/guides/CREATE_CACHED_JOB.md)** - Create cached job
- **[docs/guides/DOCKER_CACHE_TEST_PLAN.md](docs/guides/DOCKER_CACHE_TEST_PLAN.md)** - Docker cache test plan

### Manual Operations

- **[docs/guides/CREATE_JENKINS_JOBS_MANUALLY.md](docs/guides/CREATE_JENKINS_JOBS_MANUALLY.md)** - Manual job creation
- **[docs/guides/VERIFY_AGENT_CONFIG.md](docs/guides/VERIFY_AGENT_CONFIG.md)** - Agent configuration verification

## 📝 Configuration Files

### Security

- **[security/alb-ip-whitelist.json](security/alb-ip-whitelist.json)** - ALB IP whitelist (gitignored)
- **[security/alb-ip-whitelist.sample.json](security/alb-ip-whitelist.sample.json)** - Sample configuration

### IAM Policies

- **[config/alb-controller-iam-policy.json](config/alb-controller-iam-policy.json)** - ALB controller policy
- **[config/efs-policy.json](config/efs-policy.json)** - EFS policy
- **[config/iam-policy.json](config/iam-policy.json)** - IAM policy
- **[config/karpenter-controller-policy.json](config/karpenter-controller-policy.json)** - Karpenter policy

### Jenkins Configuration

- **[k8s/jenkins/jcasc-main-configmap.yaml](k8s/jenkins/jcasc-main-configmap.yaml)** - Jenkins Configuration as Code
- **[k8s/jenkins/plugins-configmap.yaml](k8s/jenkins/plugins-configmap.yaml)** - Jenkins plugins
- **[jenkins-jobs/seed_job.groovy](jenkins-jobs/seed_job.groovy)** - Job DSL seed job

## 🔍 Quick Navigation

### By Task

| Task | Documentation |
|------|---------------|
| **First time setup** | [SETUP_GUIDE.md](SETUP_GUIDE.md) |
| **Bootstrap tools** | [bootstrap-windows.ps1](scripts/bootstrap-windows.ps1), [bootstrap-linux.sh](scripts/bootstrap-linux.sh) |
| **Deploy infrastructure** | [deploy-infrastructure.ps1](scripts/deploy-infrastructure.ps1), [deploy-infrastructure.sh](scripts/deploy-infrastructure.sh) |
| **Configure Jenkins** | [JENKINS_AUTOMATED_CONFIG.md](docs/guides/JENKINS_AUTOMATED_CONFIG.md) |
| **Setup webhooks** | [WEBHOOK_QUICK_START.md](docs/guides/WEBHOOK_QUICK_START.md) |
| **Troubleshoot** | [SETUP_GUIDE.md#troubleshooting](SETUP_GUIDE.md#troubleshooting) |
| **Check status** | [CURRENT_STATUS.md](CURRENT_STATUS.md) |
| **Quick commands** | [QUICK_REFERENCE.md](docs/guides/QUICK_REFERENCE.md) |

### By Role

| Role | Documentation |
|------|---------------|
| **New Developer** | [SETUP_GUIDE.md](SETUP_GUIDE.md), [README.md](README.md) |
| **DevOps Engineer** | [DEPLOYMENT_GUIDE.md](docs/deployment/DEPLOYMENT_GUIDE.md), [deployment-philosophy.md](.kiro/steering/deployment-philosophy.md) |
| **Jenkins Admin** | [JENKINS_AUTOMATED_CONFIG.md](docs/guides/JENKINS_AUTOMATED_CONFIG.md), [JENKINS_JOBS_AS_CODE.md](docs/guides/JENKINS_JOBS_AS_CODE.md) |
| **Security Engineer** | [JENKINS_ALB_SECURITY_GROUP.md](docs/deployment/JENKINS_ALB_SECURITY_GROUP.md), [SECRETS_MANAGEMENT.md](docs/guides/SECRETS_MANAGEMENT.md) |
| **SRE** | [RECOVERY_PROCEDURES.md](docs/guides/RECOVERY_PROCEDURES.md), [INFRASTRUCTURE_VALIDATION.md](docs/deployment/INFRASTRUCTURE_VALIDATION.md) |

## 📚 External Resources

- [AWS EKS Documentation](https://docs.aws.amazon.com/eks/)
- [Jenkins Documentation](https://www.jenkins.io/doc/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Jenkins Configuration as Code](https://github.com/jenkinsci/configuration-as-code-plugin)
- [Job DSL Plugin](https://github.com/jenkinsci/job-dsl-plugin)

---

**Last Updated**: 2026-02-12

For questions or issues, refer to the troubleshooting section in [SETUP_GUIDE.md](SETUP_GUIDE.md).
