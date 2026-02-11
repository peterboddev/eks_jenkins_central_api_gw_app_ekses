# Network Infrastructure Deployment Guide

## Overview

This project uses a **separated network architecture** where VPC infrastructure is deployed in dedicated network stacks, separate from application stacks. This follows AWS best practices for infrastructure organization and enables better resource management.

## Architecture

### Stack Organization

```
Network Layer (Deploy First):
├── JenkinsNetworkStack      - Jenkins VPC (10.0.0.0/16)
├── NginxApiNetworkStack     - Nginx API VPC (10.1.0.0/16)
└── TransitGatewayStack      - Inter-VPC connectivity

Application Layer (Deploy Second):
├── JenkinsEksStack          - Jenkins EKS cluster (imports Jenkins VPC)
└── NginxApiClusterStack     - Nginx API EKS cluster (imports Nginx API VPC)
```

### Network Stacks

#### 1. JenkinsNetworkStack (`lib/network/jenkins-vpc/jenkins-network-stack.ts`)
- **VPC CIDR**: 10.0.0.0/16
- **Subnets**: Private subnets in 2 AZs (us-west-2a, us-west-2b)
- **NAT Gateways**: 2 (one per AZ for high availability)
- **VPC Endpoints**: ECR API, ECR Docker, EC2, STS, CloudWatch Logs, S3 Gateway
- **Exports**: VPC ID, subnet IDs, route table IDs

#### 2. NginxApiNetworkStack (`lib/network/nginx-api-vpc/nginx-api-network-stack.ts`)
- **VPC CIDR**: 10.1.0.0/16
- **Subnets**: Public and private subnets in 2 AZs
- **NAT Gateway**: 1 (cost optimization)
- **Subnet Tags**: Kubernetes and Karpenter discovery tags
- **Exports**: VPC ID, subnet IDs, route table IDs

#### 3. TransitGatewayStack (`lib/network/transit-gateway-stack.ts`)
- **Purpose**: Enables private communication between Jenkins and Nginx API VPCs
- **Attachments**: Both VPCs attached to Transit Gateway
- **Routes**: Automatic route propagation between VPCs
- **Dependencies**: Requires both network stacks to be deployed first

## CDK Version

- **aws-cdk-lib**: 2.238.0 (construct library)
- **aws-cdk CLI**: 2.1105.0 (command-line tool)

**Note**: The CLI and library have different version schemes. The library version (2.x) corresponds to CDK v2, while the CLI has its own versioning. Both are compatible and represent the latest stable versions.

To update your global CDK CLI:
```bash
npm install -g aws-cdk@2.1105.0
```

## Deployment Order

### Critical: Deploy in Sequence

Stacks MUST be deployed in this exact order due to dependencies:

```bash
# Step 1: Deploy VPC network stacks (can be deployed in parallel)
cdk deploy JenkinsNetworkStack NginxApiNetworkStack --require-approval never

# Step 2: Deploy Transit Gateway (depends on both VPCs)
cdk deploy TransitGatewayStack --require-approval never

# Step 3: Deploy application stacks (can be deployed in parallel)
cdk deploy JenkinsEksStack NginxApiClusterStack --require-approval never
```

### Why This Order?

1. **VPC stacks first**: Application stacks import VPC resources via props
2. **Transit Gateway second**: Requires VPC IDs and subnet IDs from network stacks
3. **Application stacks last**: Import VPC from network stacks and use Transit Gateway for connectivity

## Quick Start: Bootstrap Script

Use the provided bootstrap script for automated deployment:

**Linux/Mac:**
```bash
# Make script executable
chmod +x scripts/deploy-infrastructure.sh

# Run deployment
./scripts/deploy-infrastructure.sh
```

**Windows:**
```powershell
# Run deployment
.\scripts\deploy-infrastructure.ps1
```

The bootstrap script will:
1. Verify CDK is installed and bootstrapped
2. Build the TypeScript code
3. Deploy network stacks in correct order
4. Wait for each deployment to complete
5. Deploy application stacks
6. Display all stack outputs

## Manual Deployment

### Prerequisites

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Verify CDK bootstrap (one-time setup per account/region)
cdk bootstrap aws://ACCOUNT-ID/us-west-2
```

### Deploy Network Infrastructure

```bash
# Deploy both VPC stacks
cdk deploy JenkinsNetworkStack NginxApiNetworkStack --require-approval never

# Wait for completion, then deploy Transit Gateway
cdk deploy TransitGatewayStack --require-approval never
```

### Deploy Application Infrastructure

```bash
# Deploy both application stacks
cdk deploy JenkinsEksStack NginxApiClusterStack --require-approval never
```

## Stack Dependencies

```
JenkinsNetworkStack (independent)
NginxApiNetworkStack (independent)
    ↓
TransitGatewayStack (depends on both network stacks)
    ↓
JenkinsEksStack (depends on JenkinsNetworkStack)
NginxApiClusterStack (depends on NginxApiNetworkStack + TransitGatewayStack)
```

## Verification

### Check Stack Status

```bash
# List all stacks
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Describe specific stack
aws cloudformation describe-stacks --stack-name JenkinsNetworkStack
```

### Verify VPCs

```bash
# List VPCs
aws ec2 describe-vpcs --query "Vpcs[].{VpcId:VpcId,CidrBlock:CidrBlock,Tags:Tags[?Key=='Name'].Value|[0]}" --output table

# Expected output:
# - jenkins-eks-vpc (10.0.0.0/16)
# - nginx-api-vpc (10.1.0.0/16)
```

### Verify Transit Gateway

```bash
# List Transit Gateways
aws ec2 describe-transit-gateways --query "TransitGateways[].{TgwId:TransitGatewayId,State:State}" --output table

# List TGW attachments
aws ec2 describe-transit-gateway-attachments --query "TransitGatewayAttachments[].{TgwId:TransitGatewayId,VpcId:ResourceId,State:State}" --output table
```

## Cleanup

### Delete All Stacks

```bash
# Delete in reverse order
cdk destroy NginxApiClusterStack JenkinsEksStack --force
cdk destroy TransitGatewayStack --force
cdk destroy NginxApiNetworkStack JenkinsNetworkStack --force
```

### Manual VPC Cleanup (if needed)

If VPCs fail to delete due to dependencies:

```bash
# List VPCs
aws ec2 describe-vpcs --query "Vpcs[?Tags[?Key=='Name' && contains(Value, 'jenkins') || contains(Value, 'nginx')]].VpcId" --output text

# Delete specific VPC (after removing all dependencies)
aws ec2 delete-vpc --vpc-id vpc-XXXXXXXXX
```

## Troubleshooting

### Issue: VPC Limit Reached

**Error**: "The maximum number of VPCs has been reached"

**Solution**: Delete unused VPCs
```bash
# List all VPCs
aws ec2 describe-vpcs --output table

# Delete old VPCs (ensure no resources attached)
aws ec2 delete-vpc --vpc-id vpc-XXXXXXXXX
```

### Issue: Stack Already Exists

**Error**: "Stack [StackName] already exists"

**Solution**: Update existing stack or delete and redeploy
```bash
# Update existing stack
cdk deploy StackName

# Or delete and redeploy
cdk destroy StackName --force
cdk deploy StackName --require-approval never
```

### Issue: Dependency Errors

**Error**: "Export [ExportName] cannot be deleted as it is in use"

**Solution**: Delete dependent stacks first
```bash
# Always delete in reverse order
cdk destroy NginxApiClusterStack JenkinsEksStack
cdk destroy TransitGatewayStack
cdk destroy NginxApiNetworkStack JenkinsNetworkStack
```

## Network Configuration Details

### Jenkins VPC (10.0.0.0/16)

| Resource | CIDR/Details |
|----------|--------------|
| Private Subnet AZ-A | 10.0.0.0/24 |
| Private Subnet AZ-B | 10.0.1.0/24 |
| NAT Gateway AZ-A | Elastic IP |
| NAT Gateway AZ-B | Elastic IP |
| VPC Endpoints | ECR, EC2, STS, CloudWatch, S3 |

### Nginx API VPC (10.1.0.0/16)

| Resource | CIDR/Details |
|----------|--------------|
| Public Subnet 1 | 10.1.0.0/24 |
| Public Subnet 2 | 10.1.1.0/24 |
| Private Subnet 1 | 10.1.2.0/24 |
| Private Subnet 2 | 10.1.3.0/24 |
| NAT Gateway | Single (cost optimization) |

### Transit Gateway Routes

| Source VPC | Destination | Route Target |
|------------|-------------|--------------|
| Jenkins (10.0.0.0/16) | 10.1.0.0/16 | Transit Gateway |
| Nginx API (10.1.0.0/16) | 10.0.0.0/16 | Transit Gateway |

## Best Practices

1. **Always deploy network stacks first** - Application stacks depend on VPC resources
2. **Use Transit Gateway for VPC connectivity** - Don't use VPC peering
3. **Tag all resources** - Use consistent naming conventions
4. **Export critical values** - VPC IDs, subnet IDs, route table IDs
5. **Document CIDR blocks** - Avoid IP address conflicts
6. **Use separate stacks** - Network and application infrastructure should be independent
7. **Version control** - Keep CDK versions in sync (aws-cdk-lib and aws-cdk CLI)

## References

- [AWS VPC Best Practices](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-best-practices.html)
- [AWS Transit Gateway](https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html)
- [CDK Stack Dependencies](https://docs.aws.amazon.com/cdk/v2/guide/stack_dependencies.html)
