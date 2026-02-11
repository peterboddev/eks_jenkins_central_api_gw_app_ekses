# Jenkins ALB Security Group Setup

## Overview

A new `JenkinsAlbStack` has been created to provide IP-based access control for the Jenkins Application Load Balancer. This adds an additional security layer beyond the ingress configuration.

## What Was Created

### New Stack: `lib/jenkins/jenkins-alb-stack.ts`

This stack creates a security group that restricts ALB access to:
- **Your home IP address** (configurable)
- **AWS IP ranges** (for AWS services like CloudFront, EC2 in us-west-2)

### Stack Architecture

```
JenkinsNetworkStack (VPC)
    ↓
JenkinsAlbStack (Security Group) ← NEW
    ↓
JenkinsApplicationStack (ALB with SG attached)
```

## Configuration Required

### Step 1: Create IP Whitelist Config

The IP whitelist is stored in `security/alb-ip-whitelist.json` (gitignored for security).

**Create the config file:**
```bash
# Copy the sample file
cp security/alb-ip-whitelist.sample.json security/alb-ip-whitelist.json

# Find your IP
curl https://checkip.amazonaws.com
```

**Edit `security/alb-ip-whitelist.json`:**
```json
{
  "homeIp": "YOUR.IP.ADDRESS/32",
  "additionalIps": [
    "OFFICE.IP.ADDRESS/32",
    "VPN.IP.ADDRESS/32"
  ]
}
```

**Important:** 
- The actual config file (`alb-ip-whitelist.json`) is in `.gitignore` and won't be committed
- The sample file (`alb-ip-whitelist.sample.json`) is committed as a template
- Always use `/32` CIDR for single IP addresses

### Step 2: Deploy the Stack

```bash
# Build the project
npm run build

# Deploy the ALB stack
cdk deploy JenkinsAlbStack --require-approval never

# Redeploy the application stack to use the new security group
cdk deploy JenkinsApplicationStack --require-approval never
```

## How It Works

### Security Group Rules

The security group allows:

1. **HTTP (port 80)** from:
   - Your home IP
   - AWS IP ranges (CloudFront, EC2 us-west-2)

2. **HTTPS (port 443)** from:
   - Your home IP
   - AWS IP ranges (CloudFront, EC2 us-west-2)

### Integration with Ingress

The security group is automatically attached to the ALB via the ingress annotation:

```yaml
annotations:
  alb.ingress.kubernetes.io/security-groups: sg-xxxxx
```

This is done programmatically in `JenkinsApplicationStack` - no manual YAML editing needed.

## AWS IP Ranges Included

The following AWS IP ranges are whitelisted for us-west-2:

**CloudFront:**
- 13.32.0.0/15
- 13.35.0.0/16
- 52.84.0.0/15
- 54.192.0.0/16
- 54.230.0.0/16
- 99.84.0.0/16
- 143.204.0.0/16

**EC2 us-west-2:**
- 35.80.0.0/12
- 44.224.0.0/11
- 52.32.0.0/11
- 54.68.0.0/14
- 54.184.0.0/13
- 54.200.0.0/13
- 54.212.0.0/15
- 54.214.0.0/16
- 54.244.0.0/16
- 54.245.0.0/16

## Adding More IPs

To add additional IP addresses (e.g., office IPs, VPN endpoints), simply edit `security/alb-ip-whitelist.json`:

```json
{
  "homeIp": "86.40.16.213/32",
  "additionalIps": [
    "203.0.113.10/32",
    "198.51.100.20/32"
  ]
}
```

Then rebuild and redeploy:
```bash
npm run build
cdk deploy JenkinsAlbStack --require-approval never
```

**No code changes needed** - just update the config file!

## Stack Outputs

After deployment, the stack provides:

- **AlbSecurityGroupIdOutput**: The security group ID (exported as `JenkinsAlbSecurityGroupId`)
- **HomeIpReminderOutput**: Reminder to update home IP if not configured

## Verification

After deployment, verify the security group:

```bash
# Get the security group ID
aws cloudformation describe-stacks \
  --stack-name JenkinsAlbStack \
  --query 'Stacks[0].Outputs[?OutputKey==`AlbSecurityGroupIdOutput`].OutputValue' \
  --output text

# View security group rules
aws ec2 describe-security-groups \
  --group-ids <security-group-id> \
  --query 'SecurityGroups[0].IpPermissions'
```

## Troubleshooting

### Can't Access Jenkins After Deployment

1. **Check your current IP:**
   ```bash
   curl https://checkip.amazonaws.com
   ```

2. **Verify it matches the configured IP in `security/alb-ip-whitelist.json`**

3. **If your IP changed, update the config and redeploy:**
   ```bash
   # Edit security/alb-ip-whitelist.json
   npm run build
   cdk deploy JenkinsAlbStack --require-approval never
   ```

### Access from Different Location

If you need to access Jenkins from a different location (e.g., traveling), edit `security/alb-ip-whitelist.json`:

**Option 1: Temporarily allow all IPs (NOT RECOMMENDED)**
```json
{
  "homeIp": "0.0.0.0/0",
  "additionalIps": []
}
```

**Option 2: Add multiple IPs (RECOMMENDED)**
```json
{
  "homeIp": "1.2.3.4/32",
  "additionalIps": [
    "5.6.7.8/32",
    "9.10.11.12/32"
  ]
}
```

Then redeploy:
```bash
npm run build
cdk deploy JenkinsAlbStack --require-approval never
```

## Security Best Practices

1. **Always use /32 CIDR** for single IPs (most restrictive)
2. **Update IP when it changes** (especially if you have dynamic IP)
3. **Use VPN** for production environments instead of home IP
4. **Monitor access logs** via CloudWatch
5. **Enable WAF** for additional protection (future enhancement)

## Cost Impact

- **Security Group**: Free
- **ALB**: No additional cost (already deployed)
- **Data Transfer**: Standard AWS data transfer rates apply

## Related Documentation

- [Jenkins 3-Stack Architecture](./JENKINS_3_STACK_ARCHITECTURE.md)
- [Deployment Philosophy](../../.kiro/steering/deployment-philosophy.md)
- [Hardcoded Values Audit](../../HARDCODED_VALUES_AUDIT.md)

## Future Enhancements

1. **AWS WAF Integration**: Add web application firewall rules
2. **CloudFront Distribution**: Add CDN layer with additional security
3. **Cognito Authentication**: Add user authentication before ALB
4. **IP Allowlist from S3**: Store allowed IPs in S3 for dynamic updates
5. **VPN Integration**: Replace home IP with VPN endpoint
