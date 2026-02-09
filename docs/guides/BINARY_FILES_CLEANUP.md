# Binary Files Cleanup

## Current Situation

The repository currently contains binary executable files that should NOT be committed to git:

```
eksctl.exe        145 MB
eksctl.zip         36 MB
helm.exe           49 MB
helm.zip           16 MB
kubectl.exe        55 MB
jenkins-cli.jar    11 MB
kubectl-layer.zip 143 bytes
kubeconfig        (varies)
```

**Total: ~312 MB of binary files**

## Why This Is a Problem

### Git Repository Issues
1. **Large repository size** - Every clone downloads all versions of these files
2. **Binary files don't diff** - Git can't show meaningful changes
3. **Repository bloat** - History grows with every binary update
4. **Slow operations** - Clone, fetch, and pull become slower

### Development Issues
1. **Not cross-platform** - .exe files only work on Windows
2. **Version conflicts** - Different developers may need different versions
3. **Security concerns** - Binaries can contain malware
4. **Outdated quickly** - Tools update frequently

### Best Practices Violation
1. **Binary files should not be versioned** in git
2. **Tools should be installed locally** via package managers
3. **Documentation should explain** how to install tools
4. **CI/CD should use** containerized tools or install on-demand

## What These Files Are

### eksctl (EKS CLI)
- **Purpose**: Create and manage EKS clusters
- **Used for**: Initial cluster setup (one-time operation)
- **Alternative**: AWS CDK (already used in this project)
- **Install**: `choco install eksctl` or download from https://eksctl.io/

### helm (Kubernetes Package Manager)
- **Purpose**: Deploy applications to Kubernetes
- **Used for**: nginx-api deployment
- **Install**: `choco install kubernetes-helm` or download from https://helm.sh/

### kubectl (Kubernetes CLI)
- **Purpose**: Interact with Kubernetes clusters
- **Used for**: Daily operations
- **Install**: `choco install kubernetes-cli` or download from https://kubernetes.io/

### jenkins-cli.jar (Jenkins CLI)
- **Purpose**: Manage Jenkins via command line
- **Used for**: Manual job creation (no longer needed with JCasC)
- **Status**: **NOT NEEDED** - Jenkins Configuration as Code handles this

### kubectl-layer.zip (Lambda Layer)
- **Purpose**: Minimal Lambda layer for nginx-api-cluster CDK stack
- **Status**: **AUTO-GENERATED** - Created automatically during `npm run build`
- **Details**: See [KUBECTL_LAYER_AUTOMATION.md](KUBECTL_LAYER_AUTOMATION.md)

### kubeconfig (Kubernetes Config)
- **Purpose**: Kubernetes cluster authentication
- **Contains**: Sensitive cluster credentials
- **Status**: **SHOULD NOT BE COMMITTED** - Contains secrets

## Recommended Actions

### Immediate Actions

1. **Update .gitignore** ✅ (Already done)
   ```gitignore
   # Binary tools
   *.exe
   *.zip
   *.jar
   kubeconfig
   ```

2. **Remove from git history** (Optional but recommended)
   ```bash
   # WARNING: This rewrites git history
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch *.exe *.zip *.jar kubeconfig" \
     --prune-empty --tag-name-filter cat -- --all
   
   # Force push (coordinate with team first!)
   git push origin --force --all
   ```

3. **Delete local copies** (Keep if you need them locally)
   ```powershell
   # These files will be ignored by git now
   # You can keep them locally for your use
   # Or delete and reinstall via package managers
   ```

### Documentation Updates ✅ (Already done)

Updated README.md with:
- Installation instructions for each tool
- Links to official installation guides
- Note about not committing binaries

## Alternative Approaches

### For CI/CD (Jenkins)
Use Docker images with tools pre-installed:
```yaml
containers:
  - name: kubectl
    image: bitnami/kubectl:latest
  - name: helm
    image: alpine/helm:latest
  - name: aws-cli
    image: amazon/aws-cli:latest
```

### For Local Development
Use package managers:
```powershell
# Windows (Chocolatey)
choco install kubernetes-cli kubernetes-helm eksctl awscli

# macOS (Homebrew)
brew install kubectl helm eksctl awscli

# Linux (apt)
sudo apt-get install kubectl
```

### For Kubernetes Operations
Use kubectl from within cluster:
```bash
# Run kubectl commands from a pod
kubectl run -it --rm debug --image=bitnami/kubectl --restart=Never -- bash
```

## Current Status

✅ .gitignore updated to exclude binary files
✅ README.md updated with installation instructions
⏳ Binary files still in repository (but will be ignored going forward)
⏳ Git history still contains old versions (optional cleanup)

## Next Steps

### For New Clones
New clones will NOT include these binary files (they're now in .gitignore).
Users must install tools locally using package managers.

### For Existing Clones
Existing clones still have these files locally.
They won't be committed to git anymore.
Users can delete them and reinstall via package managers.

### For Git History (Optional)
If you want to clean up git history and reduce repository size:
1. Coordinate with team (history rewrite affects everyone)
2. Run git filter-branch command above
3. Force push to remote
4. All team members must re-clone or rebase

## Conclusion

Binary files should NOT be in git repositories. They should be:
- ✅ Installed locally via package managers
- ✅ Documented in README
- ✅ Excluded via .gitignore
- ✅ Used from Docker images in CI/CD

This keeps the repository clean, fast, and cross-platform compatible.
