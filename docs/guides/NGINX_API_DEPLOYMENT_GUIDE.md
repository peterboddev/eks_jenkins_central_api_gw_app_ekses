# Nginx API Cluster Deployment Guide

## Overview

This guide provides a step-by-step approach to deploying the nginx-api-cluster infrastructure. The deployment is broken into logical phases to allow for verification at each step.

## Prerequisites

- Jenkins EKS cluster already deployed (VPC: 10.0.0.0/16)
- AWS CLI configured with appropriate credentials
- CDK CLI installed (`npm install -g aws-cdk`)
- kubectl installed
- Helm installed

## Phase 1: VPC Infrastructure

### Step 1.1: Deploy VPC Only

First, we'll deploy just the VPC infrastructure without the EKS cluster.

**What gets deployed:**
- VPC with CIDR 10.1.0.0/16
- 2 public subnets (10.1.0.0/24, 10.1.1.0/24)
- 2 private subnets (10.1.2.0/24, 10.1.3.0/24)
- Internet Gateway
- 2 NAT Gateways (one per AZ)
- Route tables configured

**Deploy:**
```powershell
# Synthesize to verify
npx cdk synth NginxApiClusterStack

# Deploy VPC
npx cdk deploy NginxApiClusterStack
```

**Verify:**
```powershell
# Get VPC ID
aws ec2 describe-vpcs --filters "Name=cidr,Values=10.1.0.0/16" --query "Vpcs[0].VpcId" --output text

# Verify subnets
aws ec2 describe-subnets --filters "Name=vpc-id,Values=<vpc-id>" --query "Subnets[*].[SubnetId,CidrBlock,AvailabilityZone,Tags[?Key=='Name'].Value|[0]]" --output table

# Verify NAT Gateways
aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=<vpc-id>" --query "NatGateways[*].[NatGatewayId,State,SubnetId]" --output table

# Verify tags for Karpenter
aws ec2 describe-subnets --filters "Name=vpc-id,Values=<vpc-id>" "Name=tag:karpenter.sh/discovery,Values=nginx-api-cluster" --query "Subnets[*].[SubnetId,CidrBlock]" --output table
```

**Expected Results:**
- VPC created with CIDR 10.1.0.0/16
- 4 subnets total (2 public, 2 private)
- 2 NAT Gateways in "available" state
- Private subnets tagged with `karpenter.sh/discovery=nginx-api-cluster`

---

## Phase 2: Transit Gateway Setup

### Step 2.1: Check for Existing Transit Gateway

```powershell
# List Transit Gateways
aws ec2 describe-transit-gateways --query "TransitGateways[*].[TransitGatewayId,State,Tags[?Key=='Name'].Value|[0]]" --output table
```

**Decision Point:**
- If TGW exists: Note the Transit Gateway ID for next step
- If no TGW exists: We'll create one in the next step

### Step 2.2: Create Transit Gateway (if needed)

```powershell
# Create Transit Gateway
aws ec2 create-transit-gateway `
  --description "Transit Gateway for Jenkins and App clusters" `
  --options "AmazonSideAsn=64512,AutoAcceptSharedAttachments=enable,DefaultRouteTableAssociation=enable,DefaultRouteTablePropagation=enable,DnsSupport=enable,VpnEcmpSupport=enable" `
  --tag-specifications "ResourceType=transit-gateway,Tags=[{Key=Name,Value=jenkins-app-tgw}]"

# Wait for TGW to become available
aws ec2 describe-transit-gateways --transit-gateway-ids <tgw-id> --query "TransitGateways[0].State" --output text
```

### Step 2.3: Attach Jenkins VPC to Transit Gateway

```powershell
# Get Jenkins VPC ID
$JENKINS_VPC_ID = aws ec2 describe-vpcs --filters "Name=cidr,Values=10.0.0.0/16" --query "Vpcs[0].VpcId" --output text

# Get Jenkins private subnet IDs
$JENKINS_SUBNET_IDS = aws ec2 describe-subnets `
  --filters "Name=vpc-id,Values=$JENKINS_VPC_ID" "Name=tag:aws-cdk:subnet-type,Values=Private" `
  --query "Subnets[*].SubnetId" --output text

# Create TGW attachment for Jenkins VPC
aws ec2 create-transit-gateway-vpc-attachment `
  --transit-gateway-id <tgw-id> `
  --vpc-id $JENKINS_VPC_ID `
  --subnet-ids $JENKINS_SUBNET_IDS `
  --tag-specifications "ResourceType=transit-gateway-attachment,Tags=[{Key=Name,Value=jenkins-vpc-attachment}]"

# Wait for attachment to become available
aws ec2 describe-transit-gateway-vpc-attachments --filters "Name=vpc-id,Values=$JENKINS_VPC_ID" --query "TransitGatewayVpcAttachments[0].State" --output text
```

### Step 2.4: Attach App VPC to Transit Gateway

```powershell
# Get App VPC ID
$APP_VPC_ID = aws ec2 describe-vpcs --filters "Name=cidr,Values=10.1.0.0/16" --query "Vpcs[0].VpcId" --output text

# Get App private subnet IDs
$APP_SUBNET_IDS = aws ec2 describe-subnets `
  --filters "Name=vpc-id,Values=$APP_VPC_ID" "Name=tag:aws-cdk:subnet-type,Values=Private" `
  --query "Subnets[*].SubnetId" --output text

# Create TGW attachment for App VPC
aws ec2 create-transit-gateway-vpc-attachment `
  --transit-gateway-id <tgw-id> `
  --vpc-id $APP_VPC_ID `
  --subnet-ids $APP_SUBNET_IDS `
  --tag-specifications "ResourceType=transit-gateway-attachment,Tags=[{Key=Name,Value=app-vpc-attachment}]"

# Wait for attachment to become available
aws ec2 describe-transit-gateway-vpc-attachments --filters "Name=vpc-id,Values=$APP_VPC_ID" --query "TransitGatewayVpcAttachments[0].State" --output text
```

### Step 2.5: Configure Route Tables

**Add routes in Jenkins VPC to reach App VPC:**

```powershell
# Get Jenkins private route table IDs
$JENKINS_ROUTE_TABLES = aws ec2 describe-route-tables `
  --filters "Name=vpc-id,Values=$JENKINS_VPC_ID" "Name=tag:aws-cdk:subnet-type,Values=Private" `
  --query "RouteTables[*].RouteTableId" --output text

# Add route to App VPC CIDR through TGW
foreach ($RT in $JENKINS_ROUTE_TABLES.Split()) {
  aws ec2 create-route `
    --route-table-id $RT `
    --destination-cidr-block 10.1.0.0/16 `
    --transit-gateway-id <tgw-id>
}
```

**Add routes in App VPC to reach Jenkins VPC:**

```powershell
# Get App private route table IDs
$APP_ROUTE_TABLES = aws ec2 describe-route-tables `
  --filters "Name=vpc-id,Values=$APP_VPC_ID" "Name=tag:aws-cdk:subnet-type,Values=Private" `
  --query "RouteTables[*].RouteTableId" --output text

# Add route to Jenkins VPC CIDR through TGW
foreach ($RT in $APP_ROUTE_TABLES.Split()) {
  aws ec2 create-route `
    --route-table-id $RT `
    --destination-cidr-block 10.0.0.0/16 `
    --transit-gateway-id <tgw-id>
}
```

### Step 2.6: Verify Transit Gateway Connectivity

```powershell
# Verify routes in Jenkins VPC
aws ec2 describe-route-tables --route-table-ids $JENKINS_ROUTE_TABLES --query "RouteTables[*].Routes[?DestinationCidrBlock=='10.1.0.0/16']" --output table

# Verify routes in App VPC
aws ec2 describe-route-tables --route-table-ids $APP_ROUTE_TABLES --query "RouteTables[*].Routes[?DestinationCidrBlock=='10.0.0.0/16']" --output table

# Check TGW attachments status
aws ec2 describe-transit-gateway-vpc-attachments --filters "Name=transit-gateway-id,Values=<tgw-id>" --query "TransitGatewayVpcAttachments[*].[VpcId,State,Tags[?Key=='Name'].Value|[0]]" --output table
```

**Expected Results:**
- Both VPC attachments in "available" state
- Routes present in both VPCs pointing to TGW
- Jenkins VPC can route to 10.1.0.0/16 via TGW
- App VPC can route to 10.0.0.0/16 via TGW

---

## Phase 3: EKS Cluster (Next Steps)

After VPC and TGW are verified, we'll proceed with:
1. EKS cluster creation
2. Karpenter installation
3. AWS Load Balancer Controller
4. Application deployment
5. API Gateway setup

---

## Troubleshooting

### VPC Issues

**Problem:** Subnets not created in expected AZs
```powershell
# Check available AZs
aws ec2 describe-availability-zones --region us-west-2 --query "AvailabilityZones[*].[ZoneName,State]" --output table
```

**Problem:** NAT Gateway stuck in "pending"
```powershell
# Check NAT Gateway status
aws ec2 describe-nat-gateways --nat-gateway-ids <nat-gw-id> --query "NatGateways[0].[State,FailureMessage]" --output table
```

### Transit Gateway Issues

**Problem:** TGW attachment stuck in "pending"
```powershell
# Check attachment details
aws ec2 describe-transit-gateway-vpc-attachments --transit-gateway-attachment-ids <attachment-id>
```

**Problem:** Routes not propagating
```powershell
# Verify TGW route table
aws ec2 describe-transit-gateway-route-tables --filters "Name=transit-gateway-id,Values=<tgw-id>"

# Check route table associations
aws ec2 get-transit-gateway-route-table-associations --transit-gateway-route-table-id <rt-id>
```

### Connectivity Testing

Once both VPCs are attached to TGW, you can test connectivity:

```powershell
# From Jenkins cluster, try to reach App VPC CIDR
# (This will work once EKS cluster is deployed in App VPC)
kubectl exec -it <jenkins-pod> -- ping 10.1.0.1
```

---

## Rollback Procedures

### Remove Transit Gateway Setup

```powershell
# Delete routes from Jenkins VPC
foreach ($RT in $JENKINS_ROUTE_TABLES.Split()) {
  aws ec2 delete-route --route-table-id $RT --destination-cidr-block 10.1.0.0/16
}

# Delete routes from App VPC
foreach ($RT in $APP_ROUTE_TABLES.Split()) {
  aws ec2 delete-route --route-table-id $RT --destination-cidr-block 10.0.0.0/16
}

# Delete TGW attachments
aws ec2 delete-transit-gateway-vpc-attachment --transit-gateway-attachment-id <jenkins-attachment-id>
aws ec2 delete-transit-gateway-vpc-attachment --transit-gateway-attachment-id <app-attachment-id>

# Wait for attachments to be deleted, then delete TGW
aws ec2 delete-transit-gateway --transit-gateway-id <tgw-id>
```

### Remove VPC

```powershell
# Use CDK to destroy the stack
npx cdk destroy NginxApiClusterStack
```

---

## Cost Considerations

**VPC Costs:**
- NAT Gateway: ~$0.045/hour per gateway × 2 = ~$65/month
- NAT Gateway data processing: $0.045/GB
- VPC itself: Free

**Transit Gateway Costs:**
- TGW attachment: $0.05/hour per attachment × 2 = ~$72/month
- TGW data processing: $0.02/GB

**Total estimated monthly cost for VPC + TGW: ~$137/month** (excluding data transfer)

---

## Next Steps

After completing Phase 1 and 2:
1. ✅ VPC infrastructure deployed
2. ✅ Transit Gateway configured
3. ⏭️ Deploy EKS cluster with Karpenter
4. ⏭️ Install AWS Load Balancer Controller
5. ⏭️ Deploy nginx API application
6. ⏭️ Configure API Gateway
7. ⏭️ Test end-to-end connectivity
