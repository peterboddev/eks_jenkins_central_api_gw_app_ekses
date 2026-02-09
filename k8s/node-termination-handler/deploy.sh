#!/bin/bash

# Deploy AWS Node Termination Handler to EKS cluster
# Requirements: 4.4, 7.2, 7.7

set -e

echo "=========================================="
echo "Deploying AWS Node Termination Handler"
echo "=========================================="

# Apply manifests
echo "Applying Node Termination Handler manifests..."
kubectl apply -f serviceaccount.yaml
kubectl apply -f rbac.yaml
kubectl apply -f daemonset.yaml

echo ""
echo "Waiting for Node Termination Handler DaemonSet to be ready..."
kubectl rollout status daemonset/aws-node-termination-handler -n kube-system --timeout=300s

echo ""
echo "=========================================="
echo "Node Termination Handler deployed successfully!"
echo "=========================================="
echo ""
echo "Verify deployment:"
echo "  kubectl get daemonset aws-node-termination-handler -n kube-system"
echo "  kubectl get pods -n kube-system -l app=aws-node-termination-handler"
echo "  kubectl logs -n kube-system -l app=aws-node-termination-handler --tail=50"
echo ""
echo "The Node Termination Handler will:"
echo "  - Monitor spot instance interruption notices"
echo "  - Cordon and drain nodes before termination"
echo "  - Respect pod termination grace period (120 seconds)"
echo "  - Respect node termination grace period (120 seconds)"
