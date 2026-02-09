#!/bin/bash

# Jenkins Controller Deployment Script
# This script deploys the Jenkins controller to the EKS cluster
# 
# Prerequisites:
# - kubectl configured to access the EKS cluster
# - EFS CSI Driver installed and storage class 'efs-sc' available
# - EKS cluster with controller node group (on-demand instances)
# - IAM role for Jenkins controller created via CDK stack
#
# Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.9, 5.3, 5.4, 6.1, 6.9

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_info "Checking prerequisites..."

if ! command_exists kubectl; then
    print_error "kubectl is not installed. Please install kubectl first."
    exit 1
fi

if ! command_exists aws; then
    print_error "AWS CLI is not installed. Please install AWS CLI first."
    exit 1
fi

# Check if kubectl can access the cluster
if ! kubectl cluster-info >/dev/null 2>&1; then
    print_error "Cannot access Kubernetes cluster. Please configure kubectl first."
    exit 1
fi

print_info "Prerequisites check passed."

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region)

if [ -z "$AWS_ACCOUNT_ID" ]; then
    print_error "Failed to get AWS account ID. Please configure AWS CLI."
    exit 1
fi

if [ -z "$AWS_REGION" ]; then
    print_warning "AWS region not configured. Using default: us-west-2"
    AWS_REGION="us-west-2"
fi

print_info "AWS Account ID: $AWS_ACCOUNT_ID"
print_info "AWS Region: $AWS_REGION"

# Get Jenkins controller IAM role ARN from CloudFormation stack
print_info "Retrieving Jenkins controller IAM role ARN from CloudFormation..."

STACK_NAME="JenkinsEksStack"
ROLE_ARN=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?ExportName=='JenkinsEksControllerRoleArn'].OutputValue" \
    --output text \
    --region "$AWS_REGION" 2>/dev/null)

if [ -z "$ROLE_ARN" ] || [ "$ROLE_ARN" == "None" ]; then
    print_warning "Could not retrieve IAM role ARN from CloudFormation stack."
    print_warning "Using default role ARN pattern. Please verify this is correct."
    ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/jenkins-eks-controller-role"
fi

print_info "Jenkins Controller IAM Role ARN: $ROLE_ARN"

# Update serviceaccount.yaml with the actual IAM role ARN
print_info "Updating serviceaccount.yaml with IAM role ARN..."
sed -i.bak "s|arn:aws:iam::ACCOUNT_ID:role/jenkins-eks-controller-role|${ROLE_ARN}|g" serviceaccount.yaml
rm -f serviceaccount.yaml.bak

# Check if EFS CSI Driver storage class exists
print_info "Checking if EFS CSI Driver storage class 'efs-sc' exists..."
if ! kubectl get storageclass efs-sc >/dev/null 2>&1; then
    print_error "Storage class 'efs-sc' not found. Please install EFS CSI Driver first."
    print_info "Run: cd ../efs-csi-driver && ./deploy.sh"
    exit 1
fi

print_info "Storage class 'efs-sc' found."

# Check if controller node group exists
print_info "Checking if controller node group exists..."
CONTROLLER_NODES=$(kubectl get nodes -l workload-type=jenkins-controller --no-headers 2>/dev/null | wc -l)

if [ "$CONTROLLER_NODES" -eq 0 ]; then
    print_warning "No nodes with label 'workload-type=jenkins-controller' found."
    print_warning "Jenkins controller pod may not be scheduled until controller nodes are available."
    print_warning "Please ensure the controller node group is created via CDK stack."
fi

# Fix CoreDNS toleration to allow scheduling on controller node
print_info "Fixing CoreDNS toleration for controller node taint..."
kubectl patch deployment coredns -n kube-system --type=json -p='[{"op": "add", "path": "/spec/template/spec/tolerations/-", "value": {"key": "workload-type", "operator": "Equal", "value": "jenkins-controller", "effect": "NoSchedule"}}]' 2>/dev/null || print_info "CoreDNS toleration already configured"

# Deploy Jenkins controller using kubectl
print_info "Deploying Jenkins controller..."

# Apply manifests in order
kubectl apply -f namespace.yaml
kubectl apply -f serviceaccount.yaml
kubectl apply -f rbac.yaml
kubectl apply -f agent-pod-template-configmap.yaml
kubectl apply -f jobs-configmap.yaml
kubectl apply -f pvc.yaml
kubectl apply -f service.yaml
kubectl apply -f statefulset.yaml

print_info "Jenkins controller manifests applied successfully."
print_info "Jobs configuration will be automatically loaded by Jenkins Configuration as Code (JCasC)."

# Wait for Jenkins controller pod to be ready
print_info "Waiting for Jenkins controller pod to be ready (this may take a few minutes)..."

# Wait up to 10 minutes for the pod to be ready
TIMEOUT=600
ELAPSED=0
INTERVAL=10

while [ $ELAPSED -lt $TIMEOUT ]; do
    POD_STATUS=$(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "")
    
    if [ "$POD_STATUS" == "Running" ]; then
        # Check if pod is ready
        POD_READY=$(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "")
        
        if [ "$POD_READY" == "True" ]; then
            print_info "Jenkins controller pod is ready!"
            break
        fi
    fi
    
    if [ "$POD_STATUS" == "Failed" ] || [ "$POD_STATUS" == "CrashLoopBackOff" ]; then
        print_error "Jenkins controller pod failed to start. Status: $POD_STATUS"
        print_info "Check pod logs with: kubectl logs -n jenkins -l app=jenkins-controller"
        exit 1
    fi
    
    echo -n "."
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""

if [ $ELAPSED -ge $TIMEOUT ]; then
    print_warning "Timeout waiting for Jenkins controller pod to be ready."
    print_info "Check pod status with: kubectl get pods -n jenkins"
    print_info "Check pod logs with: kubectl logs -n jenkins -l app=jenkins-controller"
else
    print_info "Jenkins controller deployed successfully!"
fi

# Display deployment information
print_info "Deployment Information:"
echo ""
kubectl get all -n jenkins
echo ""

# Display instructions for accessing Jenkins
print_info "To access Jenkins UI, use kubectl port-forward:"
echo ""
echo "  kubectl port-forward -n jenkins svc/jenkins 8080:8080"
echo ""
print_info "Then open your browser to: http://localhost:8080"
echo ""

# Display instructions for getting initial admin password
print_info "To get the initial admin password, run:"
echo ""
echo "  kubectl exec -n jenkins -it \$(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}') -- cat /var/jenkins_home/secrets/initialAdminPassword"
echo ""

print_info "Deployment complete!"
