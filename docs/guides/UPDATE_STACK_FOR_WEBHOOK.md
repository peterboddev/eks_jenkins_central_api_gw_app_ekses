# Update CDK Stack to Add Webhook Secret

## Current Situation

The GitHub webhook secret was added to the CDK code but hasn't been deployed yet. You need to update your existing CloudFormation stack to create the secret.

## Steps to Update

### 1. Verify Current Stack Status

```bash
aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --region us-west-2 \
  --query "Stacks[0].StackStatus" \
  --output text
```

Should show: `UPDATE_COMPLETE` or `CREATE_COMPLETE`

### 2. Build the Updated CDK Code

```bash
# Make sure you're in the project root
cd /path/to/eks_jenkins

# Install dependencies (if needed)
npm install

# Build the TypeScript code
npm run build
```

### 3. Preview the Changes

```bash
# See what will be added/changed
cdk diff
```

**Expected changes:**
- ✅ New AWS::SecretsManager::Secret resource
- ✅ Updated IAM policy for Jenkins controller role (Secrets Manager permissions)
- ✅ New CloudFormation outputs for secret ARN and name

### 4. Deploy the Update

```bash
cdk deploy
```

**What happens:**
- CDK updates the existing stack
- Creates the GitHub webhook secret
- Adds IAM permissions for Jenkins to read the secret
- Exports secret information as stack outputs
- **No downtime** - Jenkins keeps running

### 5. Verify Secret Was Created

```bash
# List secrets
aws secretsmanager list-secrets \
  --region us-west-2 \
  --query "SecretList[?contains(Name, 'jenkins')].Name" \
  --output table

# Should show: jenkins/github-webhook-secret

# Get the secret value
aws secretsmanager get-secret-value \
  --secret-id jenkins/github-webhook-secret \
  --region us-west-2 \
  --query SecretString \
  --output text | jq -r .secret
```

### 6. Check CDK Outputs

```bash
aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --region us-west-2 \
  --query "Stacks[0].Outputs[?contains(OutputKey, 'GitHubWebhook')]" \
  --output table
```

**Expected outputs:**
- `GitHubWebhookSecretArnOutput`
- `GitHubWebhookSecretNameOutput`
- `GitHubWebhookSecretRetrievalCommandOutput`

## Troubleshooting

### Error: "No changes to deploy"

This means the CDK code wasn't built or the changes aren't detected.

**Solution:**
```bash
# Force rebuild
rm -rf cdk.out
npm run build
cdk deploy
```

### Error: "Resource already exists"

If you manually created a secret with the same name, delete it first:

```bash
aws secretsmanager delete-secret \
  --secret-id jenkins/github-webhook-secret \
  --region us-west-2 \
  --force-delete-without-recovery
```

Then run `cdk deploy` again.

### Error: "Insufficient permissions"

Your AWS credentials need permissions to:
- Create Secrets Manager secrets
- Update IAM policies
- Update CloudFormation stacks

**Check your permissions:**
```bash
aws sts get-caller-identity
```

### Stack Update Takes Long Time

CloudFormation updates can take 5-10 minutes. This is normal.

**Monitor progress:**
```bash
# Watch stack events
aws cloudformation describe-stack-events \
  --stack-name JenkinsEksStack \
  --region us-west-2 \
  --max-items 10 \
  --query "StackEvents[*].[Timestamp,ResourceStatus,ResourceType,LogicalResourceId]" \
  --output table
```

## After Update

Once the stack update completes:

1. **Retrieve the secret** for GitHub webhook configuration
2. **Configure GitHub webhook** (see README Step 11)
3. **Test the webhook** by pushing code

## Cost Impact

Adding the secret adds minimal cost:
- **Secrets Manager**: $0.40/month per secret
- **API calls**: $0.05 per 10,000 calls

**Total additional cost**: ~$0.40-0.50/month

## Rollback (If Needed)

If something goes wrong, you can rollback:

```bash
# Get previous stack version
aws cloudformation list-stack-resources \
  --stack-name JenkinsEksStack \
  --region us-west-2

# Rollback is automatic if update fails
# Or manually delete the secret and redeploy old version
```

## Summary

**Quick commands:**
```bash
# 1. Build
npm run build

# 2. Preview
cdk diff

# 3. Deploy
cdk deploy

# 4. Verify
aws secretsmanager get-secret-value \
  --secret-id jenkins/github-webhook-secret \
  --region us-west-2 \
  --query SecretString \
  --output text | jq -r .secret
```

**Time required**: 5-10 minutes

**Risk**: Low - only adds resources, doesn't modify existing ones
