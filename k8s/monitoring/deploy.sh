#!/bin/bash

# Deploy CloudWatch Container Insights to EKS cluster
# Requirements: 10.1, 10.3

set -e

echo "=========================================="
echo "Deploying CloudWatch Container Insights"
echo "=========================================="

# Check if required environment variables are set
if [ -z "$CLUSTER_NAME" ]; then
  echo "Error: CLUSTER_NAME environment variable is not set"
  echo "Usage: CLUSTER_NAME=<cluster-name> AWS_REGION=<region> ./deploy.sh"
  exit 1
fi

if [ -z "$AWS_REGION" ]; then
  echo "Error: AWS_REGION environment variable is not set"
  echo "Usage: CLUSTER_NAME=<cluster-name> AWS_REGION=<region> ./deploy.sh"
  exit 1
fi

echo "Cluster Name: $CLUSTER_NAME"
echo "AWS Region: $AWS_REGION"
echo ""

# Create namespace
echo "Creating amazon-cloudwatch namespace..."
kubectl apply -f namespace.yaml

# Deploy CloudWatch agent using AWS quick start
echo "Deploying CloudWatch agent..."
kubectl apply -f https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/cloudwatch-namespace.yaml

kubectl apply -f https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/cwagent/cwagent-serviceaccount.yaml

# Create temporary directory for processed manifests
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy and process CloudWatch agent ConfigMap
cp cloudwatch-agent-configmap.yaml "$TEMP_DIR/"
sed -i "s|CLUSTER_NAME_PLACEHOLDER|$CLUSTER_NAME|g" "$TEMP_DIR/cloudwatch-agent-configmap.yaml"
kubectl apply -f "$TEMP_DIR/cloudwatch-agent-configmap.yaml"

kubectl apply -f https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/cwagent/cwagent-daemonset.yaml

# Deploy Fluent Bit for log collection
echo "Deploying Fluent Bit..."
kubectl apply -f https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/fluent-bit/fluent-bit-serviceaccount.yaml

# Copy and process Fluent Bit ConfigMap
cp fluent-bit-configmap.yaml "$TEMP_DIR/"
kubectl create configmap fluent-bit-cluster-info \
  --from-literal=cluster.name=$CLUSTER_NAME \
  --from-literal=http.server=On \
  --from-literal=http.port=2020 \
  --from-literal=read.head=Off \
  --from-literal=read.tail=On \
  --from-literal=logs.region=$AWS_REGION \
  -n amazon-cloudwatch \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f "$TEMP_DIR/fluent-bit-configmap.yaml"

kubectl apply -f https://raw.githubusercontent.com/aws-samples/amazon-cloudwatch-container-insights/latest/k8s-deployment-manifest-templates/deployment-mode/daemonset/container-insights-monitoring/fluent-bit/fluent-bit-daemonset.yaml

echo ""
echo "Waiting for CloudWatch agent to be ready..."
kubectl rollout status daemonset/cloudwatch-agent -n amazon-cloudwatch --timeout=300s

echo ""
echo "Waiting for Fluent Bit to be ready..."
kubectl rollout status daemonset/fluent-bit -n amazon-cloudwatch --timeout=300s

echo ""
echo "=========================================="
echo "CloudWatch Container Insights deployed successfully!"
echo "=========================================="
echo ""
echo "Verify deployment:"
echo "  kubectl get daemonset -n amazon-cloudwatch"
echo "  kubectl get pods -n amazon-cloudwatch"
echo "  kubectl logs -n amazon-cloudwatch -l name=cloudwatch-agent --tail=50"
echo "  kubectl logs -n amazon-cloudwatch -l k8s-app=fluent-bit --tail=50"
echo ""
echo "View metrics in CloudWatch Console:"
echo "  https://console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#container-insights:infrastructure"
echo ""
echo "View logs in CloudWatch Logs:"
echo "  Log Groups:"
echo "    - /aws/containerinsights/$CLUSTER_NAME/application"
echo "    - /aws/containerinsights/$CLUSTER_NAME/dataplane"
echo "    - /aws/containerinsights/$CLUSTER_NAME/host"
