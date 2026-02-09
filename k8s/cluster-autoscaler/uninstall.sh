#!/bin/bash

# Uninstall Cluster Autoscaler from EKS cluster

set -e

echo "=========================================="
echo "Uninstalling Cluster Autoscaler"
echo "=========================================="

# Delete Cluster Autoscaler resources
echo "Deleting Cluster Autoscaler deployment..."
kubectl delete deployment cluster-autoscaler -n kube-system --ignore-not-found=true

echo "Deleting RBAC resources..."
kubectl delete clusterrolebinding cluster-autoscaler --ignore-not-found=true
kubectl delete clusterrole cluster-autoscaler --ignore-not-found=true
kubectl delete rolebinding cluster-autoscaler -n kube-system --ignore-not-found=true
kubectl delete role cluster-autoscaler -n kube-system --ignore-not-found=true

echo "Deleting service account..."
kubectl delete serviceaccount cluster-autoscaler -n kube-system --ignore-not-found=true

echo ""
echo "=========================================="
echo "Cluster Autoscaler uninstalled successfully!"
echo "=========================================="
