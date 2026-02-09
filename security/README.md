# Security Directory

## ⚠️ Important: This Directory is NOT Committed to Git

This directory is excluded in `.gitignore` and contains sensitive security audit files with exposed credentials, account IDs, and infrastructure details.

## What's Stored Here

### Security Audit Files (Local Only)

1. **SECURITY_AUDIT.md** - Comprehensive security audit report
   - Contains: Exposed credentials, AWS account IDs, resource IDs
   - Risk assessment and findings
   - Detailed remediation recommendations

2. **SECURITY_FIXES_REQUIRED.md** - Action plan for security fixes
   - Contains: Specific credentials that need rotation
   - Step-by-step remediation instructions
   - Quick fix scripts

## Why These Files Are Gitignored

These files contain sensitive information that should NOT be committed to git:
- ❌ Jenkins admin password
- ❌ Test user credentials
- ❌ AWS account ID
- ❌ Resource IDs (EFS, Transit Gateway, Cognito, etc.)
- ❌ Public URLs (ALB, API Gateway)
- ❌ Infrastructure details

## How to Use This Directory

### For Security Audits

1. **Run security audit** - Generate audit files here
2. **Review findings** - Read SECURITY_AUDIT.md
3. **Take action** - Follow SECURITY_FIXES_REQUIRED.md
4. **Keep local** - Never commit these files

### For Team Members

Each team member should:
1. **Have their own copy** of security audit files locally
2. **Not share** via git (use secure channels if needed)
3. **Update after changes** to infrastructure or credentials
4. **Delete after remediation** (or archive securely)

## Safe Security Documentation

For security documentation that CAN be committed to git:
- See `../SECURITY.md` - Security guidelines (no credentials)
- See `../access_details/README.md` - How to manage credentials

## Directory Structure

```
security/
├── README.md                      # This file (safe to commit)
├── SECURITY_AUDIT.md              # ❌ Gitignored (contains credentials)
├── SECURITY_FIXES_REQUIRED.md     # ❌ Gitignored (contains credentials)
└── [other security audit files]   # ❌ Gitignored
```

## Verification

To verify this directory is properly gitignored:

```bash
# Check git status
git status

# security/ should NOT appear in untracked files
# If it does, check .gitignore

# Verify .gitignore contains:
grep "security/" .gitignore
# Should output: security/
```

## Related Documentation

- **SECURITY.md** (root) - Security guidelines (safe to commit)
- **access_details/CURRENT_ACCESS.md** - Current credentials (gitignored)
- **access_details/README.md** - Credential management guide
- **.gitignore** - Exclusion rules

## Best Practices

1. **Never commit** files from this directory
2. **Use secure channels** to share if needed (encrypted email, secure file transfer)
3. **Rotate credentials** after any exposure
4. **Delete audit files** after remediation is complete
5. **Keep updated** with current infrastructure state

## Status

✅ Directory excluded in .gitignore
✅ README.md is safe to commit (no credentials)
❌ All other files in this directory are gitignored

## Questions?

See `../SECURITY.md` for:
- Security guidelines
- Credential management
- Incident response
- Best practices
