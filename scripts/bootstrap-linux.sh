#!/bin/bash
# Jenkins EKS Infrastructure - Linux/Mac Bootstrap Script
# This script sets up all required tools and dependencies for Linux/Mac

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================"
echo -e "Jenkins EKS Infrastructure Setup"
echo -e "Linux/Mac Bootstrap Script"
echo -e "========================================${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to get version
get_version() {
    local cmd=$1
    local version_arg=${2:---version}
    $cmd $version_arg 2>&1 | head -n 1 || echo "Unknown"
}

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
fi

echo -e "${YELLOW}Detected OS: $OS${NC}"
echo ""

echo -e "${YELLOW}Step 1: Checking Prerequisites...${NC}"
echo ""

# Check for package manager
if [ "$OS" = "mac" ]; then
    if ! command_exists brew; then
        echo -e "${YELLOW}Homebrew not found. Installing...${NC}"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        if ! command_exists brew; then
            echo -e "${RED}ERROR: Failed to install Homebrew${NC}"
            echo -e "${YELLOW}Please install Homebrew manually from https://brew.sh${NC}"
            exit 1
        fi
        echo -e "${GREEN}✓ Homebrew installed successfully${NC}"
    else
        echo -e "${GREEN}✓ Homebrew is already installed${NC}"
    fi
elif [ "$OS" = "linux" ]; then
    if [ "$DISTRO" = "ubuntu" ] || [ "$DISTRO" = "debian" ]; then
        echo -e "${GREEN}✓ Using apt package manager${NC}"
        sudo apt-get update
    elif [ "$DISTRO" = "fedora" ] || [ "$DISTRO" = "rhel" ] || [ "$DISTRO" = "centos" ]; then
        echo -e "${GREEN}✓ Using yum/dnf package manager${NC}"
    else
        echo -e "${YELLOW}WARNING: Unknown Linux distribution. Some installations may fail.${NC}"
    fi
fi

echo ""
echo -e "${YELLOW}Step 2: Installing Required Tools...${NC}"
echo ""

# Install AWS CLI
if ! command_exists aws; then
    echo -e "${YELLOW}Installing AWS CLI...${NC}"
    
    if [ "$OS" = "mac" ]; then
        brew install awscli
    elif [ "$OS" = "linux" ]; then
        curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
        unzip -q awscliv2.zip
        sudo ./aws/install
        rm -rf aws awscliv2.zip
    fi
    
    if ! command_exists aws; then
        echo -e "${RED}ERROR: Failed to install AWS CLI${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ AWS CLI installed successfully${NC}"
else
    echo -e "${GREEN}✓ AWS CLI is already installed: $(get_version aws)${NC}"
fi

# Install Node.js
if ! command_exists node; then
    echo -e "${YELLOW}Installing Node.js...${NC}"
    
    if [ "$OS" = "mac" ]; then
        brew install node@18
    elif [ "$OS" = "linux" ]; then
        if [ "$DISTRO" = "ubuntu" ] || [ "$DISTRO" = "debian" ]; then
            curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif [ "$DISTRO" = "fedora" ] || [ "$DISTRO" = "rhel" ] || [ "$DISTRO" = "centos" ]; then
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            sudo yum install -y nodejs
        fi
    fi
    
    if ! command_exists node; then
        echo -e "${RED}ERROR: Failed to install Node.js${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Node.js installed successfully${NC}"
else
    echo -e "${GREEN}✓ Node.js is already installed: $(get_version node)${NC}"
fi

# Install kubectl
if ! command_exists kubectl; then
    echo -e "${YELLOW}Installing kubectl...${NC}"
    
    if [ "$OS" = "mac" ]; then
        brew install kubectl
    elif [ "$OS" = "linux" ]; then
        curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
        sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
        rm kubectl
    fi
    
    if ! command_exists kubectl; then
        echo -e "${RED}ERROR: Failed to install kubectl${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ kubectl installed successfully${NC}"
else
    echo -e "${GREEN}✓ kubectl is already installed${NC}"
fi

# Install Git
if ! command_exists git; then
    echo -e "${YELLOW}Installing Git...${NC}"
    
    if [ "$OS" = "mac" ]; then
        brew install git
    elif [ "$OS" = "linux" ]; then
        if [ "$DISTRO" = "ubuntu" ] || [ "$DISTRO" = "debian" ]; then
            sudo apt-get install -y git
        elif [ "$DISTRO" = "fedora" ] || [ "$DISTRO" = "rhel" ] || [ "$DISTRO" = "centos" ]; then
            sudo yum install -y git
        fi
    fi
    
    if ! command_exists git; then
        echo -e "${RED}ERROR: Failed to install Git${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Git installed successfully${NC}"
else
    echo -e "${GREEN}✓ Git is already installed: $(get_version git)${NC}"
fi

# Install Helm
if ! command_exists helm; then
    echo -e "${YELLOW}Installing Helm...${NC}"
    
    if [ "$OS" = "mac" ]; then
        brew install helm
    elif [ "$OS" = "linux" ]; then
        curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    fi
    
    if ! command_exists helm; then
        echo -e "${RED}ERROR: Failed to install Helm${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Helm installed successfully${NC}"
else
    echo -e "${GREEN}✓ Helm is already installed: $(get_version helm)${NC}"
fi

# Install jq (useful for JSON parsing)
if ! command_exists jq; then
    echo -e "${YELLOW}Installing jq...${NC}"
    
    if [ "$OS" = "mac" ]; then
        brew install jq
    elif [ "$OS" = "linux" ]; then
        if [ "$DISTRO" = "ubuntu" ] || [ "$DISTRO" = "debian" ]; then
            sudo apt-get install -y jq
        elif [ "$DISTRO" = "fedora" ] || [ "$DISTRO" = "rhel" ] || [ "$DISTRO" = "centos" ]; then
            sudo yum install -y jq
        fi
    fi
    
    if command_exists jq; then
        echo -e "${GREEN}✓ jq installed successfully${NC}"
    else
        echo -e "${YELLOW}WARNING: Failed to install jq (optional)${NC}"
    fi
else
    echo -e "${GREEN}✓ jq is already installed${NC}"
fi

echo ""
echo -e "${YELLOW}Step 3: Configuring AWS CLI...${NC}"
echo ""

# Check if AWS credentials are configured
if aws sts get-caller-identity >/dev/null 2>&1; then
    echo -e "${GREEN}✓ AWS credentials are already configured${NC}"
    ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    ARN=$(aws sts get-caller-identity --query Arn --output text)
    echo -e "${CYAN}  Account: $ACCOUNT${NC}"
    echo -e "${CYAN}  User: $ARN${NC}"
else
    echo -e "${YELLOW}AWS credentials not configured. Please run 'aws configure'${NC}"
    echo ""
    echo -e "${CYAN}You will need:${NC}"
    echo -e "${CYAN}  - AWS Access Key ID${NC}"
    echo -e "${CYAN}  - AWS Secret Access Key${NC}"
    echo -e "${CYAN}  - Default region (us-west-2)${NC}"
    echo -e "${CYAN}  - Default output format (json)${NC}"
    echo ""
    read -p "Configure AWS CLI now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        aws configure
    fi
fi

echo ""
echo -e "${YELLOW}Step 4: Installing Node.js Dependencies...${NC}"
echo ""

# Install npm dependencies
if [ -f "package.json" ]; then
    echo -e "${YELLOW}Installing npm packages...${NC}"
    npm install
    echo -e "${GREEN}✓ npm packages installed successfully${NC}"
else
    echo -e "${YELLOW}WARNING: package.json not found. Skipping npm install.${NC}"
fi

echo ""
echo -e "${YELLOW}Step 5: Installing AWS CDK...${NC}"
echo ""

# Install AWS CDK globally
if ! command_exists cdk; then
    echo -e "${YELLOW}Installing AWS CDK...${NC}"
    npm install -g aws-cdk
    
    if ! command_exists cdk; then
        echo -e "${RED}ERROR: Failed to install AWS CDK${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ AWS CDK installed successfully${NC}"
else
    echo -e "${GREEN}✓ AWS CDK is already installed: $(get_version cdk)${NC}"
fi

echo ""
echo -e "${YELLOW}Step 6: Bootstrapping AWS CDK...${NC}"
echo ""

# Check if CDK is bootstrapped
if aws sts get-caller-identity >/dev/null 2>&1; then
    REGION="us-west-2"
    ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    
    echo -e "${YELLOW}Checking CDK bootstrap status...${NC}"
    if aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION >/dev/null 2>&1; then
        echo -e "${GREEN}✓ CDK is already bootstrapped in $REGION${NC}"
    else
        echo -e "${YELLOW}Bootstrapping CDK in $REGION...${NC}"
        cdk bootstrap aws://$ACCOUNT/$REGION
        echo -e "${GREEN}✓ CDK bootstrapped successfully${NC}"
    fi
else
    echo -e "${YELLOW}WARNING: Could not determine AWS account. Skipping CDK bootstrap.${NC}"
    echo -e "${YELLOW}Please run 'cdk bootstrap' manually after configuring AWS credentials.${NC}"
fi

echo ""
echo -e "${YELLOW}Step 7: Preparing kubectl Layer...${NC}"
echo ""

# Prepare kubectl layer
if [ -f "scripts/prepare-kubectl-layer.js" ]; then
    echo -e "${YELLOW}Preparing kubectl layer...${NC}"
    node scripts/prepare-kubectl-layer.js
    echo -e "${GREEN}✓ kubectl layer prepared successfully${NC}"
else
    echo -e "${YELLOW}WARNING: prepare-kubectl-layer.js not found. Skipping.${NC}"
fi

echo ""
echo -e "${YELLOW}Step 8: Configuring ALB IP Whitelist...${NC}"
echo ""

# Check if ALB IP whitelist is configured
if [ ! -f "security/alb-ip-whitelist.json" ]; then
    echo -e "${YELLOW}ALB IP whitelist not configured.${NC}"
    
    if [ -f "security/alb-ip-whitelist.sample.json" ]; then
        echo -e "${YELLOW}Copying sample configuration...${NC}"
        cp security/alb-ip-whitelist.sample.json security/alb-ip-whitelist.json
        
        echo ""
        echo -e "${RED}IMPORTANT: Please edit security/alb-ip-whitelist.json with your IP addresses${NC}"
        echo -e "${YELLOW}The file has been created from the sample template.${NC}"
        echo ""
        
        read -p "Open the file now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            ${EDITOR:-nano} security/alb-ip-whitelist.json
        fi
    else
        echo -e "${YELLOW}WARNING: Sample configuration not found${NC}"
    fi
else
    echo -e "${GREEN}✓ ALB IP whitelist is already configured${NC}"
fi

echo ""
echo -e "${CYAN}========================================"
echo -e "${GREEN}Bootstrap Complete!"
echo -e "${CYAN}========================================${NC}"
echo ""

echo -e "${CYAN}Summary of Installed Tools:${NC}"
echo -e "${GREEN}  ✓ AWS CLI: $(get_version aws)${NC}"
echo -e "${GREEN}  ✓ Node.js: $(get_version node)${NC}"
echo -e "${GREEN}  ✓ npm: $(get_version npm)${NC}"
echo -e "${GREEN}  ✓ kubectl: Installed${NC}"
echo -e "${GREEN}  ✓ Git: $(get_version git)${NC}"
echo -e "${GREEN}  ✓ Helm: $(get_version helm)${NC}"
echo -e "${GREEN}  ✓ AWS CDK: $(get_version cdk)${NC}"
if command_exists jq; then
    echo -e "${GREEN}  ✓ jq: $(get_version jq)${NC}"
fi
echo ""

echo -e "${CYAN}Next Steps:${NC}"
echo -e "${YELLOW}  1. Ensure AWS credentials are configured: aws configure${NC}"
echo -e "${YELLOW}  2. Edit security/alb-ip-whitelist.json with your IP addresses${NC}"
echo -e "${YELLOW}  3. Review configuration files in k8s/jenkins/ and jenkins-jobs/${NC}"
echo -e "${YELLOW}  4. Deploy infrastructure: ./scripts/deploy-infrastructure.sh${NC}"
echo ""

echo -e "${CYAN}For detailed instructions, see SETUP_GUIDE.md${NC}"
echo ""
