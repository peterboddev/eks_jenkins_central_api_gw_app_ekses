# kubectl-layer.zip Automation

## Overview

The `kubectl-layer.zip` file is a minimal Lambda layer required by the nginx-api-cluster CDK stack. It's automatically generated during the build process and excluded from git.

## Why Auto-Generate?

- **Not committed to git**: Binary files should not be in version control
- **Minimal size**: Contains only a placeholder file (143 bytes)
- **Build-time generation**: Created automatically when needed
- **Cross-platform**: Works on Windows (PowerShell) and Unix (zip command)

## How It Works

### Automatic Generation

The file is automatically created when you run:

```bash
npm run build
```

This triggers the `prebuild` hook which runs `scripts/prepare-kubectl-layer.js`.

### Manual Generation

If you need to generate it manually:

```bash
npm run prepare-kubectl-layer
```

Or directly:

```bash
node scripts/prepare-kubectl-layer.js
```

## Script Behavior

The `scripts/prepare-kubectl-layer.js` script:

1. **Checks if file exists**: If `kubectl-layer.zip` already exists, it exits successfully
2. **Verifies placeholder**: Ensures `kubectl-layer/placeholder.txt` exists
3. **Creates zip file**:
   - **Windows**: Uses PowerShell `Compress-Archive` cmdlet
   - **Unix/Linux/Mac**: Uses `zip` command
4. **Outputs status**: Confirms creation and location

## File Location

- **Source**: `kubectl-layer/placeholder.txt` (committed to git)
- **Generated**: `nginx-api/tmp/kubectl-layer.zip` (in .gitignore, not committed)
- **Used by**: `lib/eks_nginx_api-stack.ts` (Lambda layer for kubectl)

This follows the best practice of keeping build artifacts in the subdirectory where they're used.

## .gitignore Entry

All temporary build artifacts are excluded from git:

```gitignore
# Temporary build artifacts
tmp/
```

This is a standard pattern - any `tmp/` directory anywhere in the project is automatically ignored.

## CDK Usage

The nginx-api-cluster stack uses this layer:

```typescript
const kubectlLayer = new lambda.LayerVersion(this, 'KubectlLayer', {
  code: lambda.Code.fromAsset('nginx-api/tmp/kubectl-layer.zip'),
  compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
  description: 'Minimal kubectl layer for EKS cluster management',
});
```

The file is kept in `nginx-api/tmp/` because:
- ✅ It's used by the nginx-api-cluster stack
- ✅ Keeps build artifacts with the component that uses them
- ✅ Makes the dependency clear
- ✅ Follows standard project organization patterns

## Troubleshooting

### File Not Found Error

If you see "kubectl-layer.zip not found" during `cdk deploy`:

```bash
# Regenerate the file
npm run prepare-kubectl-layer

# Or rebuild everything
npm run build
```

### Permission Errors (Unix/Linux/Mac)

If the script fails with permission errors:

```bash
# Make sure zip is installed
which zip

# Install if missing (Ubuntu/Debian)
sudo apt-get install zip

# Install if missing (macOS)
brew install zip
```

### PowerShell Errors (Windows)

If Compress-Archive fails:

```powershell
# Check PowerShell version (needs 5.0+)
$PSVersionTable.PSVersion

# Run as Administrator if needed
```

## Development Workflow

1. **Clone repository**: `kubectl-layer.zip` won't exist yet
2. **Install dependencies**: `npm install`
3. **Build project**: `npm run build` (auto-generates kubectl-layer.zip)
4. **Deploy**: `cdk deploy` (uses the generated file)

## CI/CD Integration

In CI/CD pipelines, ensure the build step runs before deployment:

```bash
# Install dependencies
npm install

# Build (generates kubectl-layer.zip automatically)
npm run build

# Deploy
cdk deploy
```

## Related Files

- `scripts/prepare-kubectl-layer.js` - Generation script
- `kubectl-layer/placeholder.txt` - Source file (143 bytes)
- `package.json` - Contains prebuild hook
- `.gitignore` - Excludes kubectl-layer.zip
- `lib/eks_nginx_api-stack.ts` - Uses the layer

## Summary

The kubectl-layer.zip automation ensures:
- ✅ No binary files in git
- ✅ Automatic generation during build
- ✅ Cross-platform compatibility
- ✅ Minimal maintenance overhead
- ✅ Clean development workflow
