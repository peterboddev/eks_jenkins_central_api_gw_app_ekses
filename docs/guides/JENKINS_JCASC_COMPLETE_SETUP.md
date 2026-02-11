# Jenkins Complete JCasC Setup

This is the complete, automated Jenkins setup using Jenkins Configuration as Code (JCasC).

## What This Does

✅ **Plugins** - Auto-installs all required plugins (including Job DSL)  
✅ **Security** - Configures admin user with password from Secrets Manager  
✅ **Credentials** - Pulls GitHub webhook secret from AWS Secrets Manager  
✅ **Seed Job** - Auto-creates seed job that reads `jenkins-jobs/seed-job.groovy`  
✅ **Pipeline Jobs** - Seed job creates nginx-api-build and nginx-docker-build jobs  
✅ **Webhooks** - Jobs trigger on GitHub push events  
✅ **Auto-reload** - JCasC reloads configuration on restart  

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CDK creates GitHub webhook secret in Secrets Manager     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Kubernetes Job syncs secrets to K8s Secret               │
│    - Pulls from AWS Secrets Manager                         │
│    - Creates jenkins-secrets Secret                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Init container installs plugins from plugins.txt         │
│    - job-dsl, github, kubernetes, etc.                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Jenkins starts and loads JCasC from ConfigMaps           │
│    - jenkins-casc-main: Main config (security, seed job)    │
│    - jenkins-agent-pod-template: Agent configuration        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. JCasC creates seed-job automatically                     │
│    - Watches GitHub repo                                    │
│    - Triggers on push or every 5 minutes                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Seed job runs jenkins-jobs/seed-job.groovy               │
│    - Creates nginx-api-build job                            │
│    - Creates nginx-docker-build job                         │
│    - Both watch main branch                                 │
│    - Both have GitHub webhook triggers                      │
└─────────────────────────────────────────────────────────────┘
```

## Files

### New Files
- `k8s/jenkins/jcasc-main-configmap.yaml` - Main JCasC configuration
- `k8s/jenkins/plugins-configmap.yaml` - Plugins to install
- `k8s/jenkins/secrets-sync-job.yaml` - Syncs secrets from AWS to K8s

### Updated Files
- `k8s/jenkins/statefulset.yaml` - Added init container, secrets, volume mounts
- `k8s/jenkins/kustomization.yaml` - Updated resource list

### Existing Files (unchanged)
- `jenkins-jobs/seed-job.groovy` - Job definitions (in Git)
- `jenkins-jobs/nginx-api-build/Jenkinsfile` - Build pipeline
- `jenkins-jobs/nginx-docker-build/Jenkinsfile` - Build pipeline

## Prerequisites

1. **AWS Secrets Manager** - GitHub webhook secret already created by CDK
2. **EKS Cluster** - Jenkins cluster running
3. **IAM Permissions** - Jenkins service account can read Secrets Manager

## Deployment

### Step 1: Sync Secrets from AWS to Kubernetes

```bash
# Run the secrets sync job
kubectl apply -f k8s/jenkins/secrets-sync-job.yaml

# Wait for it to complete
kubectl wait --for=condition=complete --timeout=60s job/jenkins-secrets-sync -n jenkins

# Verify secret was created
kubectl get secret jenkins-secrets -n jenkins

# Check job logs
kubectl logs -n jenkins job/jenkins-secrets-sync
```

### Step 2: Deploy Jenkins with JCasC

```bash
# Apply all manifests
cd k8s/jenkins
kubectl apply -k .

# Wait for Jenkins to be ready (takes 5-10 minutes for plugin installation)
kubectl rollout status statefulset/jenkins-controller -n jenkins

# Watch the logs
kubectl logs -n jenkins -l app=jenkins-controller -c install-plugins -f
kubectl logs -n jenkins -l app=jenkins-controller -c jenkins -f
```

### Step 3: Verify Setup

```bash
# Check if plugins are installed
kubectl exec -n jenkins -it $(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}') -- ls /var/jenkins_home/plugins/ | grep job-dsl

# Access Jenkins UI
# Get ALB URL from your existing setup
# Login with admin / (password from Secrets Manager or "admin123")

# Check if seed-job exists
# Check if nginx-api-build and nginx-docker-build jobs exist
```

## What Gets Created

### In Jenkins UI

1. **seed-job** - Automatically created by JCasC
   - Polls GitHub every 5 minutes
   - Triggers on GitHub push
   - Runs `jenkins-jobs/seed-job.groovy`

2. **nginx-api-build** - Created by seed job
   - Watches `main` branch
   - Triggers on GitHub webhook
   - Runs `jenkins-jobs/nginx-api-build/Jenkinsfile`

3. **nginx-docker-build** - Created by seed job
   - Watches `main` branch
   - Triggers on GitHub webhook
   - Runs `jenkins-jobs/nginx-docker-build/Jenkinsfile`

## Configuration Details

### Admin Password

Default: `admin123` (change this!)

To set a custom password:
```bash
# Create admin password in Secrets Manager
aws secretsmanager create-secret \
  --name jenkins/admin-password \
  --secret-string "your-secure-password" \
  --region us-west-2

# Re-run secrets sync job
kubectl delete job jenkins-secrets-sync -n jenkins
kubectl apply -f k8s/jenkins/secrets-sync-job.yaml
```

### GitHub Webhook Secret

Already created by CDK at: `jenkins/github-webhook-secret`

To retrieve:
```bash
aws secretsmanager get-secret-value \
  --secret-id jenkins/github-webhook-secret \
  --region us-west-2 \
  --query SecretString \
  --output text | jq -r .secret
```

### JCasC Reload

Jenkins automatically reloads JCasC configuration on restart.

To reload without restart:
1. Go to "Manage Jenkins" → "Configuration as Code"
2. Click "Reload existing configuration"

Or via API:
```bash
curl -X POST http://jenkins:8080/configuration-as-code/reload \
  -u admin:your-password
```

## Adding New Jobs

1. Edit `jenkins-jobs/seed-job.groovy`
2. Add your new job definition
3. Commit and push to GitHub
4. Seed job will run automatically (within 5 minutes)
5. Or trigger seed job manually in Jenkins UI

Example:
```groovy
pipelineJob('my-new-job') {
    description('My new pipeline')
    
    triggers {
        githubPush()
    }
    
    definition {
        cpsScm {
            scm {
                git {
                    remote {
                        url('https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git')
                    }
                    branches('*/main')
                }
            }
            scriptPath('jenkins-jobs/my-new-job/Jenkinsfile')
            lightweight(true)
        }
    }
}
```

## Troubleshooting

### Plugins not installing

Check init container logs:
```bash
kubectl logs -n jenkins -l app=jenkins-controller -c install-plugins
```

### Secrets not syncing

Check secrets sync job:
```bash
kubectl logs -n jenkins job/jenkins-secrets-sync
kubectl describe job jenkins-secrets-sync -n jenkins
```

### Seed job not created

Check Jenkins logs for JCasC errors:
```bash
kubectl logs -n jenkins -l app=jenkins-controller -c jenkins | grep -i "configuration as code"
```

### Jobs not created by seed job

1. Check seed job console output in Jenkins UI
2. Look for Job DSL errors
3. Verify `jenkins-jobs/seed-job.groovy` syntax

## Benefits

✅ **Fully Automated** - No manual job creation  
✅ **Version Controlled** - All config in Git  
✅ **Reproducible** - Rebuild Jenkins anytime  
✅ **Secure** - Secrets from AWS Secrets Manager  
✅ **Scalable** - Easy to add new jobs  
✅ **Maintainable** - Config as code, not UI clicks  

## Next Steps

1. Deploy using the steps above
2. Verify jobs are created
3. Test webhook by pushing code
4. Add more jobs by editing seed-job.groovy
5. Customize JCasC configuration as needed

## Rollback

If something goes wrong:

```bash
# Delete everything
kubectl delete -k k8s/jenkins/

# Redeploy previous version
git checkout <previous-commit>
kubectl apply -k k8s/jenkins/
```

Or create jobs manually using `docs/guides/CREATE_JENKINS_JOBS_MANUALLY.md`.
