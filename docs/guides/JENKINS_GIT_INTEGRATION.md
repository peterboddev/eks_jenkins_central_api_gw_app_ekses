# Jenkins Git Integration Guide

## How Jenkins Picks Up Your Code

Your Jenkins setup uses **Git SCM polling** to automatically detect and build changes from your GitHub repository.

### Current Configuration

**Repository**: `https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git`  
**Branch**: `master`  
**Poll Interval**: Every 5 minutes (`H/5 * * * *`)

### How It Works

1. **Jobs Defined as Code**: Jenkins jobs are configured in `k8s/jenkins/jobs-configmap.yaml`
2. **SCM Polling**: Jenkins checks GitHub every 5 minutes for new commits
3. **Automatic Builds**: When changes are detected, Jenkins:
   - Clones the repository
   - Checks out the `master` branch
   - Runs the Jenkinsfile from the appropriate directory
4. **Pipeline Execution**: The Jenkinsfile defines the build/deploy steps

### Jenkins Jobs

#### 1. nginx-api-build
- **Jenkinsfile**: `jenkins-jobs/nginx-api-build/Jenkinsfile`
- **Purpose**: Build and deploy the Node.js API to nginx-api-cluster
- **Triggers**: Git changes + every 5 minutes polling

#### 2. nginx-docker-build
- **Jenkinsfile**: `jenkins-jobs/nginx-docker-build/Jenkinsfile`
- **Purpose**: Build nginx demo Docker image
- **Triggers**: Git changes + every 5 minutes polling

### Workflow

```
┌─────────────────┐
│  Push to GitHub │
│   (master)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Jenkins Polls   │◄─── Every 5 minutes
│ (H/5 * * * *)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Change Detected?│
└────────┬────────┘
         │ Yes
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

### Webhook Alternative (Optional)

For instant builds instead of polling, you can configure GitHub webhooks:

1. **In GitHub**: Settings → Webhooks → Add webhook
   - Payload URL: `http://<JENKINS_URL>/github-webhook/`
   - Content type: `application/json`
   - Events: Just the push event

2. **In Jenkins ConfigMap**: Change trigger from:
   ```groovy
   triggers {
     scm('H/5 * * * *')  // Polling
   }
   ```
   To:
   ```groovy
   triggers {
     githubPush()  // Webhook
   }
   ```

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
2. **Wait up to 5 minutes** for Jenkins to detect it
3. **Check Jenkins UI** to see the build running
4. **View logs** in Jenkins or kubectl

### Files Updated

All placeholder URLs have been updated to your actual repository:
- ✅ `k8s/jenkins/jobs-configmap.yaml`
- ✅ `jenkins-jobs/seed-job.groovy`
- ✅ `jenkins-jobs/nginx-api-build/job-config.xml`
- ✅ `jenkins-jobs/nginx-api-build/README.md`
- ✅ `docs/guides/JENKINS_JOBS_AS_CODE.md`
