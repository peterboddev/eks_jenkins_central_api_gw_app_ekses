# Jenkins Git Integration Guide

## How Jenkins Picks Up Your Code

Your Jenkins setup uses **Git SCM polling** to automatically detect and build changes from your GitHub repository.

### Current Configuration

**Repository**: `https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git`  
**Branch**: `master`  
**Trigger**: GitHub webhook (instant builds on push)

### How It Works

1. **Jobs Defined as Code**: Jenkins jobs are configured in `k8s/jenkins/jobs-configmap.yaml`
2. **GitHub Webhooks**: GitHub sends webhook to Jenkins when you push code
3. **Instant Builds**: Jenkins receives webhook and immediately:
   - Clones the repository
   - Checks out the `master` branch
   - Runs the Jenkinsfile from the appropriate directory
4. **Pipeline Execution**: The Jenkinsfile defines the build/deploy steps

### Jenkins Jobs

#### 1. nginx-api-build
- **Jenkinsfile**: `jenkins-jobs/nginx-api-build/Jenkinsfile`
- **Purpose**: Build and deploy the Node.js API to nginx-api-cluster
- **Triggers**: GitHub webhook (instant)

#### 2. nginx-docker-build
- **Jenkinsfile**: `jenkins-jobs/nginx-docker-build/Jenkinsfile`
- **Purpose**: Build nginx demo Docker image
- **Triggers**: GitHub webhook (instant)

### Workflow

```
┌─────────────────┐
│  Push to GitHub │
│   (master)      │
└────────┬────────┘
         │
         │ Webhook (instant)
         ▼
┌─────────────────┐
│ Jenkins Receives│
│ Webhook         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Clone Repo      │
│ Checkout master │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Run Jenkinsfile │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Build & Deploy  │
└─────────────────┘
```

### Applying Configuration Changes

The jobs configuration is **automatically loaded** by Jenkins through Kubernetes ConfigMaps:

**How it works:**
1. Jobs are defined in `k8s/jenkins/jobs-configmap.yaml`
2. ConfigMap is mounted into Jenkins pod at `/var/jenkins_home/casc_configs/jobs`
3. Jenkins Configuration as Code (JCasC) plugin automatically loads it on startup
4. Jobs are created/updated automatically - no manual steps needed!

**When you update jobs:**
```bash
# Apply the entire Jenkins configuration (includes jobs)
kubectl apply -k k8s/jenkins/

# Jenkins will automatically reload the configuration
# If it doesn't, restart Jenkins:
kubectl rollout restart statefulset/jenkins-controller -n jenkins
```

**Initial deployment:**
```bash
# Deploy Jenkins with all configurations
kubectl apply -k k8s/jenkins/

# Wait for Jenkins to be ready
kubectl rollout status statefulset/jenkins-controller -n jenkins

# Jobs will be automatically created on first startup
```

### Manual Trigger

If you don't want to wait for polling, you can manually trigger a build:

1. Open Jenkins UI: `http://<JENKINS_URL>`
2. Navigate to the job (nginx-api-build or nginx-docker-build)
3. Click "Build Now"

### Troubleshooting

**Jobs not triggering?**
- Check Jenkins can reach GitHub (network/firewall)
- Verify the repository URL is correct
- Check Jenkins logs: `kubectl logs -f statefulset/jenkins -n jenkins`
- Manually trigger a build to test the pipeline

**Authentication issues?**
- For public repos: No credentials needed
- For private repos: Add GitHub credentials in Jenkins
  - Jenkins → Manage Jenkins → Credentials
  - Add GitHub personal access token
  - Update jobs-configmap.yaml to reference credentials

**Wrong branch?**
- Verify you're pushing to `master` branch
- Check the branch configuration in jobs-configmap.yaml

### Next Steps

1. **Push a change** to your repository
2. **Set up GitHub webhook** (see [GitHub Webhook Setup Guide](GITHUB_WEBHOOK_SETUP.md))
3. **Builds trigger instantly** when you push code
4. **View logs** in Jenkins or kubectl

### Setting Up GitHub Webhook

For instant builds instead of waiting, configure a GitHub webhook:

**Quick setup:**
1. Get Jenkins ALB URL: `kubectl get ingress jenkins -n jenkins`
2. In GitHub: Settings → Webhooks → Add webhook
3. Payload URL: `http://<JENKINS_ALB_URL>/github-webhook/`
4. Content type: `application/json`
5. Events: Just the push event
6. Save webhook

**Detailed instructions:** See [GitHub Webhook Setup Guide](GITHUB_WEBHOOK_SETUP.md)

### Files Updated

All placeholder URLs have been updated to your actual repository:
- ✅ `k8s/jenkins/jobs-configmap.yaml`
- ✅ `jenkins-jobs/seed-job.groovy`
- ✅ `jenkins-jobs/nginx-api-build/job-config.xml`
- ✅ `jenkins-jobs/nginx-api-build/README.md`
- ✅ `docs/guides/JENKINS_JOBS_AS_CODE.md`
