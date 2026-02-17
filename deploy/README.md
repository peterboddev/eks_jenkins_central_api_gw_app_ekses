# Application Helm Charts

This directory contains Helm charts and values files for business applications deployed on the EKS clusters.

## Purpose

Application charts define the deployments, services, and configurations for:
- Jenkins CI/CD server
- nginx-api REST API application
- Future applications

## Structure

Each subdirectory contains either:
- A complete Helm chart (Chart.yaml, values.yaml, templates/)
- Or values.yaml files for official Helm charts

Examples:
- `jenkins/values.yaml` - Custom values for the official jenkins/jenkins chart
- `nginx-api/` - Complete custom Helm chart for nginx-api application

## Deployment

Application charts are deployed via ArgoCD Applications defined in `argocd-apps/`.

## Configuration Management

- Default values in `values.yaml`
- Environment-specific overrides via ArgoCD Application manifests
- Secrets referenced from Kubernetes secrets (created by CDK)
- No sensitive data committed to Git

## Development Workflow

1. Update chart or values file
2. Test locally: `helm template <chart-path>`
3. Commit and push to Git
4. ArgoCD automatically syncs changes to cluster
5. Verify in ArgoCD UI

## CDK vs ArgoCD Responsibilities

- **CDK manages**: AWS infrastructure, IAM roles, service accounts, persistent volumes, secrets
- **ArgoCD manages**: Application deployments, scaling, configuration updates
