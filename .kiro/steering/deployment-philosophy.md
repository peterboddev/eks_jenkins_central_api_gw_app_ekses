---
inclusion: always
---

# Deployment Philosophy

## Core Principle

**Everything is managed through CDK code and executed automatically during deployment.**

This project follows a strict infrastructure-as-code approach where all AWS resources and Kubernetes manifests are created programmatically through AWS CDK. There are no manual steps, placeholder replacements, or post-deployment scripts required.

## Key Tenets

### 1. No Manual Commands on EKS Cluster

- You should never need to run `kubectl apply` manually from your local machine
- All Kubernetes resources are created by CDK during stack deployment
- Service accounts, ConfigMaps, Deployments, Services, and Ingresses are all managed by CDK

### 2. No Placeholder Replacements

- No scripts that replace `ACCOUNT_ID`, `EFS_FILE_SYSTEM_ID`, or other placeholders
- CDK automatically injects correct values when creating resources
- IAM role ARNs, EFS IDs, VPC IDs, etc. are all resolved at deployment time

### 3. Git Push Managed

- After CDK deployment completes, everything is ready to use
- Changes to infrastructure are made by updating CDK code and redeploying
- No manual intervention required between code commit and working infrastructure

### 4. Service Accounts Created Programmatically

- All Kubernetes service accounts are created using `cluster.addServiceAccount()`
- This automatically creates the IAM role and adds the correct IRSA annotation
- No separate YAML files with placeholders needed

## How It Works

### CDK Deployment Flow

```
1. CDK synthesizes CloudFormation templates
   ↓
2. CloudFormation creates AWS resources (VPC, EKS, EFS, etc.)
   ↓
3. CDK creates Kubernetes resources via cluster.addManifest()
   ↓
4. Service accounts are created with correct IAM role ARNs
   ↓
5. All resources are ready to use immediately
```

### Service Account Creation Example

**OLD APPROACH (Don't do this):**
```typescript
// Create IAM role manually with CfnRole
const role = new iam.CfnRole(this, 'MyRole', {
  roleName: 'my-role',
  assumeRolePolicyDocument: { /* complex trust policy */ },
  policies: [ /* inline policies */ ],
});

// Load service account YAML with placeholder
const sa = loadManifest('serviceaccount.yaml'); // Has ACCOUNT_ID placeholder
cluster.addManifest('MyServiceAccount', sa);

// Run script to replace placeholders (WRONG!)
// ./scripts/update-k8s-manifests.sh
```

**NEW APPROACH (Correct):**
```typescript
// Create service account - CDK handles everything
const serviceAccount = cluster.addServiceAccount('MyServiceAccount', {
  name: 'my-service-account',
  namespace: 'my-namespace',
});

// Attach policy to the auto-created role
serviceAccount.role.attachInlinePolicy(new iam.Policy(this, 'MyPolicy', {
  document: myPolicyDocument,
}));

// Done! No placeholders, no scripts, no manual steps
```

### Benefits

1. **Portability**: Deploy to any AWS account without modifications
2. **Repeatability**: Same code produces same infrastructure every time
3. **Simplicity**: No confusing scripts or manual steps
4. **Safety**: No risk of forgetting to run a script or replace a placeholder
5. **Auditability**: All changes tracked in git, no manual modifications

## What This Means for Development

### When Adding New Kubernetes Resources

1. Create the resource using `cluster.addManifest()` in CDK
2. Use CDK constructs to reference other resources (no hardcoded IDs)
3. Set up dependencies using `.node.addDependency()`
4. Deploy with `cdk deploy`

### When Adding New Service Accounts

1. Use `cluster.addServiceAccount()` to create both K8s SA and IAM role
2. Attach policies using `serviceAccount.role.attachInlinePolicy()`
3. CDK automatically adds the IRSA annotation
4. No YAML files with placeholders needed

### When Updating Infrastructure

1. Modify CDK code
2. Run `npm run build`
3. Run `cdk deploy`
4. Everything updates automatically

## Files to Ignore

The following files contain placeholders and are **NOT** used by CDK deployment:

- `k8s/jenkins/serviceaccount.yaml` - Replaced by CDK service account creation
- `k8s/efs-csi-driver/serviceaccount.yaml` - Not needed (using native NFS)
- `k8s/cluster-autoscaler/serviceaccount.yaml` - Replaced by CDK service account creation
- `k8s/efs-csi-driver/storageclass.yaml` - Replaced by CDK StorageClass creation
- `k8s/karpenter-bootstrap-nodegroup.yaml` - Has placeholders, reference only

These files are kept for reference but are not applied during deployment.

## Deployment Commands

### Full Deployment

```bash
# Deploy everything
./scripts/deploy-infrastructure.sh

# Or manually:
cdk deploy JenkinsNetworkStack NginxApiNetworkStack --require-approval never
cdk deploy JenkinsStorageStack --require-approval never
cdk deploy TransitGatewayStack --require-approval never
cdk deploy JenkinsEksClusterStack --require-approval never
cdk deploy JenkinsEksNodeGroupsStack --require-approval never
cdk deploy JenkinsApplicationStack --require-approval never
cdk deploy NginxApiClusterStack --require-approval never
```

### Iterative Development (Fast!)

The Jenkins infrastructure is split into 3 stacks for faster iteration:

```bash
# Update Jenkins config (plugins, JCasC, monitoring) - 3-5 min
npm run build
cdk deploy JenkinsApplicationStack --require-approval never

# Change node groups (instance types, scaling) - 5-10 min
npm run build
cdk deploy JenkinsEksNodeGroupsStack --require-approval never

# Upgrade EKS cluster version - 15-20 min
npm run build
cdk deploy JenkinsEksClusterStack --require-approval never
```

**Benefit**: Most changes only require redeploying ApplicationStack (3-5 min vs 20-30 min)

### Verify Deployment

```bash
# Configure kubectl
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2

# Check resources
kubectl get nodes
kubectl get pods -n jenkins
kubectl get ingress -n jenkins

# Get Jenkins URL
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

That's it! No other steps required.

## Common Mistakes to Avoid

### ❌ Don't Create Separate IAM Roles

```typescript
// WRONG - Creates role separately from service account
const role = new iam.CfnRole(this, 'MyRole', { /* ... */ });
const sa = cluster.addServiceAccount('MySA', { /* ... */ });
// Now you have TWO roles and confusion!
```

### ❌ Don't Use Placeholder Scripts

```bash
# WRONG - No scripts should be needed
./scripts/update-k8s-manifests.sh
```

### ❌ Don't Apply Manifests Manually

```bash
# WRONG - CDK does this automatically
kubectl apply -f k8s/jenkins/serviceaccount.yaml
```

### ✅ Do Use CDK Constructs

```typescript
// CORRECT - One call creates both K8s SA and IAM role
const sa = cluster.addServiceAccount('MySA', {
  name: 'my-service-account',
  namespace: 'my-namespace',
});

sa.role.attachInlinePolicy(new iam.Policy(this, 'MyPolicy', {
  document: policyDocument,
}));
```

## Summary

The deployment philosophy is simple: **Write CDK code, run `cdk deploy`, everything works.**

No scripts, no placeholders, no manual steps. Everything is automated and managed through code.
