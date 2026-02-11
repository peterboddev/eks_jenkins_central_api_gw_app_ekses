# Platform Compatibility Guide

## Deployment Scripts

This project provides deployment scripts for all major platforms:

### Linux/Mac: `deploy-infrastructure.sh`

**Requirements:**
- Bash 4.0 or later
- Standard Unix utilities (grep, awk, sed)
- ANSI color support (most modern terminals)

**Usage:**
```bash
chmod +x scripts/deploy-infrastructure.sh
./scripts/deploy-infrastructure.sh
```

**Features:**
- ✓ ANSI color output
- ✓ Exit on error (set -e)
- ✓ Command existence checks
- ✓ AWS credential validation
- ✓ Automatic CDK bootstrap
- ✓ Sequential stack deployment
- ✓ Output display with formatting

### Windows: `deploy-infrastructure.ps1`

**Requirements:**
- PowerShell 5.1 or later
- Windows 10/11 or Windows Server 2016+
- Execution policy allowing scripts

**Usage:**
```powershell
.\scripts\deploy-infrastructure.ps1
```

**Execution Policy:**
If you get execution policy errors:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Features:**
- ✓ PowerShell color output
- ✓ Error handling ($ErrorActionPreference)
- ✓ Command existence checks
- ✓ AWS credential validation
- ✓ Automatic CDK bootstrap
- ✓ Sequential stack deployment
- ✓ Output display with formatting

## Script Equivalence

Both scripts perform identical operations:

| Step | Linux/Mac | Windows | Description |
|------|-----------|---------|-------------|
| 1 | ✓ | ✓ | Verify prerequisites (Node.js, npm, CDK, AWS CLI) |
| 2 | ✓ | ✓ | Install npm dependencies |
| 3 | ✓ | ✓ | Build TypeScript code |
| 4 | ✓ | ✓ | Verify/bootstrap CDK |
| 5 | ✓ | ✓ | Deploy VPC network stacks |
| 6 | ✓ | ✓ | Deploy Transit Gateway |
| 7 | ✓ | ✓ | Deploy application stacks |
| 8 | ✓ | ✓ | Display stack outputs |

## Platform-Specific Differences

### Command Syntax

**Linux/Mac (Bash):**
```bash
# Variable assignment
account=$(aws sts get-caller-identity --query Account --output text)

# Conditionals
if [ -z "$region" ]; then
    region="us-west-2"
fi

# Arrays
stacks=(
    "JenkinsNetworkStack"
    "NginxApiNetworkStack"
)

# Loops
for stack in "${stacks[@]}"; do
    echo "$stack"
done
```

**Windows (PowerShell):**
```powershell
# Variable assignment
$account = aws sts get-caller-identity --query Account --output text

# Conditionals
if (-not $region) {
    $region = "us-west-2"
}

# Arrays
$stacks = @(
    "JenkinsNetworkStack",
    "NginxApiNetworkStack"
)

# Loops
foreach ($stack in $stacks) {
    Write-Host $stack
}
```

### Color Output

**Linux/Mac (ANSI Escape Codes):**
```bash
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Success${NC}"
```

**Windows (PowerShell):**
```powershell
Write-Host "Success" -ForegroundColor Green
```

### Error Handling

**Linux/Mac:**
```bash
set -e  # Exit on any error

if ! command; then
    echo "Error"
    exit 1
fi
```

**Windows:**
```powershell
$ErrorActionPreference = "Stop"  # Exit on any error

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error"
    exit 1
}
```

## Testing Scripts

### Linux/Mac
```bash
# Dry run (syntax check)
bash -n scripts/deploy-infrastructure.sh

# Run with verbose output
bash -x scripts/deploy-infrastructure.sh
```

### Windows
```powershell
# Syntax check
Get-Command .\scripts\deploy-infrastructure.ps1

# Run with verbose output
.\scripts\deploy-infrastructure.ps1 -Verbose
```

## Troubleshooting

### Linux/Mac Issues

**Issue: Permission denied**
```bash
chmod +x scripts/deploy-infrastructure.sh
```

**Issue: Bad interpreter**
```bash
# Check shebang line
head -n 1 scripts/deploy-infrastructure.sh
# Should be: #!/usr/bin/env bash

# Find bash location
which bash
```

**Issue: Command not found**
```bash
# Check PATH
echo $PATH

# Install missing tools
# Ubuntu/Debian
sudo apt-get install nodejs npm

# macOS
brew install node
```

### Windows Issues

**Issue: Execution policy**
```powershell
# Check current policy
Get-ExecutionPolicy

# Set policy for current user
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or bypass for single execution
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-infrastructure.ps1
```

**Issue: Command not found**
```powershell
# Check if command exists
Get-Command node
Get-Command npm
Get-Command cdk
Get-Command aws

# Install missing tools
# Use Chocolatey or download installers
choco install nodejs
choco install awscli
npm install -g aws-cdk
```

## Cross-Platform Development

If you're developing on one platform and deploying on another:

1. **Use Git for version control** - Scripts are text files and work across platforms
2. **Test on target platform** - Always test scripts on the deployment platform
3. **Document platform-specific steps** - Note any manual steps required
4. **Use consistent line endings** - Configure Git to handle line endings:

```bash
# .gitattributes
*.sh text eol=lf
*.ps1 text eol=crlf
```

## CI/CD Integration

Both scripts can be used in CI/CD pipelines:

### GitHub Actions (Linux)
```yaml
- name: Deploy Infrastructure
  run: |
    chmod +x scripts/deploy-infrastructure.sh
    ./scripts/deploy-infrastructure.sh
```

### GitHub Actions (Windows)
```yaml
- name: Deploy Infrastructure
  run: .\scripts\deploy-infrastructure.ps1
  shell: pwsh
```

### GitLab CI (Linux)
```yaml
deploy:
  script:
    - chmod +x scripts/deploy-infrastructure.sh
    - ./scripts/deploy-infrastructure.sh
```

## Best Practices

1. **Always use the script for your platform** - Don't try to run bash scripts on Windows or PowerShell scripts on Linux
2. **Keep scripts in sync** - When updating one script, update the other
3. **Test both versions** - Ensure both scripts produce identical results
4. **Document platform differences** - Note any platform-specific behavior
5. **Use version control** - Track changes to both scripts

## Support Matrix

| Platform | Script | Status | Notes |
|----------|--------|--------|-------|
| Linux (Ubuntu 20.04+) | deploy-infrastructure.sh | ✓ Supported | Tested |
| Linux (RHEL/CentOS 8+) | deploy-infrastructure.sh | ✓ Supported | Tested |
| macOS (11+) | deploy-infrastructure.sh | ✓ Supported | Tested |
| Windows 10/11 | deploy-infrastructure.ps1 | ✓ Supported | Tested |
| Windows Server 2016+ | deploy-infrastructure.ps1 | ✓ Supported | Tested |
| WSL (Ubuntu) | deploy-infrastructure.sh | ✓ Supported | Use Linux script |
| Git Bash (Windows) | deploy-infrastructure.sh | ⚠ Limited | May have issues with colors |

## Additional Resources

- [Bash Scripting Guide](https://www.gnu.org/software/bash/manual/)
- [PowerShell Documentation](https://docs.microsoft.com/en-us/powershell/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Cross-Platform Shell Scripting](https://github.com/dylanaraps/pure-bash-bible)
