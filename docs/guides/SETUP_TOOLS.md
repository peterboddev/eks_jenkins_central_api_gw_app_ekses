# Tool Installation Guide

## Current Situation

You have local .exe files in the project directory, but they're not in your system PATH. This means:
- ❌ You must run `.\kubectl.exe` instead of just `kubectl`
- ❌ Tools only work from this directory
- ❌ Not available system-wide
- ❌ Binaries are committed to git (bloating the repository)

## Goal

Install tools system-wide via Chocolatey so they're:
- ✅ Available from any directory
- ✅ In your PATH
- ✅ Easy to update
- ✅ Not in git repository

## Prerequisites

**Run PowerShell as Administrator** for Chocolatey installations.

Right-click PowerShell → "Run as Administrator"

## Installation Steps

### Step 1: Install kubectl

```powershell
# Install kubectl
choco install kubernetes-cli -y

# Verify installation
kubectl version --client

# Expected output:
# Client Version: v1.xx.x
```

### Step 2: Install helm

```powershell
# Install helm
choco install kubernetes-helm -y

# Verify installation
helm version

# Expected output:
# version.BuildInfo{Version:"v3.xx.x", ...}
```

### Step 3: Install eksctl (Optional)

```powershell
# Install eksctl
choco install eksctl -y

# Verify installation
eksctl version

# Expected output:
# 0.xx.x
```

### Step 4: Verify AWS CLI (Already Installed)

```powershell
# Check AWS CLI version
aws --version

# Expected output:
# aws-cli/2.31.28 Python/3.13.9 Windows/11 exe/AMD64
```

### Step 5: Clean Up Local Binaries

Once tools are installed system-wide, you can delete the local copies:

```powershell
# Navigate to project directory
cd C:\local_drive\eks_jenkins

# Delete local binaries (they're now in .gitignore)
Remove-Item eksctl.exe, eksctl.zip -ErrorAction SilentlyContinue
Remove-Item helm.exe, helm.zip -ErrorAction SilentlyContinue
Remove-Item kubectl.exe -ErrorAction SilentlyContinue
Remove-Item jenkins-cli.jar -ErrorAction SilentlyContinue
Remove-Item kubectl-layer.zip -ErrorAction SilentlyContinue

# Keep kubeconfig if it contains your cluster credentials
# Or regenerate it with: aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2

Write-Host "✅ Local binaries cleaned up!" -ForegroundColor Green
```

### Step 6: Verify Everything Works

```powershell
# Test kubectl (should work from any directory)
kubectl version --client

# Test helm
helm version

# Test eksctl
eksctl version

# Test AWS CLI
aws --version

# Test kubectl with your cluster
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2
kubectl get nodes
```

## Troubleshooting

### Issue: "choco: command not found"

**Solution:** Install Chocolatey first:
```powershell
# Run in Administrator PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

### Issue: "Unable to obtain lock file"

**Solution:** Remove the lock file:
```powershell
# Run in Administrator PowerShell
Remove-Item "C:\ProgramData\chocolatey\lib\c1eedec61dc9e765bad7820a51b7d76298cbb8e7" -Force -ErrorAction SilentlyContinue

# Then retry installation
choco install kubernetes-cli -y
```

### Issue: "Not running from elevated command shell"

**Solution:** Run PowerShell as Administrator:
1. Search for "PowerShell" in Start Menu
2. Right-click → "Run as Administrator"
3. Run the choco install commands

### Issue: kubectl still not found after installation

**Solution:** Restart PowerShell or refresh PATH:
```powershell
# Refresh environment variables
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Or simply close and reopen PowerShell
```

## Alternative: Manual Installation

If Chocolatey doesn't work, you can install manually:

### kubectl
1. Download from: https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/
2. Add to PATH: `C:\Program Files\kubectl\`

### helm
1. Download from: https://github.com/helm/helm/releases
2. Extract and add to PATH

### eksctl
1. Download from: https://github.com/eksctl-io/eksctl/releases
2. Extract and add to PATH

## Benefits After Installation

### Before (Local Binaries)
```powershell
# Must be in project directory
cd C:\local_drive\eks_jenkins
.\kubectl.exe get nodes
.\helm.exe list

# Binaries committed to git (312 MB)
# Not available system-wide
```

### After (System-Wide Installation)
```powershell
# Works from any directory
kubectl get nodes
helm list
eksctl version

# Clean git repository
# Tools in PATH
# Easy to update: choco upgrade all
```

## Quick Reference

### Update Tools
```powershell
# Update all Chocolatey packages
choco upgrade all -y

# Update specific tool
choco upgrade kubernetes-cli -y
```

### Uninstall Tools
```powershell
# Uninstall if needed
choco uninstall kubernetes-cli -y
choco uninstall kubernetes-helm -y
choco uninstall eksctl -y
```

### Check Installed Versions
```powershell
kubectl version --client
helm version
eksctl version
aws --version
```

## Summary

1. ✅ Run PowerShell as Administrator
2. ✅ Install tools via Chocolatey
3. ✅ Verify installations
4. ✅ Delete local binaries
5. ✅ Test from any directory
6. ✅ Enjoy clean repository!

## Next Steps

After installation:
1. Delete local binaries (they're in .gitignore now)
2. Commit the .gitignore changes
3. Push to git (binaries won't be included)
4. Team members install tools the same way
