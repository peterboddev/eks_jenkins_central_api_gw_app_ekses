#!/usr/bin/env bash
# Infrastructure Deployment Bootstrap Script
# This script deploys all infrastructure stacks in the correct order

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Infrastructure Deployment Bootstrap${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for stack completion
wait_stack_completion() {
    local stack_name=$1
    local timeout_seconds=${2:-600}
    
    echo -e "${YELLOW}Waiting for stack $stack_name to complete...${NC}"
    local elapsed=0
    local interval=10
    
    while [ $elapsed -lt $timeout_seconds ]; do
        local status=$(aws cloudformation describe-stacks --stack-name "$stack_name" --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "NOT_FOUND")
        
        if [[ "$status" == *"COMPLETE" ]]; then
            echo -e "${GREEN}✓ Stack $stack_name completed successfully${NC}"
            return 0
        elif [[ "$status" == *"FAILED"* ]] || [[ "$status" == *"ROLLBACK"* ]]; then
            echo -e "${RED}✗ Stack $stack_name failed: $status${NC}"
            return 1
        fi
        
        sleep $interval
        elapsed=$((elapsed + interval))
        echo -e "${GRAY}  Status: $status (${elapsed}s elapsed)${NC}"
    done
    
    echo -e "${RED}✗ Timeout waiting for stack $stack_name${NC}"
    return 1
}

# Step 1: Verify prerequisites
echo -e "${CYAN}Step 1: Verifying prerequisites...${NC}"

if ! command_exists node; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js is installed${NC}"

if ! command_exists npm; then
    echo -e "${RED}✗ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm is installed${NC}"

if ! command_exists cdk; then
    echo -e "${RED}✗ AWS CDK is not installed${NC}"
    echo -e "${YELLOW}  Install with: npm install -g aws-cdk${NC}"
    exit 1
fi
echo -e "${GREEN}✓ AWS CDK is installed${NC}"

if ! command_exists aws; then
    echo -e "${RED}✗ AWS CLI is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ AWS CLI is installed${NC}"

# Check AWS credentials
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo -e "${RED}✗ AWS credentials not configured${NC}"
    echo -e "${YELLOW}  Configure with: aws configure${NC}"
    exit 1
fi
echo -e "${GREEN}✓ AWS credentials configured${NC}"

account=$(aws sts get-caller-identity --query Account --output text)
region=$(aws configure get region)
if [ -z "$region" ]; then
    region="us-west-2"
fi

echo ""
echo -e "${CYAN}Deployment Configuration:${NC}"
echo -e "${WHITE}  Account: $account${NC}"
echo -e "${WHITE}  Region:  $region${NC}"
echo ""

# Step 2: Install dependencies
echo -e "${CYAN}Step 2: Installing dependencies...${NC}"
if ! npm install; then
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 3: Build TypeScript
echo -e "${CYAN}Step 3: Building TypeScript...${NC}"
if ! npm run build; then
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build successful${NC}"
echo ""

# Step 4: Verify CDK bootstrap
echo -e "${CYAN}Step 4: Verifying CDK bootstrap...${NC}"
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region "$region" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ CDK not bootstrapped in this account/region${NC}"
    echo -e "${YELLOW}  Bootstrapping now...${NC}"
    if ! cdk bootstrap "aws://$account/$region"; then
        echo -e "${RED}✗ Bootstrap failed${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✓ CDK bootstrap verified${NC}"
echo ""

# Step 5: Deploy network stacks
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Step 5: Deploying Network Infrastructure${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${YELLOW}Deploying VPC network stacks...${NC}"
if ! cdk deploy JenkinsNetworkStack NginxApiNetworkStack --require-approval never; then
    echo -e "${RED}✗ Network stack deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ VPC network stacks deployed${NC}"
echo ""

# Step 6: Deploy Transit Gateway
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Step 6: Deploying Transit Gateway${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${YELLOW}Deploying Transit Gateway stack...${NC}"
if ! cdk deploy TransitGatewayStack --require-approval never; then
    echo -e "${RED}✗ Transit Gateway deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Transit Gateway stack deployed${NC}"
echo ""

# Step 7: Deploy Jenkins Storage Stack
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Step 7: Deploying Jenkins Storage${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${YELLOW}Deploying Jenkins Storage stack (EFS + Backups)...${NC}"
if ! cdk deploy JenkinsStorageStack --require-approval never; then
    echo -e "${RED}✗ Jenkins Storage deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Jenkins Storage stack deployed${NC}"
echo ""

# Step 8: Deploy Jenkins EKS Cluster Stack
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Step 8: Deploying Jenkins EKS Cluster${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${YELLOW}Deploying Jenkins EKS Cluster stack (foundational cluster only)...${NC}"
echo -e "${GRAY}  This creates the EKS cluster with Kubernetes 1.32${NC}"
echo -e "${GRAY}  Estimated time: 15-20 minutes${NC}"
if ! cdk deploy JenkinsEksClusterStack --require-approval never; then
    echo -e "${RED}✗ Jenkins EKS Cluster deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Jenkins EKS Cluster stack deployed${NC}"
echo ""

# Step 9: Deploy Jenkins EKS Node Groups Stack
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Step 9: Deploying Jenkins EKS Node Groups${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${YELLOW}Deploying Jenkins EKS Node Groups stack (controller + agent nodes)...${NC}"
echo -e "${GRAY}  This creates on-demand controller and spot agent node groups${NC}"
echo -e "${GRAY}  Estimated time: 5-10 minutes${NC}"
if ! cdk deploy JenkinsEksNodeGroupsStack --require-approval never; then
    echo -e "${RED}✗ Jenkins EKS Node Groups deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Jenkins EKS Node Groups stack deployed${NC}"
echo ""

# Step 10: Deploy Jenkins Application Stack
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Step 10: Deploying Jenkins Application${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${YELLOW}Deploying Jenkins Application stack (Jenkins + ALB + monitoring)...${NC}"
echo -e "${GRAY}  This deploys Jenkins, ALB Controller, S3, and CloudWatch alarms${NC}"
echo -e "${GRAY}  Estimated time: 3-5 minutes${NC}"
if ! cdk deploy JenkinsApplicationStack --require-approval never; then
    echo -e "${RED}✗ Jenkins Application deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Jenkins Application stack deployed${NC}"
echo ""

# Step 11: Deploy Nginx API Cluster Stack
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Step 11: Deploying Nginx API Cluster${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${YELLOW}Deploying Nginx API Cluster stack...${NC}"
if ! cdk deploy NginxApiClusterStack --require-approval never; then
    echo -e "${RED}✗ Nginx API Cluster deployment failed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Nginx API Cluster stack deployed${NC}"
echo ""

# Step 8: Display outputs
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Deployment Complete!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${CYAN}Stack Outputs:${NC}"
echo ""

stacks=(
    "JenkinsNetworkStack"
    "NginxApiNetworkStack"
    "JenkinsStorageStack"
    "TransitGatewayStack"
    "JenkinsEksClusterStack"
    "JenkinsEksNodeGroupsStack"
    "JenkinsApplicationStack"
    "NginxApiClusterStack"
)

for stack in "${stacks[@]}"; do
    echo -e "${YELLOW}--- $stack ---${NC}"
    aws cloudformation describe-stacks --stack-name "$stack" --query "Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}" --output table 2>/dev/null || true
    echo ""
done

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Next Steps:${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "${WHITE}1. Configure kubectl for EKS clusters${NC}"
echo -e "${GRAY}   aws eks update-kubeconfig --name jenkins-eks-cluster --region $region${NC}"
echo -e "${GRAY}   aws eks update-kubeconfig --name nginx-api-cluster --region $region${NC}"
echo ""
echo -e "${WHITE}2. Deploy Kubernetes resources${NC}"
echo -e "${GRAY}   kubectl apply -k k8s/jenkins/${NC}"
echo ""
echo -e "${WHITE}3. Verify deployments${NC}"
echo -e "${GRAY}   kubectl get pods -n jenkins${NC}"
echo ""
echo -e "${WHITE}For detailed documentation, see:${NC}"
echo -e "${GRAY}  docs/deployment/NETWORK_INFRASTRUCTURE_GUIDE.md${NC}"
echo ""
