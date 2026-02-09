#!/bin/bash

# Deploy Cluster Autoscaler to EKS cluster
# Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6

set -e

echo "=========================================="
echo "Deploying Cluster Autoscaler"
echo "=========================================="

# Check if required environment variables are set
if [ -z "$CLUSTER_NAME" ]; then
  echo "Error: CLUSTER_NAME environment variable is not set"
  echo "Usage: CLUSTER_NAME=<cluster-name> CLUSTER_AUTOSCALER_ROLE_ARN=<role-arn> ./deploy.sh"
  exit 1
fi

if [ -z "$CLUSTER_AUTOSCALER_ROLE_ARN" ]; then
  echo "Error: CLUSTER_AUTOSCALER_ROLE_ARN environment variable is not set"
  echo "Usage: CLUSTER_NAME=<cluster-name> CLUSTER_AUTOSCALER_ROLE_ARN=<role-arn> ./deploy.sh"
  exit 1
fi

echo "Cluster Name: $CLUSTER_NAME"
echo "Cluster Autoscaler Role ARN: $CLUSTER_AUTOSCALER_ROLE_ARN"
echo ""

# Create temporary directory for processed manifests
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy manifests to temp directory
cp *.yaml "$TEMP_DIR/"

# Replace placeholders in manifests
echo "Replacing placeholders in manifests..."
sed -i "s|CLUSTER_NAME_PLACEHOLDER|$CLUSTER_NAME|g" "$TEMP_DIR/deployment.yaml"
sed -i "s|CLUSTER_AUTOSCALER_ROLE_ARN_PLACEHOLDER|$CLUSTER_AUTOSCALER_ROLE_ARN|g" "$TEMP_DIR/serviceaccount.yaml"

# Apply manifests
echo "Applying Cluster Autoscaler manifests..."
kubectl apply -f "$TEMP_DIR/serviceaccount.yaml"
kubectl apply -f "$TEMP_DIR/rbac.yaml"
kubectl apply -f "$TEMP_DIR/deployment.yaml"

echo ""
echo "Waiting for Cluster Autoscaler deployment to be ready..."
kubectl rollout status deployment/cluster-autoscaler -n kube-system --timeout=300s

echo ""
echo "=========================================="
echo "Cluster Autoscaler deployed successfully!"
echo "=========================================="
echo ""
echo "Verify deployment:"
echo "  kubectl get deployment cluster-autoscaler -n kube-system"
echo "  kubectl get pods -n kube-system -l app=cluster-autoscaler"
echo "  kubectl logs -n kube-system -l app=cluster-autoscaler --tail=50"
echo ""
echo "Check autoscaler status:"
echo "  kubectl logs -n kube-system -l app=cluster-autoscaler | grep -i 'scale'"
