# Jenkins ALB Status

## Current Status: TROUBLESHOOTING

**Date**: February 10, 2026, 11:32 PM  
**Issue**: ALB not created after 30+ minutes (expected: 2-5 minutes)

## What We've Done

### 1. Created JenkinsAlbStack ✅
- **Security Group ID**: sg-0c3814e4fd764059c
- **Home IP**: 86.40.16.213/32
- **AWS IP Ranges**: CloudFront and EC2 us-west-2 ranges
- **Status**: Deployed successfully

### 2. Updated Ingress Configuration ✅
- **Removed**: `alb.ingress.kubernetes.io/inbound-cidrs` (conflicts with security groups)
- **Removed**: `alb.ingress.kubernetes.io/subnets` (auto-discovery)
- **Added**: `alb.ingress.kubernetes.io/security-groups: sg-0c3814e4fd764059c`
- **Status**: Ingress manifest updated in CloudFormation

### 3. Deployed Stacks ✅
- JenkinsAlbStack: Deployed
- JenkinsEksClusterStack: Updated (Ingress updated at 23:31:08 UTC)
- JenkinsApplicationStack: Deployed

## Current Problem

**ALB has not been created** despite successful deployment.

CloudFormation shows Ingress was updated:
- Resource: `JenkinsEksClustermanifestJenkinsIngressB84A34F6`
- Status: UPDATE_COMPLETE
- Time: 2026-02-10T23:31:08.909000+00:00

However, no ALB exists:
```bash
aws elbv2 describe-load-balancers --region us-west-2 \
  --query "LoadBalancers[?contains(LoadBalancerName, 'k8s')]"
# Returns: []
```

## kubectl Authentication Issue

Cannot verify cluster state due to authentication errors:
```
Error: the server has asked for the client to provide credentials
```

This prevents us from:
- Checking ALB Controller pod status
- Viewing ALB Controller logs
- Inspecting Ingress resource details
- Verifying security group annotation

## Possible Root Causes

1. **ALB Controller pods not running**
   - Deployment may have failed
   - Image pull issues
   - Resource constraints

2. **Ingress configuration error**
   - Security group annotation malformed
   - Missing required annotations
   - Conflicting annotations

3. **Subnet discovery failure**
   - Public subnets missing `kubernetes.io/role/elb=1` tag
   - ALB Controller can't find suitable subnets

4. **IAM permissions issue**
   - ALB Controller role lacks required permissions
   - Trust policy misconfigured

5. **ALB Controller not watching Ingress**
   - Controller may not be processing Ingress resources
   - IngressClass mismatch

## Verification Steps (Once kubectl Works)

### 1. Check ALB Controller Status
```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

Expected: 2 pods running (replicas: 2)

### 2. Check ALB Controller Logs
```bash
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller --tail=100
```

Look for:
- Errors processing Ingress
- IAM permission errors
- Subnet discovery errors
- Security group errors

### 3. Inspect Ingress Resource
```bash
kubectl describe ingress jenkins -n jenkins
```

Check:
- Annotations (especially security-groups)
- Events (errors or warnings)
- Status (should show ALB address when ready)

### 4. Verify Ingress Annotations
```bash
kubectl get ingress jenkins -n jenkins -o yaml
```

Should include:
```yaml
metadata:
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /login
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
    alb.ingress.kubernetes.io/security-groups: sg-0c3814e4fd764059c
    alb.ingress.kubernetes.io/tags: Environment=production,Application=jenkins
spec:
  ingressClassName: alb
```

### 5. Check Subnet Tags
```bash
aws ec2 describe-subnets --region us-west-2 \
  --filters "Name=vpc-id,Values=vpc-0e0e3b96921d785ba" \
  --query 'Subnets[?MapPublicIpOnLaunch==`true`].{ID:SubnetId,Tags:Tags}' \
  --output table
```

Public subnets must have:
- `kubernetes.io/role/elb=1`
- `kubernetes.io/cluster/jenkins-eks-cluster=shared`

## Code Changes Made

### lib/jenkins/jenkins-application-stack.ts (lines 780-800)
```typescript
// 9. Ingress (depends on Service and ALB Controller)
const ingressManifest = loadManifest('ingress.yaml');

// Remove hardcoded subnet annotation - let ALB controller auto-discover
if (ingressManifest.metadata && ingressManifest.metadata.annotations) {
  delete ingressManifest.metadata.annotations['alb.ingress.kubernetes.io/subnets'];
  // Remove inbound-cidrs annotation - we're using security groups instead
  delete ingressManifest.metadata.annotations['alb.ingress.kubernetes.io/inbound-cidrs'];
}

// Add security group annotation
if (!ingressManifest.metadata.annotations) {
  ingressManifest.metadata.annotations = {};
}
ingressManifest.metadata.annotations['alb.ingress.kubernetes.io/security-groups'] = 
  props.albSecurityGroup.securityGroupId;

const ingress = props.cluster.addManifest('JenkinsIngress', ingressManifest);
ingress.node.addDependency(service);
ingress.node.addDependency(albControllerManifest);
```

## Resources Created

- **Security Group**: sg-0c3814e4fd764059c
- **ALB Controller Service Account**: aws-load-balancer-controller (kube-system)
- **ALB Controller IAM Role**: JenkinsEksClusterStack-JenkinsEksClusterALBControll-D23yubxRkuv9
- **Ingress Resource**: jenkins (jenkins namespace)
- **ALB**: NOT CREATED (this is the problem)

## Architecture

```
JenkinsAlbStack (Security Group)
       ↓
JenkinsApplicationStack (Ingress with SG annotation)
       ↓
JenkinsEksClusterStack (Cluster + Ingress manifest)
       ↓
ALB Controller (should create ALB)
       ↓
ALB (NOT CREATED - troubleshooting needed)
```

## Next Steps

1. **Resolve kubectl authentication** to inspect cluster state
2. **Check ALB Controller pod status** and logs
3. **Verify Ingress annotations** were applied correctly
4. **Check subnet tags** for ALB discovery
5. **Review ALB Controller IAM permissions**

## Configuration Files

- Security group stack: `lib/jenkins/jenkins-alb-stack.ts`
- Application stack: `lib/jenkins/jenkins-application-stack.ts` (lines 780-800)
- IP whitelist config: `security/alb-ip-whitelist.json` (gitignored)
- Sample config: `security/alb-ip-whitelist.sample.json` (committed)
- Ingress manifest: `k8s/jenkins/ingress.yaml`

## Related Documentation

- [Jenkins ALB Security Group Setup](docs/deployment/JENKINS_ALB_SECURITY_GROUP.md)
- [Jenkins 3-Stack Architecture](docs/deployment/JENKINS_3_STACK_ARCHITECTURE.md)
- [Deployment Philosophy](.kiro/steering/deployment-philosophy.md)
