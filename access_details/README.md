# Access Details Directory

This directory contains sensitive access information including URLs, credentials, and API keys.

**⚠️ SECURITY NOTICE**: All files in this directory (except this README) are ignored by git to prevent accidental commits of sensitive data.

## Files in this directory:

- `CURRENT_ACCESS.md` - Current access URLs and credentials
- `*.md` - Other access-related documentation

## Usage

1. Access information is stored locally only
2. Never commit credentials to version control
3. Share access details through secure channels only
4. Rotate credentials regularly

## Getting Access Information

If you need access details and don't have them locally:
1. Check with your team lead or administrator
2. Retrieve from secure password manager
3. Generate new credentials if needed

## Security Best Practices

- ✅ Keep this directory in .gitignore
- ✅ Use environment variables for automation
- ✅ Rotate credentials regularly
- ✅ Use AWS Secrets Manager for production
- ❌ Never commit credentials to git
- ❌ Never share credentials via email or chat
- ❌ Never hardcode credentials in scripts
