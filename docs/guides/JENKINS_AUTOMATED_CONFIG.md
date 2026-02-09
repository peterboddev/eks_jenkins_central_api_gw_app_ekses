# Jenkins Automated Configuration

## Overview

Your Jenkins setup uses **Infrastructure as Code** principles - all configuration is defined in Kubernetes manifests and automatically applied. No manual kubectl commands or UI configuration needed!

## How It Works

### 1. Configuration as Code (JCasC)

Jenkins uses the **Jenkins Configuration as Code (JCasC)** plugin to automatically load configuration from ConfigMaps:

```
┌─────────────────────────────────────────┐
│  Kubernetes ConfigMaps                  │
│  ├── jenkins-agent-pod-template         │
│  │   └── Agent configuration            │
│  └── jenkins-casc-jobs                  │
│      └── Job definitions (from git)     │
└─────────────────┬───────────────────────┘
                  │
                  │ Mounted as volumes
                  ▼
┌─────────────────────────────────────────┐
│  Jenkins Pod                            │
│  /var/jenkins_home/casc_configs/        │
│  ├── jenkins-agent-config.yaml          │
│  └── jobs/jobs.yaml                     │
└─────────────────┬───────────────────────┘
                  │
                  │ Auto-loaded on startup
                  ▼
┌─────────────────────────────────────────┐
│  Jenkins Running                        │
│  ✓ Agents configured                    │
│  ✓ Jobs created                         │
│  ✓ Git polling enabled                  │
└─────────────────────────────────────────┘
```

### 2. Automatic Job Creation

Jobs are defined in `k8s/jenkins/jobs-configmap.yaml` and automatically created when Jenkins starts:

**No manual steps required!**
- ✅ Jobs are created automatically
- ✅ Git repositories are configured
- ✅ SCM polling is enabled (every 5 minutes)
- ✅ Jenkinsfiles are loaded from your repo

### 3. Git Integration

Once deployed, Jenkins automatically:
1. Polls your GitHub repo every 5 minutes
2. Detects new commits on the `master` branch
3. Triggers builds automatically
4. Runs the Jenkinsfile from your repo

## Deployment

### Initial Deployment

```bash
# Deploy everything at once
kubectl apply -k k8s/jenkins/

# Or use the deploy script
cd k8s/jenkins
./deploy.sh
```

This single command:
- Creates namespace, RBAC, service accounts
- Deploys Jenkins StatefulSet
- Mounts agent configuration
- **Mounts jobs configuration**
- Creates service and ingress

### Updating Jobs Configuration

When you update `k8s/jenkins/jobs-configmap.yaml`:

```bash
# Option 1: Apply just the ConfigMap
kubectl apply -f k8s/jenkins/jobs-configmap.yaml
kubectl rollout restart statefulset/jenkins-controller -n jenkins

# Option 2: Apply everything (recommended)
kubectl apply -k k8s/jenkins/
```

Jenkins will automatically reload the configuration.

## Configuration Files

### jobs-configmap.yaml

Defines Jenkins jobs using Job DSL syntax:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: jenkins-casc-jobs
  namespace: jenkins
  labels:
    jenkins-jenkins-config: "true"  # JCasC auto-discovery
data:
  jobs.yaml: |
    jobs:
      - script: >
          pipelineJob('nginx-api-build') {
            # Job configuration...
          }
```

**Key features:**
- Label `jenkins-jenkins-config: "true"` enables auto-discovery
- Mounted at `/var/jenkins_home/casc_configs/jobs`
- Automatically loaded by JCasC plugin
- Jobs created on Jenkins startup

### statefulset.yaml

Mounts the ConfigMaps:

```yaml
volumeMounts:
  - name: jenkins-agent-config
    mountPath: /var/jenkins_home/casc_configs
  - name: jenkins-jobs-config
    mountPath: /var/jenkins_home/casc_configs/jobs

volumes:
  - name: jenkins-agent-config
    configMap:
      name: jenkins-agent-pod-template
  - name: jenkins-jobs-config
    configMap:
      name: jenkins-casc-jobs
```

### kustomization.yaml

Includes all resources:

```yaml
resources:
  - namespace.yaml
  - serviceaccount.yaml
  - rbac.yaml
  - pvc.yaml
  - agent-pod-template-configmap.yaml
  - jobs-configmap.yaml  # ← Jobs configuration
  - statefulset.yaml
  - service.yaml
```

## Workflow

### 1. Push Code to GitHub

```bash
git add .
git commit -m "Update application"
git push
```

### 2. Jenkins Automatically Detects Changes

- SCM polling runs every 5 minutes
- Jenkins detects new commits
- Builds are triggered automatically

### 3. Build Executes

- Jenkins clones your repo
- Runs the Jenkinsfile
- Builds and deploys your application

## Benefits

### ✅ No Manual Configuration
- No clicking through Jenkins UI
- No manual job creation
- No manual git configuration

### ✅ Version Controlled
- All configuration in git
- Changes are tracked
- Easy to review and rollback

### ✅ Reproducible
- Destroy and recreate Jenkins anytime
- Configuration is automatically restored
- No state lost

### ✅ GitOps Ready
- Configuration lives in git
- Apply changes via kubectl
- Automated deployment pipelines

## Troubleshooting

### Jobs Not Created

Check if ConfigMap is mounted:
```bash
kubectl exec -n jenkins jenkins-controller-0 -- ls -la /var/jenkins_home/casc_configs/jobs/
```

Check Jenkins logs:
```bash
kubectl logs -n jenkins jenkins-controller-0 | grep -i "configuration as code"
```

### Jobs Not Triggering

Verify git URL is correct:
```bash
kubectl get configmap jenkins-casc-jobs -n jenkins -o yaml | grep url
```

Check Jenkins can reach GitHub:
```bash
kubectl exec -n jenkins jenkins-controller-0 -- curl -I https://github.com
```

### Configuration Not Reloading

Restart Jenkins:
```bash
kubectl rollout restart statefulset/jenkins-controller -n jenkins
```

## Adding New Jobs

1. Edit `k8s/jenkins/jobs-configmap.yaml`
2. Add new job definition using Job DSL syntax
3. Apply the configuration:
   ```bash
   kubectl apply -f k8s/jenkins/jobs-configmap.yaml
   kubectl rollout restart statefulset/jenkins-controller -n jenkins
   ```
4. Job will be created automatically on restart

## Summary

Your Jenkins setup is **fully automated**:
- ✅ Configuration defined in Kubernetes manifests
- ✅ Jobs automatically created from ConfigMaps
- ✅ Git integration configured automatically
- ✅ No manual steps required
- ✅ Everything version controlled in git

**Just deploy and it works!**
