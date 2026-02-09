#!/bin/bash
# Deployment script for EFS CSI Driver
# This script automates the deployment of the EFS CSI Driver to the Jenkins EKS cluster
#
# Requirements: 6.8 - EKS cluster has EFS CSI Driver installed for dynamic volume provisioning

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="JenkinsEksStack"
CLUSTER_NAME="jenkins-eks-cluster"
REGION="us-west-2"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EFS CSI Driver Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed${NC}"
    exit 1
fi

# Check if aws CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Get EKS cluster credentials
echo -e "${YELLOW}Configuring kubectl for EKS cluster...${NC}"
aws eks update-kubeconfig --name ${CLUSTER_NAME} --region ${REGION}
echo -e "${GREEN}✓ kubectl configured${NC}"
echo ""

# Get EFS CSI Driver IAM Role ARN from CloudFormation stack outputs
echo -e "${YELLOW}Getting EFS CSI Driver IAM Role ARN from CloudFormation...${NC}"
EFS_CSI_ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query "Stacks[0].Outputs[?OutputKey=='EfsCsiDriverRoleArnOutput'].OutputValue" \
  --output text)

if [ -z "$EFS_CSI_ROLE_ARN" ]; then
    echo -e "${RED}Error: Could not retrieve EFS CSI Driver IAM Role ARN${NC}"
    echo -e "${RED}Make sure the CloudFormation stack '${STACK_NAME}' exists and has the output 'EfsCsiDriverRoleArnOutput'${NC}"
    exit 1
fi

echo -e "${GREEN}✓ EFS CSI Driver IAM Role ARN: ${EFS_CSI_ROLE_ARN}${NC}"
echo ""

# Update service account with IAM role ARN
echo -e "${YELLOW}Updating service account with IAM role ARN...${NC}"
sed -i.bak "s|REPLACE_WITH_EFS_CSI_DRIVER_ROLE_ARN|${EFS_CSI_ROLE_ARN}|g" serviceaccount.yaml
echo -e "${GREEN}✓ Service account updated${NC}"
echo ""

# Deploy EFS CSI Driver components
echo -e "${YELLOW}Deploying EFS CSI Driver components...${NC}"

echo "  - Applying namespace..."
kubectl apply -f namespace.yaml

echo "  - Applying service accounts..."
kubectl apply -f serviceaccount.yaml

echo "  - Applying RBAC resources..."
kubectl apply -f rbac.yaml

echo "  - Applying CSI driver..."
kubectl apply -f csi-driver.yaml

echo "  - Applying controller deployment..."
kubectl apply -f controller-deployment.yaml

echo "  - Applying node DaemonSet..."
kubectl apply -f node-daemonset.yaml

echo -e "${GREEN}✓ All components deployed${NC}"
echo ""

# Wait for controller deployment to be ready
echo -e "${YELLOW}Waiting for controller deployment to be ready...${NC}"
kubectl wait --for=condition=available --timeout=300s deployment/efs-csi-controller -n kube-system
echo -e "${GREEN}✓ Controller deployment is ready${NC}"
echo ""

# Wait for node DaemonSet to be ready
echo -e "${YELLOW}Waiting for node DaemonSet to be ready...${NC}"
kubectl rollout status daemonset/efs-csi-node -n kube-system --timeout=300s
echo -e "${GREEN}✓ Node DaemonSet is ready${NC}"
echo ""

# Get EFS File System ID from CloudFormation stack outputs
echo -e "${YELLOW}Getting EFS File System ID from CloudFormation...${NC}"
EFS_FILE_SYSTEM_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query "Stacks[0].Outputs[?OutputKey=='EfsFileSystemIdOutput'].OutputValue" \
  --output text)

if [ -z "$EFS_FILE_SYSTEM_ID" ]; then
    echo -e "${RED}Error: Could not retrieve EFS File System ID${NC}"
    echo -e "${RED}Make sure the CloudFormation stack '${STACK_NAME}' exists and has the output 'EfsFileSystemIdOutput'${NC}"
    exit 1
fi

echo -e "${GREEN}✓ EFS File System ID: ${EFS_FILE_SYSTEM_ID}${NC}"
echo ""

# Update storage class with EFS file system ID
echo -e "${YELLOW}Updating storage class with EFS file system ID...${NC}"
sed -i.bak "s|\${EFS_FILE_SYSTEM_ID}|${EFS_FILE_SYSTEM_ID}|g" storageclass.yaml
echo -e "${GREEN}✓ Storage class updated${NC}"
echo ""

# Deploy storage class
echo -e "${YELLOW}Deploying EFS storage class...${NC}"
kubectl apply -f storageclass.yaml
echo -e "${GREEN}✓ Storage class deployed${NC}"
echo ""

# Verify deployment
echo -e "${YELLOW}Verifying deployment...${NC}"

# Check controller pods
CONTROLLER_PODS=$(kubectl get pods -n kube-system -l app=efs-csi-controller --no-headers | wc -l)
CONTROLLER_READY=$(kubectl get pods -n kube-system -l app=efs-csi-controller --no-headers | grep "Running" | wc -l)
echo "  - Controller pods: ${CONTROLLER_READY}/${CONTROLLER_PODS} running"

# Check node pods
NODE_PODS=$(kubectl get pods -n kube-system -l app=efs-csi-node --no-headers | wc -l)
NODE_READY=$(kubectl get pods -n kube-system -l app=efs-csi-node --no-headers | grep "Running" | wc -l)
echo "  - Node pods: ${NODE_READY}/${NODE_PODS} running"

# Check CSI driver registration
CSI_DRIVER=$(kubectl get csidriver efs.csi.aws.com --no-headers 2>/dev/null | wc -l)
if [ "$CSI_DRIVER" -eq 1 ]; then
    echo "  - CSI driver registered: Yes"
else
    echo "  - CSI driver registered: No"
fi

# Check storage class
STORAGE_CLASS=$(kubectl get storageclass efs-sc --no-headers 2>/dev/null | wc -l)
if [ "$STORAGE_CLASS" -eq 1 ]; then
    echo "  - Storage class created: Yes"
else
    echo "  - Storage class created: No"
fi

echo ""

# Restore backup of serviceaccount.yaml and storageclass.yaml
if [ -f serviceaccount.yaml.bak ]; then
    mv serviceaccount.yaml.bak serviceaccount.yaml
    echo -e "${YELLOW}Note: serviceaccount.yaml restored to original state${NC}"
fi

if [ -f storageclass.yaml.bak ]; then
    mv storageclass.yaml.bak storageclass.yaml
    echo -e "${YELLOW}Note: storageclass.yaml restored to original state${NC}"
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EFS CSI Driver deployment completed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Deployment summary:"
echo "  - EFS CSI Driver: Installed"
echo "  - Storage Class: efs-sc (created)"
echo "  - EFS File System ID: ${EFS_FILE_SYSTEM_ID}"
echo ""
echo "Next steps:"
echo "  1. Deploy Jenkins controller with EFS persistent volume (Task 9)"
echo "  2. Test the storage class by creating a PVC"
echo ""
echo "To view EFS CSI Driver pods:"
echo "  kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-efs-csi-driver"
echo ""
echo "To view storage class:"
echo "  kubectl get storageclass efs-sc"
echo "  kubectl describe storageclass efs-sc"
echo ""
echo "To view EFS CSI Driver logs:"
echo "  kubectl logs -n kube-system deployment/efs-csi-controller -c efs-plugin"
echo "  kubectl logs -n kube-system daemonset/efs-csi-node -c efs-plugin"
