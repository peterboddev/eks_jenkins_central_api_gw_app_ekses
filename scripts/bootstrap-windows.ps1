#!/usr/bin/env pwsh
# Jenkins EKS Infrastructure - Windows Bootstrap Script
# This script sets up all required tools and dependencies for Windows

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Jenkins EKS Infrastructure Setup" -ForegroundColor Cyan
Write-Host "Windows Bootstrap Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a command exists
function Test-Command {
    param($Command)
    try {
        if (Get-Command $Command -ErrorAction Stop) {
            return $true
        }
    }
    catch {
        return $false
    }
}

# Function to get version
function Get-ToolVersion {
    param($Command, $VersionArg = "--version")
    try {
        $version = & $Command $VersionArg 2>&1 | Select-Object -First 1
        return $version
    }
    catch {
        return "Unknown"
    }
}

Write-Host "Step 1: Checking Prerequisites..." -ForegroundColor Yellow
Write-Host ""

# Check PowerShell version
$psVersion = $PSVersionTable.PSVersion
Write-Host "PowerShell Version: $psVersion" -ForegroundColor Green
if ($psVersion.Major -lt 5) {
    Write-Host "ERROR: PowerShell 5.1 or later is required" -ForegroundColor Red
    exit 1
}

# Check for Chocolatey
Write-Host ""
Write-Host "Checking for Chocolatey package manager..." -ForegroundColor Yellow
if (-not (Test-Command choco)) {
    Write-Host "Chocolatey not found. Installing..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    
    if (-not (Test-Command choco)) {
        Write-Host "ERROR: Failed to install Chocolatey" -ForegroundColor Red
        Write-Host "Please install Chocolatey manually from https://chocolatey.org/install" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✓ Chocolatey installed successfully" -ForegroundColor Green
} else {
    Write-Host "✓ Chocolatey is already installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 2: Installing Required Tools..." -ForegroundColor Yellow
Write-Host ""

# Install AWS CLI
if (-not (Test-Command aws)) {
    Write-Host "Installing AWS CLI..." -ForegroundColor Yellow
    choco install awscli -y
    refreshenv
    if (-not (Test-Command aws)) {
        Write-Host "ERROR: Failed to install AWS CLI" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ AWS CLI installed successfully" -ForegroundColor Green
} else {
    $awsVersion = Get-ToolVersion aws
    Write-Host "✓ AWS CLI is already installed: $awsVersion" -ForegroundColor Green
}

# Install Node.js
if (-not (Test-Command node)) {
    Write-Host "Installing Node.js..." -ForegroundColor Yellow
    choco install nodejs-lts -y
    refreshenv
    if (-not (Test-Command node)) {
        Write-Host "ERROR: Failed to install Node.js" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Node.js installed successfully" -ForegroundColor Green
} else {
    $nodeVersion = Get-ToolVersion node
    Write-Host "✓ Node.js is already installed: $nodeVersion" -ForegroundColor Green
}

# Install kubectl
if (-not (Test-Command kubectl)) {
    Write-Host "Installing kubectl..." -ForegroundColor Yellow
    choco install kubernetes-cli -y
    refreshenv
    if (-not (Test-Command kubectl)) {
        Write-Host "ERROR: Failed to install kubectl" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ kubectl installed successfully" -ForegroundColor Green
} else {
    $kubectlVersion = Get-ToolVersion kubectl "version" "--client"
    Write-Host "✓ kubectl is already installed" -ForegroundColor Green
}

# Install Git
if (-not (Test-Command git)) {
    Write-Host "Installing Git..." -ForegroundColor Yellow
    choco install git -y
    refreshenv
    if (-not (Test-Command git)) {
        Write-Host "ERROR: Failed to install Git" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Git installed successfully" -ForegroundColor Green
} else {
    $gitVersion = Get-ToolVersion git
    Write-Host "✓ Git is already installed: $gitVersion" -ForegroundColor Green
}

# Install Helm
if (-not (Test-Command helm)) {
    Write-Host "Installing Helm..." -ForegroundColor Yellow
    choco install kubernetes-helm -y
    refreshenv
    if (-not (Test-Command helm)) {
        Write-Host "ERROR: Failed to install Helm" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Helm installed successfully" -ForegroundColor Green
} else {
    $helmVersion = Get-ToolVersion helm
    Write-Host "✓ Helm is already installed: $helmVersion" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 3: Configuring AWS CLI..." -ForegroundColor Yellow
Write-Host ""

# Check if AWS credentials are configured
try {
    $awsIdentity = aws sts get-caller-identity 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ AWS credentials are already configured" -ForegroundColor Green
        $identity = $awsIdentity | ConvertFrom-Json
        Write-Host "  Account: $($identity.Account)" -ForegroundColor Cyan
        Write-Host "  User: $($identity.Arn)" -ForegroundColor Cyan
    } else {
        Write-Host "AWS credentials not configured. Please run 'aws configure'" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "You will need:" -ForegroundColor Cyan
        Write-Host "  - AWS Access Key ID" -ForegroundColor Cyan
        Write-Host "  - AWS Secret Access Key" -ForegroundColor Cyan
        Write-Host "  - Default region (us-west-2)" -ForegroundColor Cyan
        Write-Host "  - Default output format (json)" -ForegroundColor Cyan
        Write-Host ""
        $configure = Read-Host "Configure AWS CLI now? (y/n)"
        if ($configure -eq "y") {
            aws configure
        }
    }
} catch {
    Write-Host "AWS credentials not configured. Please run 'aws configure'" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 4: Installing Node.js Dependencies..." -ForegroundColor Yellow
Write-Host ""

# Install npm dependencies
if (Test-Path "package.json") {
    Write-Host "Installing npm packages..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install npm packages" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ npm packages installed successfully" -ForegroundColor Green
} else {
    Write-Host "WARNING: package.json not found. Skipping npm install." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 5: Installing AWS CDK..." -ForegroundColor Yellow
Write-Host ""

# Install AWS CDK globally
if (-not (Test-Command cdk)) {
    Write-Host "Installing AWS CDK..." -ForegroundColor Yellow
    npm install -g aws-cdk
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install AWS CDK" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ AWS CDK installed successfully" -ForegroundColor Green
} else {
    $cdkVersion = Get-ToolVersion cdk
    Write-Host "✓ AWS CDK is already installed: $cdkVersion" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 6: Bootstrapping AWS CDK..." -ForegroundColor Yellow
Write-Host ""

# Check if CDK is bootstrapped
try {
    $region = "us-west-2"
    $account = (aws sts get-caller-identity --query Account --output text 2>&1)
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Checking CDK bootstrap status..." -ForegroundColor Yellow
        $stackName = "CDKToolkit"
        $stackExists = aws cloudformation describe-stacks --stack-name $stackName --region $region 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ CDK is already bootstrapped in $region" -ForegroundColor Green
        } else {
            Write-Host "Bootstrapping CDK in $region..." -ForegroundColor Yellow
            cdk bootstrap aws://$account/$region
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: Failed to bootstrap CDK" -ForegroundColor Red
                exit 1
            }
            Write-Host "✓ CDK bootstrapped successfully" -ForegroundColor Green
        }
    } else {
        Write-Host "WARNING: Could not determine AWS account. Skipping CDK bootstrap." -ForegroundColor Yellow
        Write-Host "Please run 'cdk bootstrap' manually after configuring AWS credentials." -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARNING: Could not check CDK bootstrap status" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 7: Preparing kubectl Layer..." -ForegroundColor Yellow
Write-Host ""

# Prepare kubectl layer
if (Test-Path "scripts/prepare-kubectl-layer.js") {
    Write-Host "Preparing kubectl layer..." -ForegroundColor Yellow
    node scripts/prepare-kubectl-layer.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to prepare kubectl layer" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ kubectl layer prepared successfully" -ForegroundColor Green
} else {
    Write-Host "WARNING: prepare-kubectl-layer.js not found. Skipping." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 8: Configuring ALB IP Whitelist..." -ForegroundColor Yellow
Write-Host ""

# Check if ALB IP whitelist is configured
if (-not (Test-Path "security/alb-ip-whitelist.json")) {
    Write-Host "ALB IP whitelist not configured." -ForegroundColor Yellow
    
    if (Test-Path "security/alb-ip-whitelist.sample.json") {
        Write-Host "Copying sample configuration..." -ForegroundColor Yellow
        Copy-Item "security/alb-ip-whitelist.sample.json" "security/alb-ip-whitelist.json"
        
        Write-Host ""
        Write-Host "IMPORTANT: Please edit security/alb-ip-whitelist.json with your IP addresses" -ForegroundColor Red
        Write-Host "The file has been created from the sample template." -ForegroundColor Yellow
        Write-Host ""
        
        $edit = Read-Host "Open the file now? (y/n)"
        if ($edit -eq "y") {
            notepad "security/alb-ip-whitelist.json"
        }
    } else {
        Write-Host "WARNING: Sample configuration not found" -ForegroundColor Yellow
    }
} else {
    Write-Host "✓ ALB IP whitelist is already configured" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Bootstrap Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Summary of Installed Tools:" -ForegroundColor Cyan
Write-Host "  ✓ PowerShell: $psVersion" -ForegroundColor Green
Write-Host "  ✓ AWS CLI: $(Get-ToolVersion aws)" -ForegroundColor Green
Write-Host "  ✓ Node.js: $(Get-ToolVersion node)" -ForegroundColor Green
Write-Host "  ✓ npm: $(Get-ToolVersion npm)" -ForegroundColor Green
Write-Host "  ✓ kubectl: Installed" -ForegroundColor Green
Write-Host "  ✓ Git: $(Get-ToolVersion git)" -ForegroundColor Green
Write-Host "  ✓ Helm: $(Get-ToolVersion helm)" -ForegroundColor Green
Write-Host "  ✓ AWS CDK: $(Get-ToolVersion cdk)" -ForegroundColor Green
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Ensure AWS credentials are configured: aws configure" -ForegroundColor Yellow
Write-Host "  2. Edit security/alb-ip-whitelist.json with your IP addresses" -ForegroundColor Yellow
Write-Host "  3. Review configuration files in k8s/jenkins/ and jenkins-jobs/" -ForegroundColor Yellow
Write-Host "  4. Deploy infrastructure: .\scripts\deploy-infrastructure.ps1" -ForegroundColor Yellow
Write-Host ""

Write-Host "For detailed instructions, see SETUP_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
