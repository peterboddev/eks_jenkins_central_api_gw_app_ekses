# ALB Investigation - Complete Summary

**Date**: February 11, 2026  
**Status**: Investigation Complete - Node Bootstrap Issue Identified

## Issues Found and Fixed

### 1. ✅ kubectl Authentication Issue
**Problem**: User couldn't access the cluster  
**Root Cause**: IAM user not in aws-auth ConfigMap  
**Fix**: Added IAM user mapping to ClusterStack
```typescript
this.cluster.awsAuth.addUserMapping(
  iam.User.fromUserName(this, 'AdminUser', 'piotrbod'),
  { groups: ['system:masters'], username: 'piotrbod' }
);
```
**Result**: kubectl access working

### 2. ✅ ALB Controller Pods Couldn't Schedule
**Problem**: Pods stuck in Pending state  
**Root Cause**: Controller node has taint `workload-type=jenkins-controller:NoSchedule`  
**Fix**: Added toleration to ALB Controller deployment
```typescript
tolerations: [{
  key: 'workload-type',
  operator: 'Equal',
  value: 'jenkins-controller',
  effect: 'NoSchedule',
}]
```
**Result**: Pods can now be scheduled on controller node

### 3. ✅ Missing IngressClass Resource
**Problem**: ALB Controller needs IngressClass to process Ingress resources  
**Root Cause**: IngressClass not created  
**Fix**: Added IngressClass manifest
```typescript
const ingressClass = props.cluster.addManifest('ALBIngressClass', {
  apiVersion: 'networking.k8s.io/v1',
  kind: 'IngressClass',
  metadata: { name: 'alb' },
  spec: { controller: 'ingress.k8s.aws/alb' },
});
```
**Result**: IngressClass created

### 4. ✅ Ingress Security Group Configuration
**Problem**: Ingress had conflicting annotations  
**Root Cause**: `inbound-cidrs` conflicts with `security-groups`  
**Fix**: Removed `inbound-cidrs` annotation, kept `security-groups`
```typescript
delete ingressManifest.metadata.annotations['alb.ingress.kubernetes.io/inbound-cidrs'];
ingressManifest.metadata.annotations['alb.ingress.kubernetes.io/security-groups'] = 
  props.albSecurityGroup.securityGroupId;
```
**Result**: Ingress properly configured with security group sg-0c3814e4fd764059c

### 5. ✅ Subnet Tags Verified
**Problem**: ALB Controller needs properly tagged subnets  
**Status**: Verified correct
- Public subnets have `kubernetes.io/role/elb=1`
- Public subnets have `kubernetes.io/cluster/jenkins-eks-cluster=shared`
**Result**: Subnet discovery will work

## Current Issue: Node Bootstrap Problem

### Problem
New controller node (i-040b9bd201235bcce) is running but not registering with EKS cluster.

### Symptoms
- EC2 instance state: running
- kubectl get nodes: No resources found
- Node has been running for 5+ minutes without joining

### Likely Root Causes
1. **User data script failure** - Bootstrap script may have errors
2. **IAM role issue** - Node role may lack required permissions
3. **Security group issue** - Node can't reach EKS API endpoint
4. **VPC/subnet issue** - Network connectivity problem

### Investigation Steps Needed
1. Check EC2 instance system logs
2. Verify node IAM role has required policies
3. Check security groups allow node-to-control-plane communication
4. Verify VPC DNS settings
5. Check /var/log/cloud-init-output.log on the instance

## Architecture Summary

### Stack Dependencies
```
JenkinsAlbStack (Security Group)
       ↓
JenkinsApplicationStack (ALB Controller + Ingress)
       ↓
JenkinsEksClusterStack (Cluster + Manifests)
       ↓
JenkinsEksNodeGroupsStack (Node Groups)
```

### Resources Created
- **Security Group**: sg-0c3814e4fd764059c (restricts to home IP + AWS ranges)
- **IngressClass**: alb (controller: ingress.k8s.aws/alb)
- **ALB Controller**: Deployment with tolerations
- **Ingress**: jenkins (with security group annotation)
- **Service Account**: aws-load-balancer-controller (with IRSA)

### Ingress Configuration
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

## Code Changes Made

### lib/jenkins/jenkins-eks-cluster-stack.ts
1. Added IAM import
2. Added user mapping for kubectl access

### lib/jenkins/jenkins-application-stack.ts
1. Added IngressClass resource
2. Added toleration to ALB Controller deployment
3. Removed `inbound-cidrs` annotation from Ingress
4. Added `security-groups` annotation to Ingress
5. Disabled Shield, WAF, WAFv2 in ALB Controller args

## Next Steps to Complete ALB Setup

### Immediate Actions
1. **Fix node bootstrap issue**
   - Check CloudFormation for node group configuration
   - Verify user data script
   - Check IAM role policies
   - Review security group rules

2. **Once node is healthy**
   - Verify ALB Controller pods are Running
   - Check ALB Controller logs for errors
   - Confirm ALB is created
   - Test Jenkins access via ALB URL

### Verification Commands
```bash
# Check node status
kubectl get nodes -o wide

# Check ALB Controller pods
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check ALB Controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check Ingress status
kubectl describe ingress jenkins -n jenkins

# Check for ALB
aws elbv2 describe-load-balancers --region us-west-2 \
  --query "LoadBalancers[?VpcId=='vpc-0e0e3b96921d785ba']"

# Get Jenkins URL (once ALB exists)
kubectl get ingress jenkins -n jenkins \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

## Files Modified
- `lib/jenkins/jenkins-eks-cluster-stack.ts` - Added IAM user mapping
- `lib/jenkins/jenkins-application-stack.ts` - Fixed ALB Controller and Ingress
- `lib/jenkins/jenkins-alb-stack.ts` - Created (security group)
- `security/alb-ip-whitelist.json` - Created (gitignored)
- `security/alb-ip-whitelist.sample.json` - Created (committed)

## Key Learnings

1. **Node taints require tolerations** - System pods need tolerations for tainted nodes
2. **IngressClass is required** - ALB Controller won't process Ingress without it
3. **Annotation conflicts** - `inbound-cidrs` and `security-groups` are mutually exclusive
4. **Subnet tags matter** - ALB Controller uses tags for subnet discovery
5. **Helm requires helm binary** - CDK's Helm support needs helm in Lambda layer
6. **Node bootstrap is critical** - Nodes must successfully run bootstrap script to join cluster

## Recommendations

1. **Add health checks** - Monitor node bootstrap success
2. **Add node group in different AZ** - Avoid single point of failure
3. **Consider managed node groups** - Simpler bootstrap process
4. **Add CloudWatch alarms** - Alert on node join failures
5. **Document bootstrap process** - Make troubleshooting easier

## Related Documentation
- [Jenkins ALB Security Group Setup](docs/deployment/JENKINS_ALB_SECURITY_GROUP.md)
- [Jenkins 3-Stack Architecture](docs/deployment/JENKINS_3_STACK_ARCHITECTURE.md)
- [Deployment Philosophy](.kiro/steering/deployment-philosophy.md)
