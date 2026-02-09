# Documentation Index

This directory contains all project documentation organized by category.

## Quick Links

- **[Project History](../.kiro/task-summaries/PROJECT_HISTORY.md)** - Complete implementation history
- **[Quick Start](guides/QUICK_START.md)** - Get started quickly
- **[Quick Reference](guides/QUICK_REFERENCE.md)** - Common commands

## Documentation Structure

### 📦 Deployment Documentation (`deployment/`)

Complete guides for deploying and validating the infrastructure:

- **[DEPLOYMENT_GUIDE.md](deployment/DEPLOYMENT_GUIDE.md)** - Comprehensive deployment guide
- **[DEPLOYMENT_PROCEDURES.md](deployment/DEPLOYMENT_PROCEDURES.md)** - Step-by-step procedures
- **[DEPLOYMENT_CHECKLIST.md](deployment/DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checklist
- **[DEPLOYMENT_READINESS_REPORT.md](deployment/DEPLOYMENT_READINESS_REPORT.md)** - Readiness assessment
- **[DEPLOYMENT_STATUS.md](deployment/DEPLOYMENT_STATUS.md)** - Current deployment status
- **[DEPLOYMENT_SUCCESS.md](deployment/DEPLOYMENT_SUCCESS.md)** - Deployment completion report
- **[INFRASTRUCTURE_VALIDATION.md](deployment/INFRASTRUCTURE_VALIDATION.md)** - Infrastructure validation
- **[FINAL_SETUP_COMPLETE.md](deployment/FINAL_SETUP_COMPLETE.md)** - Final setup summary

#### Cluster-Specific Deployment

- **[NGINX_API_CLUSTER_COMPLETE.md](deployment/NGINX_API_CLUSTER_COMPLETE.md)** - nginx-api cluster deployment
- **[TRANSIT_GATEWAY_SETUP_COMPLETE.md](deployment/TRANSIT_GATEWAY_SETUP_COMPLETE.md)** - Transit Gateway setup
- **[ALB_SETUP_COMPLETE.md](deployment/ALB_SETUP_COMPLETE.md)** - Application Load Balancer setup
- **[AUTHENTICATION_COMPLETE.md](deployment/AUTHENTICATION_COMPLETE.md)** - Cognito authentication setup

#### Feature Completion

- **[NODEJS_APPLICATION_COMPLETE.md](deployment/NODEJS_APPLICATION_COMPLETE.md)** - Node.js application
- **[OPENAPI_INTEGRATION_COMPLETE.md](deployment/OPENAPI_INTEGRATION_COMPLETE.md)** - OpenAPI integration
- **[OPENAPI_CODE_GENERATION_COMPLETE.md](deployment/OPENAPI_CODE_GENERATION_COMPLETE.md)** - Code generation

### 📖 Feature Guides (`guides/`)

How-to guides for specific features and workflows:

#### Getting Started
- **[QUICK_START.md](guides/QUICK_START.md)** - Fast deployment guide
- **[QUICK_REFERENCE.md](guides/QUICK_REFERENCE.md)** - Common commands reference
- **[WORKFLOW_SUMMARY.md](guides/WORKFLOW_SUMMARY.md)** - Development workflow overview

#### Jenkins & CI/CD
- **[WEBHOOK_QUICK_START.md](guides/WEBHOOK_QUICK_START.md)** - GitHub webhook setup (5 minutes)
- **[GITHUB_WEBHOOK_SETUP.md](guides/GITHUB_WEBHOOK_SETUP.md)** - Comprehensive webhook guide
- **[JENKINS_AUTOMATED_CONFIG.md](guides/JENKINS_AUTOMATED_CONFIG.md)** - Jenkins automated configuration
- **[JENKINS_GIT_INTEGRATION.md](guides/JENKINS_GIT_INTEGRATION.md)** - Jenkins git integration
- **[JENKINS_JOBS_AS_CODE.md](guides/JENKINS_JOBS_AS_CODE.md)** - Jenkins Configuration as Code
- **[JENKINS_TO_APP_CLUSTER_CONNECTIVITY.md](guides/JENKINS_TO_APP_CLUSTER_CONNECTIVITY.md)** - Cross-cluster connectivity

#### OpenAPI-Driven Development
- **[AUTOMATED_OPENAPI_WORKFLOW.md](guides/AUTOMATED_OPENAPI_WORKFLOW.md)** - Automated workflow with Kiro hooks
- **[CODE_GENERATION_FROM_OPENAPI.md](guides/CODE_GENERATION_FROM_OPENAPI.md)** - Code generation guide
- **[API_CONTRACT_MANAGEMENT.md](guides/API_CONTRACT_MANAGEMENT.md)** - API contract management

#### Infrastructure & Deployment
- **[NGINX_API_DEPLOYMENT_GUIDE.md](guides/NGINX_API_DEPLOYMENT_GUIDE.md)** - nginx-api deployment
- **[EKS_VERSION_STANDARD.md](guides/EKS_VERSION_STANDARD.md)** - EKS version standardization

#### Security & Authentication
- **[COGNITO_AUTHENTICATION_GUIDE.md](guides/COGNITO_AUTHENTICATION_GUIDE.md)** - Complete authentication guide

#### Operations & Maintenance
- **[RECOVERY_PROCEDURES.md](guides/RECOVERY_PROCEDURES.md)** - Disaster recovery procedures
- **[CACHE_QUICK_REFERENCE.md](guides/CACHE_QUICK_REFERENCE.md)** - Docker cache reference
- **[DOCKER_CACHE_TEST_PLAN.md](guides/DOCKER_CACHE_TEST_PLAN.md)** - Docker cache testing
- **[CREATE_CACHED_JOB.md](guides/CREATE_CACHED_JOB.md)** - Create cached Jenkins job
- **[NGINX_DOCKER_JOB_SETUP.md](guides/NGINX_DOCKER_JOB_SETUP.md)** - nginx Docker job setup
- **[VERIFY_AGENT_CONFIG.md](guides/VERIFY_AGENT_CONFIG.md)** - Verify Jenkins agent configuration

## Navigation Tips

### By Role

**DevOps Engineer / Infrastructure**:
1. Start with [DEPLOYMENT_GUIDE.md](deployment/DEPLOYMENT_GUIDE.md)
2. Set up [WEBHOOK_QUICK_START.md](guides/WEBHOOK_QUICK_START.md)
3. Review [INFRASTRUCTURE_VALIDATION.md](deployment/INFRASTRUCTURE_VALIDATION.md)
4. Check [RECOVERY_PROCEDURES.md](guides/RECOVERY_PROCEDURES.md)

**Application Developer**:
1. Start with [QUICK_START.md](guides/QUICK_START.md)
2. Learn [AUTOMATED_OPENAPI_WORKFLOW.md](guides/AUTOMATED_OPENAPI_WORKFLOW.md)
3. Reference [CODE_GENERATION_FROM_OPENAPI.md](guides/CODE_GENERATION_FROM_OPENAPI.md)

**Security / Compliance**:
1. Review [COGNITO_AUTHENTICATION_GUIDE.md](guides/COGNITO_AUTHENTICATION_GUIDE.md)
2. Check [API_CONTRACT_MANAGEMENT.md](guides/API_CONTRACT_MANAGEMENT.md)
3. Verify [AUTHENTICATION_COMPLETE.md](deployment/AUTHENTICATION_COMPLETE.md)

**Operations / SRE**:
1. Reference [QUICK_REFERENCE.md](guides/QUICK_REFERENCE.md)
2. Review [RECOVERY_PROCEDURES.md](guides/RECOVERY_PROCEDURES.md)
3. Check [JENKINS_JOBS_AS_CODE.md](guides/JENKINS_JOBS_AS_CODE.md)

### By Task

**Deploying Infrastructure**:
- [DEPLOYMENT_GUIDE.md](deployment/DEPLOYMENT_GUIDE.md)
- [DEPLOYMENT_PROCEDURES.md](deployment/DEPLOYMENT_PROCEDURES.md)
- [DEPLOYMENT_CHECKLIST.md](deployment/DEPLOYMENT_CHECKLIST.md)

**Adding New API Endpoints**:
- [AUTOMATED_OPENAPI_WORKFLOW.md](guides/AUTOMATED_OPENAPI_WORKFLOW.md)
- [CODE_GENERATION_FROM_OPENAPI.md](guides/CODE_GENERATION_FROM_OPENAPI.md)
- [API_CONTRACT_MANAGEMENT.md](guides/API_CONTRACT_MANAGEMENT.md)

**Setting Up Authentication**:
- [COGNITO_AUTHENTICATION_GUIDE.md](guides/COGNITO_AUTHENTICATION_GUIDE.md)
- [AUTHENTICATION_COMPLETE.md](deployment/AUTHENTICATION_COMPLETE.md)

**Troubleshooting**:
- [RECOVERY_PROCEDURES.md](guides/RECOVERY_PROCEDURES.md)
- [JENKINS_TO_APP_CLUSTER_CONNECTIVITY.md](guides/JENKINS_TO_APP_CLUSTER_CONNECTIVITY.md)
- [VERIFY_AGENT_CONFIG.md](guides/VERIFY_AGENT_CONFIG.md)

## Project History

For a complete chronological history of the project implementation, see:
- **[PROJECT_HISTORY.md](../.kiro/task-summaries/PROJECT_HISTORY.md)**

This document consolidates all implementation phases, tasks completed, and key achievements.

## Contributing

When adding new documentation:
1. Place deployment-related docs in `deployment/`
2. Place how-to guides in `guides/`
3. Update this index file
4. Update the main [README.md](../README.md) if needed

## Support

For questions or issues:
1. Check the relevant guide in this documentation
2. Review [PROJECT_HISTORY.md](../.kiro/task-summaries/PROJECT_HISTORY.md) for context
3. Check CloudWatch Logs for runtime issues
4. Review component-specific READMEs in `k8s/` directories
