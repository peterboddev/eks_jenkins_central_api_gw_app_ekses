# Security Guidelines

## Overview

This document outlines security best practices for the Jenkins EKS and nginx-api clusters project.

## 🔒 Credential Management

### Where Credentials Are Stored

**✅ Secure Location (Not in Git)**:
- `access_details/CURRENT_ACCESS.md` - All credentials, URLs, and sensitive information
- This file is in `.gitignore` and never committed to git
- Keep this file updated locally only

**❌ Never Commit**:
- Passwords or API keys
- AWS account IDs
- Private keys or certificates
- Kubeconfig files
- Environment files with secrets

### Accessing Credentials

To get current credentials:
```bash
# View locally (not in git)
cat access_details/CURRENT_ACCESS.md
```

To update credentials:
```bash
# Edit locally only
vim access_details/CURRENT_ACCESS.md
# This file is gitignored and won't be committed
```

## 🛡️ Security Best Practices

### 1. Use Environment Variables

Instead of hardcoding values, use environment variables:

```bash
# Bad - hardcoded
AWS_ACCOUNT_ID="450683699755"

# Good - from environment
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

### 2. Use IAM Roles for Service Accounts (IRSA)

All Kubernetes pods use IRSA for AWS access:
- ✅ No long-lived credentials
- ✅ Temporary credentials via AWS STS
- ✅ Automatic rotation

### 3. Use Cognito JWT Authentication

API endpoints use Cognito JWT tokens:
- ✅ Tokens expire after 1 hour
- ✅ No hardcoded API keys
- ✅ Centralized user management

### 4. Encrypt Data at Rest

- ✅ EFS encrypted with AWS KMS
- ✅ S3 encrypted with SSE-S3
- ✅ EBS volumes encrypted

### 5. Use Private Subnets

- ✅ Workloads run in private subnets
- ✅ NAT Gateway for outbound only
- ✅ No direct internet access

## 🔐 Credential Rotation

### Jenkins Admin Password

```bash
# Get current password from access_details/CURRENT_ACCESS.md
# Then rotate via Jenkins UI or CLI

# Via kubectl
kubectl exec -n jenkins jenkins-controller-0 -- \
  cat /var/jenkins_home/secrets/initialAdminPassword
```

### Cognito User Passwords

```bash
# Rotate test user password
aws cognito-idp admin-set-user-password \
  --user-pool-id <USER_POOL_ID> \
  --username testuser@example.com \
  --password <NEW_PASSWORD> \
  --permanent \
  --region us-west-2
```

### AWS Access Keys

```bash
# Rotate IAM user access keys
aws iam create-access-key --user-name <USERNAME>
aws iam delete-access-key --user-name <USERNAME> --access-key-id <OLD_KEY_ID>
```

## 📋 Security Checklist

### Before Every Git Push

- [ ] Run: `git diff --cached | grep -i "password\|secret\|key\|credential"`
- [ ] Verify no credentials in staged files
- [ ] Check `.gitignore` is up to date
- [ ] Verify `access_details/` is not staged
- [ ] Verify no AWS account IDs in new files

### After Deployment

- [ ] Rotate all default credentials
- [ ] Update `access_details/CURRENT_ACCESS.md` locally
- [ ] Test with new credentials
- [ ] Enable MFA for Cognito users
- [ ] Add IP restrictions to Jenkins

### Monthly Security Review

- [ ] Review IAM permissions (least privilege)
- [ ] Check CloudTrail logs for suspicious activity
- [ ] Update dependencies (npm, Docker images)
- [ ] Rotate credentials
- [ ] Review security group rules
- [ ] Check for exposed secrets in git history

## 🚨 Incident Response

### If Credentials Are Exposed

1. **Immediately rotate** the exposed credentials
2. **Review CloudTrail logs** for unauthorized access
3. **Update** `access_details/CURRENT_ACCESS.md` locally
4. **Test** all services with new credentials
5. **Document** the incident and remediation

### If Git History Contains Secrets

1. **Do NOT push** to remote repository
2. **Use git-filter-branch** or BFG Repo-Cleaner to remove secrets
3. **Rotate** all exposed credentials
4. **Force push** (coordinate with team)
5. **All team members** must re-clone

## 🔧 Security Tools

### Recommended Tools

1. **git-secrets** - Prevent committing secrets
   ```bash
   # Install
   brew install git-secrets  # macOS
   choco install git-secrets  # Windows
   
   # Setup
   git secrets --install
   git secrets --register-aws
   ```

2. **AWS Secrets Manager** - Store secrets securely
   ```bash
   # Store secret
   aws secretsmanager create-secret \
     --name jenkins-admin-password \
     --secret-string "password123"
   
   # Retrieve secret
   aws secretsmanager get-secret-value \
     --secret-id jenkins-admin-password \
     --query SecretString \
     --output text
   ```

3. **AWS Systems Manager Parameter Store** - Store configuration
   ```bash
   # Store parameter
   aws ssm put-parameter \
     --name /jenkins/admin-password \
     --value "password123" \
     --type SecureString
   
   # Retrieve parameter
   aws ssm get-parameter \
     --name /jenkins/admin-password \
     --with-decryption \
     --query Parameter.Value \
     --output text
   ```

## 📊 Security Monitoring

### Enable AWS Security Services

1. **CloudTrail** - Log all API calls
2. **GuardDuty** - Threat detection
3. **AWS Config** - Configuration compliance
4. **Security Hub** - Centralized security findings
5. **IAM Access Analyzer** - Identify overly permissive policies

### CloudWatch Alarms

Set up alarms for:
- Failed authentication attempts
- Unusual API activity
- Resource modifications
- High error rates
- Unauthorized access attempts

## 🎯 Security Hardening

### Jenkins

- [ ] Enable HTTPS with ACM certificate
- [ ] Add IP whitelist for access
- [ ] Enable audit logging
- [ ] Configure RBAC
- [ ] Disable unused plugins
- [ ] Regular security updates

### API Gateway

- [ ] Enable WAF
- [ ] Add rate limiting
- [ ] Enable access logging
- [ ] Use custom domain with HTTPS
- [ ] Configure CORS properly

### EKS Clusters

- [ ] Enable control plane logging
- [ ] Use Pod Security Standards
- [ ] Implement Network Policies
- [ ] Enable secrets encryption
- [ ] Regular Kubernetes updates

## 📚 Resources

- [AWS Security Best Practices](https://aws.amazon.com/architecture/security-identity-compliance/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Kubernetes Benchmark](https://www.cisecurity.org/benchmark/kubernetes)
- [AWS Well-Architected Framework - Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)

## 🔗 Related Documentation

- `access_details/CURRENT_ACCESS.md` - Current credentials (local only, gitignored)
- `access_details/README.md` - How to manage access details
- `.gitignore` - Files excluded from git

## ⚠️ Important Reminders

1. **Never commit credentials** to git, even in documentation
2. **Use placeholders** in examples: `<PASSWORD>`, `<AWS_ACCOUNT_ID>`
3. **Keep access_details/** updated locally only
4. **Rotate credentials** regularly (quarterly minimum)
5. **Enable MFA** for all production access
6. **Use least privilege** for all IAM policies
7. **Monitor CloudTrail** for suspicious activity
8. **Keep dependencies updated** to patch vulnerabilities

## Status

✅ Credentials protected in `access_details/` (gitignored)
✅ IRSA enabled (no long-lived credentials)
✅ Cognito JWT authentication (token expiration)
✅ Encryption at rest (EFS, S3, EBS)
✅ Private subnets (no direct internet access)
✅ Security groups (network isolation)

## Contact

For security issues or questions:
- Review this document
- Check `access_details/README.md`
- Consult AWS Security documentation
- Follow incident response procedures above
