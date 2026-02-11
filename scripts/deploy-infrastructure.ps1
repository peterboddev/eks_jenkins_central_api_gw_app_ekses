#!/usr/bin/env pwsh
# Infrastructure Deployment Bootstrap Script
# This script deploys all infrastructure stacks in the correct order

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Infrastructure Deployment Bootstrap" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if command exists
function Test-Command {
    param($Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Function to wait for stack completion
function Wait-StackCompletion {
    param(
        [string]$StackName,
        [int]$TimeoutSeconds = 600
    )
    
    Write-Host "Waiting for stack $StackName to complete..." -ForegroundColor Yellow
    $elapsed = 0
    $interval = 10
    
    while ($elapsed -lt $TimeoutSeconds) {
        $status = aws cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].StackStatus" --output text 2>$null
        
        if ($status -match "COMPLETE") {
            Write-Host "✓ Stack $StackName completed successfully" -ForegroundColor Green
            return $true
        }
        elseif ($status -match "FAILED" -or $status -match "ROLLBACK") {
            Write-Host "✗ Stack $StackName failed: $status" -ForegroundColor Red
            return $false
        }
        
        Start-Sleep -Seconds $interval
        $elapsed += $interval
        Write-Host "  Status: $status (${elapsed}s elapsed)" -ForegroundColor Gray
    }
    
    Write-Host "✗ Timeout waiting for stack $StackName" -ForegroundColor Red
    return $false
}

# Step 1: Verify prerequisites
Write-Host "Step 1: Verifying prerequisites..." -ForegroundColor Cyan

if (-not (Test-Command "node")) {
    Write-Host "✗ Node.js is not installed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Node.js is installed" -ForegroundColor Green

if (-not (Test-Command "npm")) {
    Write-Host "✗ npm is not installed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ npm is installed" -ForegroundColor Green

if (-not (Test-Command "cdk")) {
    Write-Host "✗ AWS CDK is not installed" -ForegroundColor Red
    Write-Host "  Install with: npm install -g aws-cdk" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ AWS CDK is installed" -ForegroundColor Green

if (-not (Test-Command "aws")) {
    Write-Host "✗ AWS CLI is not installed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ AWS CLI is installed" -ForegroundColor Green

# Check AWS credentials
$identity = aws sts get-caller-identity 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ AWS credentials not configured" -ForegroundColor Red
    Write-Host "  Configure with: aws configure" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ AWS credentials configured" -ForegroundColor Green

$account = aws sts get-caller-identity --query Account --output text
$region = aws configure get region
if (-not $region) { $region = "us-west-2" }

Write-Host ""
Write-Host "Deployment Configuration:" -ForegroundColor Cyan
Write-Host "  Account: $account" -ForegroundColor White
Write-Host "  Region:  $region" -ForegroundColor White
Write-Host ""

# Step 2: Install dependencies
Write-Host "Step 2: Installing dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 3: Build TypeScript
Write-Host "Step 3: Building TypeScript..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Build successful" -ForegroundColor Green
Write-Host ""

# Step 4: Verify CDK bootstrap
Write-Host "Step 4: Verifying CDK bootstrap..." -ForegroundColor Cyan
$bootstrapStack = aws cloudformation describe-stacks --stack-name CDKToolkit --region $region 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠ CDK not bootstrapped in this account/region" -ForegroundColor Yellow
    Write-Host "  Bootstrapping now..." -ForegroundColor Yellow
    cdk bootstrap "aws://$account/$region"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Bootstrap failed" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✓ CDK bootstrap verified" -ForegroundColor Green
Write-Host ""

# Step 5: Deploy network stacks
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 5: Deploying Network Infrastructure" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Deploying VPC network stacks..." -ForegroundColor Yellow
cdk deploy JenkinsNetworkStack NginxApiNetworkStack --require-approval never
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Network stack deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ VPC network stacks deployed" -ForegroundColor Green
Write-Host ""

# Step 6: Deploy Transit Gateway
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 6: Deploying Transit Gateway" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Deploying Transit Gateway stack..." -ForegroundColor Yellow
cdk deploy TransitGatewayStack --require-approval never
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Transit Gateway deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Transit Gateway stack deployed" -ForegroundColor Green
Write-Host ""

# Step 7: Deploy Jenkins Storage Stack
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 7: Deploying Jenkins Storage" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Deploying Jenkins Storage stack (EFS + Backups)..." -ForegroundColor Yellow
cdk deploy JenkinsStorageStack --require-approval never
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Jenkins Storage deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Jenkins Storage stack deployed" -ForegroundColor Green
Write-Host ""

# Step 8: Deploy Jenkins EKS Cluster Stack
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 8: Deploying Jenkins EKS Cluster" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Deploying Jenkins EKS Cluster stack (foundational cluster only)..." -ForegroundColor Yellow
Write-Host "  This creates the EKS cluster with Kubernetes 1.32" -ForegroundColor Gray
Write-Host "  Estimated time: 15-20 minutes" -ForegroundColor Gray
cdk deploy JenkinsEksClusterStack --require-approval never
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Jenkins EKS Cluster deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Jenkins EKS Cluster stack deployed" -ForegroundColor Green
Write-Host ""

# Step 9: Deploy Jenkins EKS Node Groups Stack
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 9: Deploying Jenkins EKS Node Groups" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Deploying Jenkins EKS Node Groups stack (controller + agent nodes)..." -ForegroundColor Yellow
Write-Host "  This creates on-demand controller and spot agent node groups" -ForegroundColor Gray
Write-Host "  Estimated time: 5-10 minutes" -ForegroundColor Gray
cdk deploy JenkinsEksNodeGroupsStack --require-approval never
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Jenkins EKS Node Groups deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Jenkins EKS Node Groups stack deployed" -ForegroundColor Green
Write-Host ""

# Step 10: Deploy Jenkins Application Stack
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 10: Deploying Jenkins Application" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Deploying Jenkins Application stack (Jenkins + ALB + monitoring)..." -ForegroundColor Yellow
Write-Host "  This deploys Jenkins, ALB Controller, S3, and CloudWatch alarms" -ForegroundColor Gray
Write-Host "  Estimated time: 3-5 minutes" -ForegroundColor Gray
cdk deploy JenkinsApplicationStack --require-approval never
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Jenkins Application deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Jenkins Application stack deployed" -ForegroundColor Green
Write-Host ""

# Step 11: Deploy Nginx API Cluster Stack
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Step 11: Deploying Nginx API Cluster" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Deploying Nginx API Cluster stack..." -ForegroundColor Yellow
cdk deploy NginxApiClusterStack --require-approval never
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Nginx API Cluster deployment failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Nginx API Cluster stack deployed" -ForegroundColor Green
Write-Host ""

# Step 8: Display outputs
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Stack Outputs:" -ForegroundColor Cyan
Write-Host ""

$stacks = @(
    "JenkinsNetworkStack",
    "NginxApiNetworkStack",
    "JenkinsStorageStack",
    "TransitGatewayStack",
    "JenkinsEksClusterStack",
    "JenkinsEksNodeGroupsStack",
    "JenkinsApplicationStack",
    "NginxApiClusterStack"
)

foreach ($stack in $stacks) {
    Write-Host "--- $stack ---" -ForegroundColor Yellow
    aws cloudformation describe-stacks --stack-name $stack --query "Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}" --output table 2>$null
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "1. Configure kubectl for EKS clusters" -ForegroundColor White
Write-Host "   aws eks update-kubeconfig --name jenkins-eks-cluster --region $region" -ForegroundColor Gray
Write-Host "   aws eks update-kubeconfig --name nginx-api-cluster --region $region" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Deploy Kubernetes resources" -ForegroundColor White
Write-Host "   kubectl apply -k k8s/jenkins/" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Verify deployments" -ForegroundColor White
Write-Host "   kubectl get pods -n jenkins" -ForegroundColor Gray
Write-Host ""
Write-Host "For detailed documentation, see:" -ForegroundColor White
Write-Host "  docs/deployment/NETWORK_INFRASTRUCTURE_GUIDE.md" -ForegroundColor Gray
Write-Host ""
