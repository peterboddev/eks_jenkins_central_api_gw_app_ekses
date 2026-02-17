# Platform Helm Charts

This directory contains Helm charts for platform-level services that run on the EKS clusters.

## Purpose

Platform charts manage infrastructure-level services that support applications:
- AWS Load Balancer Controller (manages ALBs for Ingress resources)
- Monitoring and observability tools
- Security and policy enforcement
- Cluster add-ons and operators

## Structure

Each subdirectory contains a Helm chart or chart wrapper:
- `aws-load-balancer-controller/` - ALB Controller for both Jenkins and nginx-api clusters

## Deployment

Platform charts are deployed via ArgoCD Applications defined in `argocd-apps/`.

## CDK vs ArgoCD Responsibilities

- **CDK manages**: IAM roles, service accounts (IRSA), security groups
- **ArgoCD manages**: Kubernetes deployments, configurations, updates

Platform charts reference CDK-created resources (service accounts, security groups) but don't create them.
