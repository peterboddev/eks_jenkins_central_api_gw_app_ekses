# ArgoCD Application Manifests

This directory contains ArgoCD Application custom resources that define what to deploy and from where.

## Purpose

ArgoCD Applications are the bridge between Git repositories and Kubernetes clusters. Each Application manifest tells ArgoCD:
- Where to find the Helm chart or manifests (source)
- Which cluster and namespace to deploy to (destination)
- How to sync (automated vs manual, prune, self-heal)

## Structure

Application manifests are organized by cluster:
- `jenkins-*.yaml` - Applications for Jenkins EKS cluster
- `nginx-*.yaml` - Applications for nginx-api EKS cluster

## Application Types

**Platform Applications:**
- `jenkins-alb-controller.yaml` - AWS Load Balancer Controller for Jenkins cluster
- `nginx-alb-controller.yaml` - AWS Load Balancer Controller for nginx-api cluster

**Business Applications:**
- `jenkins-app.yaml` - Jenkins CI/CD server
- `nginx-api-app.yaml` - nginx REST API application

## Deployment

Apply Application manifests to the cluster where ArgoCD is running:

```powershell
# Jenkins cluster
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2
kubectl apply -f argocd-apps/jenkins-alb-controller.yaml
kubectl apply -f argocd-apps/jenkins-app.yaml

# Nginx-API cluster
aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2
kubectl apply -f argocd-apps/nginx-alb-controller.yaml
kubectl apply -f argocd-apps/nginx-api-app.yaml
```

## Sync Policies

All applications use automated sync with:
- `prune: true` - Delete resources not in Git
- `selfHeal: true` - Revert manual cluster changes

This ensures Git is the single source of truth.

## Monitoring

View application status in ArgoCD UI or via CLI:

```powershell
kubectl get applications -n argocd
kubectl describe application <app-name> -n argocd
```

## Troubleshooting

If an application shows OutOfSync or Degraded:
1. Check ArgoCD UI for error details
2. View application events: `kubectl describe application <app-name> -n argocd`
3. Check application logs in target namespace
4. Verify Helm chart renders correctly: `helm template <chart-path>`
5. Fix issues in Git and push - ArgoCD will auto-sync
