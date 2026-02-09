#!/bin/bash
# Uninstall script for EFS CSI Driver
# This script removes the EFS CSI Driver from the Jenkins EKS cluster

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}EFS CSI Driver Uninstall Script${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

echo -e "${YELLOW}WARNING: This will remove the EFS CSI Driver from the cluster.${NC}"
echo -e "${YELLOW}Any persistent volumes using the EFS CSI Driver will become unavailable.${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${RED}Uninstall cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Uninstalling EFS CSI Driver components...${NC}"

# Delete in reverse order
echo "  - Deleting node DaemonSet..."
kubectl delete -f node-daemonset.yaml --ignore-not-found=true

echo "  - Deleting controller deployment..."
kubectl delete -f controller-deployment.yaml --ignore-not-found=true

echo "  - Deleting CSI driver..."
kubectl delete -f csi-driver.yaml --ignore-not-found=true

echo "  - Deleting RBAC resources..."
kubectl delete -f rbac.yaml --ignore-not-found=true

echo "  - Deleting service accounts..."
kubectl delete -f serviceaccount.yaml --ignore-not-found=true

echo -e "${GREEN}✓ All components removed${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EFS CSI Driver uninstall completed!${NC}"
echo -e "${GREEN}========================================${NC}"
