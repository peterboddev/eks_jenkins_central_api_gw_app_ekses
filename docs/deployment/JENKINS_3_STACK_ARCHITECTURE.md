# Jenkins 3-Stack Architecture

## Overview

The Jenkins EKS infrastructure is split into **3 separate CloudFormation stacks** for faster iteration and isolated failure domains. This architecture allows you to update Jenkins configuration in 3-5 minutes instead of waiting 20-30 minutes for a full cluster redeployment.

## The 3 Stacks

### 1. JenkinsEksClusterStack (Foundational Layer)

**Purpose**: Creates the foundational EKS cluster infrastructure

**Resources**:
- EKS cluster with Kubernetes 1.32
- OIDC provider for IRSA (IAM Roles for Service Accounts)
- Cluster logging (API, Audit, Authenticator, Controller Manager, Scheduler)
- kubectl Lambda layer for CDK operations

**Deployment Time**: 15-20 minutes

**Change Frequency**: Rarely (only for cluster version upgrades)

**When to Redeploy**:
- Upgrading Kubernetes version
- Changing cluster endpoint access configuration
- Modifying cluster logging settings

**CloudFormation Outputs**:
- Cluster name, ARN, endpoint
- OIDC provider ARN and issuer URL
- Cluster role ARN

---

### 2. JenkinsEksNodeGroupsStack (Compute Layer)

**Purpose**: Manages EKS node groups and autoscaling

**Resources**:
- Controller node group (on-demand t4g.xlarge instances)
  - Min: 1, Max: 2, Desired: 1
  - Labels: `workload-type=jenkins-controller`
  - Taints: `workload-type=jenkins-controller:NoSchedule`
- Agent node group (spot instances: m5.large, m5.xlarge, m5a.large, m5a.xlarge, m6i.large, m6i.xlarge)
  - Min: 0, Max: 10, Desired: 0
  - Labels: `workload-type=jenkins-agent`, `node-lifecycle=spot`
  - Auto-discovery tags for Cluster Autoscaler
- Cluster Autoscaler service account with IRSA
- Jenkins controller security group (ports 8080, 50000)
- Jenkins agent security group (ephemeral ports)

**Deployment Time**: 5-10 minutes

**Change Frequency**: Occasionally (when scaling or changing instance types)

**When to Redeploy**:
- Changing instance types
- Adjusting node group scaling limits
- Modifying node labels or taints
- Updating security group rules

**CloudFormation Outputs**:
- Controller and agent node group names and ARNs
- Node role ARNs
- Security group IDs
- Cluster Autoscaler role ARN

---

### 3. JenkinsApplicationStack (Application Layer)

**Purpose**: Deploys Jenkins application and supporting services

**Resources**:
- AWS Load Balancer Controller (Helm chart)
- Jenkins service account with IRSA (infrastructure deployment permissions)
- S3 artifacts bucket (versioned, encrypted, lifecycle policies)
- GitHub webhook secret (AWS Secrets Manager)
- Static PersistentVolume for EFS (native NFS)
- StorageClass for manual binding
- All Jenkins Kubernetes manifests:
  - Namespace
  - RBAC (Role, RoleBinding, ClusterRole, ClusterRoleBinding)
  - PersistentVolumeClaim
  - ConfigMaps (plugins, JCasC, agent pod template)
  - Secrets sync job
  - StatefulSet (Jenkins controller)
  - Service (ClusterIP)
  - Ingress (ALB)
- CloudWatch alarms (cluster health, node failures, disk space, pending pods, spot interruptions)
- SNS topic for alarm notifications

**Deployment Time**: 3-5 minutes

**Change Frequency**: Frequently (when updating Jenkins config, plugins, or monitoring)

**When to Redeploy**:
- Updating Jenkins plugins
- Modifying JCasC configuration
- Changing agent pod templates
- Updating ALB settings
- Modifying CloudWatch alarms
- Changing S3 lifecycle policies

**CloudFormation Outputs**:
- S3 bucket name and ARN
- GitHub webhook secret ARN and retrieval command
- Jenkins service account role ARN
- All CloudWatch alarm ARNs
- ALB controller status
- EFS NFS server address

---

## Deployment Order

The stacks must be deployed in this order due to dependencies:

```
1. JenkinsNetworkStack (VPC, subnets, route tables)
   ↓
2. JenkinsStorageStack (EFS file system + backups)
   ↓
3. JenkinsEksClusterStack (EKS cluster only)
   ↓
4. JenkinsEksNodeGroupsStack (Node groups + Cluster Autoscaler)
   ↓
5. JenkinsApplicationStack (Jenkins app + K8s resources)
```

**Dependency Graph**:
```
JenkinsNetworkStack
  ├─→ JenkinsStorageStack
  └─→ JenkinsEksClusterStack
        └─→ JenkinsEksNodeGroupsStack
              └─→ JenkinsApplicationStack
```

## Benefits of 3-Stack Architecture

### 1. Faster Iteration
- **Before**: Change Jenkins config → redeploy entire stack → 20-30 minutes
- **After**: Change Jenkins config → redeploy ApplicationStack → 3-5 minutes
- **Speedup**: 4-6x faster for common changes

### 2. Isolated Failures
- ALB configuration error → only ApplicationStack fails, cluster stays up
- Node group issue → only NodeGroupsStack fails, cluster and app stay up
- Cluster upgrade issue → only ClusterStack fails, can rollback independently

### 3. Independent Scaling
- Add/remove node groups → only redeploy NodeGroupsStack
- Change instance types → only redeploy NodeGroupsStack
- No need to touch cluster or application

### 4. Clear Separation of Concerns
- **Infrastructure** (ClusterStack): Rarely changes, foundational
- **Compute** (NodeGroupsStack): Occasionally changes, scaling
- **Application** (ApplicationStack): Frequently changes, configuration

### 5. Reduced Risk
- Smaller change sets per deployment
- Easier to identify what changed if something breaks
- Faster rollback (only rollback the affected stack)

## Common Workflows

### Update Jenkins Configuration

```bash
# Edit Jenkins configuration
vim k8s/jenkins/jcasc-main-configmap.yaml

# Build and deploy (3-5 minutes)
npm run build
cdk deploy JenkinsApplicationStack --require-approval never
```

### Add Jenkins Plugins

```bash
# Edit plugins list
vim k8s/jenkins/plugins-configmap.yaml

# Build and deploy (3-5 minutes)
npm run build
cdk deploy JenkinsApplicationStack --require-approval never
```

### Change Node Group Instance Types

```bash
# Edit node group configuration
vim lib/jenkins/jenkins-eks-nodegroups-stack.ts

# Build and deploy (5-10 minutes)
npm run build
cdk deploy JenkinsEksNodeGroupsStack --require-approval never
```

### Upgrade EKS Cluster Version

```bash
# Edit cluster version
vim lib/jenkins/jenkins-eks-cluster-stack.ts
# Change: version: eks.KubernetesVersion.V1_32 → V1_33

# Build and deploy (15-20 minutes)
npm run build
cdk deploy JenkinsEksClusterStack --require-approval never

# Then upgrade node groups to match
cdk deploy JenkinsEksNodeGroupsStack --require-approval never
```

### Update CloudWatch Alarms

```bash
# Edit alarm configuration
vim lib/jenkins/jenkins-application-stack.ts

# Build and deploy (3-5 minutes)
npm run build
cdk deploy JenkinsApplicationStack --require-approval never
```

## Stack Dependencies

### JenkinsEksClusterStack Dependencies
- **Requires**: JenkinsNetworkStack (VPC, subnets)
- **Exports**: Cluster object, VPC reference
- **Used by**: JenkinsEksNodeGroupsStack, JenkinsApplicationStack

### JenkinsEksNodeGroupsStack Dependencies
- **Requires**: JenkinsEksClusterStack (cluster object), JenkinsNetworkStack (VPC, subnets)
- **Exports**: Node group references, security groups
- **Used by**: None (leaf stack for compute resources)

### JenkinsApplicationStack Dependencies
- **Requires**: JenkinsEksClusterStack (cluster object), JenkinsStorageStack (EFS), JenkinsNetworkStack (VPC)
- **Exports**: S3 bucket, service account roles, alarm ARNs
- **Used by**: None (leaf stack for application resources)

## CloudFormation Outputs

All stacks export their outputs with `exportName` for cross-stack references:

### From JenkinsEksClusterStack
- `JenkinsEksClusterName`
- `JenkinsEksClusterArn`
- `JenkinsEksClusterEndpoint`
- `JenkinsEksClusterVersion`
- `JenkinsEksClusterRoleArn`
- `JenkinsEksOidcProviderArn`
- `JenkinsEksOidcProviderIssuer`

### From JenkinsEksNodeGroupsStack
- `JenkinsEksControllerNodeGroupName`
- `JenkinsEksControllerNodeGroupArn`
- `JenkinsEksControllerNodeRoleArn`
- `JenkinsEksAgentNodeGroupName`
- `JenkinsEksAgentNodeGroupArn`
- `JenkinsEksAgentNodeRoleArn`
- `JenkinsEksClusterAutoscalerRoleArn`
- `JenkinsEksControllerSecurityGroupId`
- `JenkinsEksAgentSecurityGroupId`

### From JenkinsApplicationStack
- `JenkinsEksArtifactsBucketName`
- `JenkinsEksArtifactsBucketArn`
- `JenkinsGitHubWebhookSecretArn`
- `JenkinsGitHubWebhookSecretName`
- `JenkinsEksServiceAccountRoleArn`
- `JenkinsEksAlarmTopicArn`
- `JenkinsEksClusterHealthAlarmArn`
- `JenkinsEksNodeFailureAlarmArn`
- `JenkinsEksDiskSpaceAlarmArn`
- `JenkinsEksPendingPodsAlarmArn`
- `JenkinsEksSpotInterruptionAlarmArn`
- `JenkinsEksEfsNfsServer`

## Cleanup

Delete stacks in reverse order:

```bash
# Delete application layer
cdk destroy JenkinsApplicationStack --force

# Delete compute layer
cdk destroy JenkinsEksNodeGroupsStack --force

# Delete cluster layer
cdk destroy JenkinsEksClusterStack --force

# Delete storage layer
cdk destroy JenkinsStorageStack --force

# Delete network layer
cdk destroy JenkinsNetworkStack --force
```

## Troubleshooting

### Stack Dependency Errors

**Error**: "Export JenkinsEksClusterName cannot be deleted as it is in use by..."

**Solution**: Delete dependent stacks first (reverse order)

### Node Group Update Failures

**Error**: Node group update fails due to pods running

**Solution**: 
1. Drain nodes manually: `kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data`
2. Retry deployment
3. Or set `maxUnavailable: 1` in node group update config (already configured)

### Application Stack Deployment Timeout

**Error**: Helm chart installation timeout

**Solution**:
1. Check ALB controller logs: `kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller`
2. Verify IAM permissions for ALB controller service account
3. Check VPC subnet tags for ALB auto-discovery

## Best Practices

1. **Always deploy in order**: Network → Storage → Cluster → NodeGroups → Application
2. **Test in dev first**: Deploy to dev account before production
3. **Use version control**: Commit CDK changes before deploying
4. **Monitor deployments**: Watch CloudFormation events during deployment
5. **Keep stacks small**: Don't add unrelated resources to these stacks
6. **Document changes**: Update this doc when adding new resources
7. **Use exports**: Export values that other stacks might need
8. **Set dependencies**: Use `addDependency()` to enforce deployment order

## Migration from Monolithic Stack

If you have the old `JenkinsEksStack`, migrate to the 3-stack architecture:

1. **Backup data**: Ensure EFS and S3 data is backed up
2. **Delete old stack**: `cdk destroy JenkinsEksStack --force`
3. **Deploy new stacks**: Follow deployment order above
4. **Verify**: Check all resources are created correctly
5. **Test**: Verify Jenkins is accessible and functional

**Note**: The old `lib/eks_jenkins-stack.ts` file should be deleted after migration.

## Summary

The 3-stack architecture provides:
- ✅ **4-6x faster** iteration for common changes
- ✅ **Isolated failures** - one stack failure doesn't affect others
- ✅ **Independent scaling** - change compute without touching cluster
- ✅ **Clear separation** - infrastructure vs compute vs application
- ✅ **Reduced risk** - smaller change sets, easier rollback

Most Jenkins configuration changes now take **3-5 minutes** instead of 20-30 minutes!
