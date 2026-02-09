# Secrets Management Guide

## Overview

This guide covers how to properly manage secrets in the Jenkins EKS infrastructure using AWS Secrets Manager and Kubernetes Secrets.

## Architecture

```
┌─────────────────────────────────────────┐
│  AWS Secrets Manager                    │
│  ├── jenkins/github-webhook-secret      │
│  ├── jenkins/admin-password             │
│  └── jenkins/github-token               │
└────────────────┬────────────────────────┘
                 │
                 │ IAM Role (IRSA)
                 ▼
┌─────────────────────────────────────────┐
│  Kubernetes Secrets                     │
│  ├── github-webhook-secret              │
│  └── jenkins-admin-credentials          │
└────────────────┬────────────────────────┘
                 │
                 │ Volume Mount
                 ▼
┌─────────────────────────────────────────┐
│  Jenkins Pod                            │
│  Environment Variables / Files          │
└─────────────────────────────────────────┘
```

## Why AWS Secrets Manager?

### Benefits

- ✅ **Centralized Management**: Single source of truth for all secrets
- ✅ **Automatic Rotation**: Built-in rotation for supported services
- ✅ **Audit Logging**: All access logged to CloudTrail
- ✅ **Encryption**: Encrypted at rest with AWS KMS
- ✅ **Fine-grained Access**: IAM policies control who can access what
- ✅ **Version History**: Track changes and rollback if needed
- ✅ **Cross-Account**: Share secrets across AWS accounts
- ✅ **Compliance**: Meets security compliance requirements

### vs. Local Files

| Feature | AWS Secrets Manager | Local Files |
|---------|-------------------|-------------|
| Security | ✅ Encrypted, audited | ❌ Plain text, no audit |
| Rotation | ✅ Automatic | ❌ Manual |
| Access Control | ✅ IAM policies | ❌ File permissions |
| Sharing | ✅ Cross-account | ❌ Manual copy |
| Compliance | ✅ Audit trail | ❌ No trail |
| Cost | ~$0.40/secret/month | Free |
| **Use Case** | **Production** | **Development only** |

## Secrets to Manage

### 1. GitHub Webhook Secret

**Purpose**: Validates webhook requests from GitHub

**Storage**:
```bash
# Create
SECRET=$(openssl rand -hex 32)
aws secretsmanager create-secret \
  --name jenkins/github-webhook-secret \
  --description "GitHub webhook secret for Jenkins CI/CD" \
  --secret-string "$SECRET" \
  --region us-west-2

# Retrieve
aws secretsmanager get-secret-value \
  --secret-id jenkins/github-webhook-secret \
  --region us-west-2 \
  --query SecretString \
  --output text
```

**Usage**:
- GitHub webhook configuration
- Jenkins GitHub plugin validation

### 2. Jenkins Admin Password

**Purpose**: Initial Jenkins admin password

**Storage**:
```bash
# Get from Jenkins pod
ADMIN_PASSWORD=$(kubectl exec -n jenkins jenkins-controller-0 -- \
  cat /var/jenkins_home/secrets/initialAdminPassword)

# Store in Secrets Manager
aws secretsmanager create-secret \
  --name jenkins/admin-password \
  --description "Jenkins admin initial password" \
  --secret-string "$ADMIN_PASSWORD" \
  --region us-west-2
```

### 3. GitHub Personal Access Token (Optional)

**Purpose**: For private repositories or GitHub API access

**Storage**:
```bash
# Create token at: https://github.com/settings/tokens
# Scopes needed: repo, admin:repo_hook

aws secretsmanager create-secret \
  --name jenkins/github-token \
  --description "GitHub personal access token for Jenkins" \
  --secret-string "<YOUR_GITHUB_TOKEN>" \
  --region us-west-2
```

## Implementation Methods

### Method 1: Manual Sync (Simple)

Manually sync secrets from AWS Secrets Manager to Kubernetes:

```bash
# Retrieve from Secrets Manager
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id jenkins/github-webhook-secret \
  --region us-west-2 \
  --query SecretString \
  --output text)

# Create Kubernetes secret
kubectl create secret generic github-webhook-secret \
  --from-literal=secret="$SECRET" \
  -n jenkins
```

**Pros**: Simple, no additional components
**Cons**: Manual updates, no automatic rotation

### Method 2: AWS Secrets Manager CSI Driver (Advanced)

Automatically mount secrets from AWS Secrets Manager:

**1. Install Secrets Store CSI Driver:**

```bash
helm repo add secrets-store-csi-driver \
  https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts

helm install csi-secrets-store \
  secrets-store-csi-driver/secrets-store-csi-driver \
  --namespace kube-system
```

**2. Install AWS Provider:**

```bash
kubectl apply -f \
  https://raw.githubusercontent.com/aws/secrets-store-csi-driver-provider-aws/main/deployment/aws-provider-installer.yaml
```

**3. Create SecretProviderClass:**

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: jenkins-secrets
  namespace: jenkins
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "jenkins/github-webhook-secret"
        objectType: "secretsmanager"
        objectAlias: "webhook-secret"
      - objectName: "jenkins/admin-password"
        objectType: "secretsmanager"
        objectAlias: "admin-password"
```

**4. Mount in Pod:**

```yaml
volumeMounts:
  - name: secrets-store
    mountPath: "/mnt/secrets"
    readOnly: true

volumes:
  - name: secrets-store
    csi:
      driver: secrets-store.csi.k8s.io
      readOnly: true
      volumeAttributes:
        secretProviderClass: "jenkins-secrets"
```

**Pros**: Automatic sync, rotation support
**Cons**: More complex setup, additional components

### Method 3: External Secrets Operator (Enterprise)

Use External Secrets Operator for advanced secret management:

```bash
helm repo add external-secrets \
  https://charts.external-secrets.io

helm install external-secrets \
  external-secrets/external-secrets \
  -n external-secrets-system \
  --create-namespace
```

**Pros**: Advanced features, multi-cloud support
**Cons**: Most complex, additional maintenance

## IAM Permissions

Jenkins pods need IAM permissions to access Secrets Manager:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-west-2:*:secret:jenkins/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": [
        "arn:aws:kms:us-west-2:*:key/*"
      ],
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "secretsmanager.us-west-2.amazonaws.com"
        }
      }
    }
  ]
}
```

Add this to the Jenkins controller IAM role via CDK or manually.

## Secret Rotation

### Automatic Rotation (Supported Services)

AWS Secrets Manager supports automatic rotation for:
- RDS databases
- Redshift clusters
- DocumentDB clusters

### Manual Rotation (Custom Secrets)

For custom secrets like webhook secrets:

```bash
# Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# Update in Secrets Manager
aws secretsmanager update-secret \
  --secret-id jenkins/github-webhook-secret \
  --secret-string "$NEW_SECRET" \
  --region us-west-2

# Update in GitHub webhook settings
# Update in Jenkins configuration
# Sync to Kubernetes secret
```

**Rotation Schedule**: Every 90 days recommended

## Best Practices

### 1. Naming Convention

Use hierarchical naming:
```
<service>/<environment>/<secret-name>
```

Examples:
- `jenkins/prod/github-webhook-secret`
- `jenkins/dev/admin-password`
- `app/prod/database-password`

### 2. Tagging

Tag all secrets for organization:
```bash
aws secretsmanager tag-resource \
  --secret-id jenkins/github-webhook-secret \
  --tags Key=Project,Value=Jenkins \
         Key=Environment,Value=Production \
         Key=ManagedBy,Value=Terraform
```

### 3. Access Control

Use least-privilege IAM policies:
- Jenkins controller: Read-only access to `jenkins/*` secrets
- Developers: No direct access (use Jenkins UI)
- Admins: Full access for rotation

### 4. Audit Logging

Enable CloudTrail logging:
```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=jenkins/github-webhook-secret \
  --max-results 10
```

### 5. Encryption

Use customer-managed KMS keys for additional control:
```bash
aws secretsmanager create-secret \
  --name jenkins/github-webhook-secret \
  --secret-string "$SECRET" \
  --kms-key-id alias/jenkins-secrets \
  --region us-west-2
```

## Cost Optimization

**Pricing** (us-west-2):
- $0.40 per secret per month
- $0.05 per 10,000 API calls

**Optimization tips**:
- Cache secrets in application (don't fetch on every request)
- Use Kubernetes secrets as cache layer
- Delete unused secrets
- Use secret versions instead of creating new secrets

**Example cost**:
- 5 secrets × $0.40 = $2.00/month
- 100,000 API calls × $0.05/10k = $0.50/month
- **Total: ~$2.50/month**

## Migration from Local Files

### Step 1: Audit Current Secrets

```bash
# List secrets in access_details/
grep -r "password\|secret\|token" access_details/
```

### Step 2: Move to Secrets Manager

```bash
# For each secret found:
aws secretsmanager create-secret \
  --name jenkins/<secret-name> \
  --secret-string "<secret-value>" \
  --region us-west-2
```

### Step 3: Update Applications

Update Jenkins configuration to retrieve from Secrets Manager instead of local files.

### Step 4: Remove Local Files

```bash
# After verification, remove secrets from local files
# Keep only non-sensitive information
```

## Troubleshooting

### Cannot Retrieve Secret

**Check IAM permissions:**
```bash
aws secretsmanager get-secret-value \
  --secret-id jenkins/github-webhook-secret \
  --region us-west-2
```

**Error: AccessDeniedException**
- Verify IAM role has `secretsmanager:GetSecretValue` permission
- Check resource ARN matches

### Secret Not Found

**List all secrets:**
```bash
aws secretsmanager list-secrets --region us-west-2
```

**Check secret name:**
- Names are case-sensitive
- Include full path (e.g., `jenkins/github-webhook-secret`)

### Kubernetes Secret Not Syncing

**Check CSI driver logs:**
```bash
kubectl logs -n kube-system -l app=csi-secrets-store
```

**Verify SecretProviderClass:**
```bash
kubectl describe secretproviderclass jenkins-secrets -n jenkins
```

## Summary

**For Production:**
- ✅ Use AWS Secrets Manager
- ✅ Implement automatic rotation where possible
- ✅ Use IAM for access control
- ✅ Enable CloudTrail auditing
- ✅ Tag and organize secrets

**For Development:**
- ⚠️ Local files acceptable for testing
- ⚠️ Never commit to git
- ⚠️ Migrate to Secrets Manager before production

**Cost**: ~$2-5/month for typical Jenkins setup

**Security**: Production-grade with encryption, auditing, and access control
