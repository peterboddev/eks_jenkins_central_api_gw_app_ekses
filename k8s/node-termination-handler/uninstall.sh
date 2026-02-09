#!/bin/bash

# Uninstall AWS Node Termination Handler from EKS cluster

set -e

echo "=========================================="
echo "Uninstalling AWS Node Termination Handler"
echo "=========================================="

# Delete Node Termination Handler resources
echo "Deleting Node Termination Handler DaemonSet..."
kubectl delete daemonset aws-node-termination-handler -n kube-system --ignore-not-found=true

echo "Deleting RBAC resources..."
kubectl delete clusterrolebinding aws-node-termination-handler --ignore-not-found=true
kubectl delete clusterrole aws-node-termination-handler --ignore-not-found=true

echo "Deleting service account..."
kubectl delete serviceaccount aws-node-termination-handler -n kube-system --ignore-not-found=true

echo ""
echo "=========================================="
echo "Node Termination Handler uninstalled successfully!"
echo "=========================================="
