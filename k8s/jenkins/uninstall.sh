#!/bin/bash

# Jenkins Controller Uninstall Script
# This script removes the Jenkins controller from the EKS cluster
#
# WARNING: This will delete all Jenkins data including:
# - Job configurations
# - Build history
# - Plugin data
# - User configurations
#
# The EFS volume will be retained and can be reattached if needed.

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

# Confirm deletion
print_warning "This will delete the Jenkins controller and all associated resources."
print_warning "The EFS volume will be retained but the PVC will be deleted."
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    print_info "Uninstall cancelled."
    exit 0
fi

# Delete Jenkins resources in reverse order
print_info "Deleting Jenkins controller resources..."

kubectl delete -f statefulset.yaml --ignore-not-found=true
kubectl delete -f service.yaml --ignore-not-found=true
kubectl delete -f pvc.yaml --ignore-not-found=true
kubectl delete -f serviceaccount.yaml --ignore-not-found=true

# Wait for pods to be deleted
print_info "Waiting for pods to be terminated..."
kubectl wait --for=delete pod -n jenkins -l app=jenkins-controller --timeout=120s 2>/dev/null || true

# Optionally delete the namespace
echo ""
read -p "Do you want to delete the jenkins namespace? (yes/no): " DELETE_NS

if [ "$DELETE_NS" == "yes" ]; then
    kubectl delete -f namespace.yaml --ignore-not-found=true
    print_info "Namespace deleted."
else
    print_info "Namespace retained."
fi

print_info "Jenkins controller uninstalled successfully!"
