# Jenkins Jobs as Configuration-as-Code

This project uses **Jenkins Configuration as Code (JCasC)** to manage Jenkins jobs declaratively.

## Architecture

```
┌─────────────────────────────────────┐
│  k8s/jenkins/jobs-configmap.yaml    │  ← Job definitions (version controlled)
└──────────────┬──────────────────────┘
               │ kubectl apply
               ↓
┌─────────────────────────────────────┐
│  jenkins-casc-jobs ConfigMap        │  ← Kubernetes ConfigMap
└──────────────┬──────────────────────┘
               │ mounted to Jenkins pod
               ↓
┌─────────────────────────────────────┐
│  Jenkins Controller                 │  ← Reads config on startup
│  /var/jenkins_home/casc_configs/    │
└─────────────────────────────────────┘
```

## Benefits

✅ **Version Controlled** - Job definitions are in Git
✅ **Declarative** - Define what you want, not how to create it
✅ **Reproducible** - Recreate Jenkins from scratch with all jobs
✅ **No Manual Steps** - No clicking through UI or running scripts
✅ **Survives Updates** - Jobs persist through Jenkins upgrades/restarts

## Current Jobs

### nginx-api-build
- **Purpose**: Build and deploy nginx-api application
- **Trigger**: SCM polling every 5 minutes
- **Source**: `jenkins-jobs/nginx-api-build/Jenkinsfile`
- **Target**: nginx-api-cluster

### nginx-docker-build
- **Purpose**: Build nginx demo Docker image
- **Trigger**: SCM polling every 5 minutes
- **Source**: `jenkins-jobs/nginx-docker-build/Jenkinsfile`
- **Target**: Jenkins ECR

## How to Deploy Jobs

### Initial Setup (One-time)

```powershell
# Deploy the jobs ConfigMap
.\k8s\jenkins\deploy-jobs.ps1
```

This will:
1. Create the `jenkins-casc-jobs` ConfigMap
2. Restart Jenkins to load the configuration
3. Jobs appear automatically in Jenkins UI

### Adding a New Job

1. **Create the Jenkinsfile** in `jenkins-jobs/<job-name>/Jenkinsfile`

2. **Add job definition** to `k8s/jenkins/jobs-configmap.yaml`:
   ```yaml
   - script: >
       pipelineJob('my-new-job') {
         description('My job description')
         definition {
           cpsScm {
             scm {
               git {
                 remote {
                   url('https://github.com/YOUR_USERNAME/eks_jenkins.git')
                 }
                 branches('*/main')
               }
             }
             scriptPath('jenkins-jobs/my-new-job/Jenkinsfile')
           }
         }
       }
   ```

3. **Apply the changes**:
   ```powershell
   .\k8s\jenkins\deploy-jobs.ps1
   ```

### Updating an Existing Job

1. Edit the job definition in `k8s/jenkins/jobs-configmap.yaml`
2. Run `.\k8s\jenkins\deploy-jobs.ps1`
3. Jenkins will reload and update the job

### Deleting a Job

1. Remove the job definition from `k8s/jenkins/jobs-configmap.yaml`
2. Run `.\k8s\jenkins\deploy-jobs.ps1`
3. Manually delete the job from Jenkins UI (JCasC doesn't delete jobs)

## Files

- **`k8s/jenkins/jobs-configmap.yaml`** - Job definitions (edit this)
- **`k8s/jenkins/deploy-jobs.ps1`** - Deployment script (Windows)
- **`k8s/jenkins/deploy-jobs.sh`** - Deployment script (Linux/Mac)
- **`jenkins-helm-values.yaml`** - Jenkins Helm configuration (mounts ConfigMap)

## Workflow for Developers

As a developer working on the nginx-api application:

1. **Make code changes** to `nginx-api/` (e.g., add new endpoint)
2. **Commit and push** to Git
3. **Jenkins automatically builds** via the `nginx-api-build` job
4. **Image is pushed** to ECR
5. **Deployment is updated** in nginx-api-cluster
6. **Test the changes** via API Gateway

No manual intervention needed! 🎉

## Troubleshooting

### Jobs don't appear after deployment

1. Check ConfigMap exists:
   ```powershell
   .\kubectl.exe get configmap jenkins-casc-jobs -n jenkins
   ```

2. Check Jenkins logs:
   ```powershell
   .\kubectl.exe logs -n jenkins -l app.kubernetes.io/component=jenkins-controller
   ```

3. Verify ConfigMap is mounted:
   ```powershell
   .\kubectl.exe describe pod -n jenkins -l app.kubernetes.io/component=jenkins-controller
   ```

### Jobs exist but don't update

JCasC only creates jobs, it doesn't update existing ones. To force update:
1. Delete the job from Jenkins UI
2. Restart Jenkins: `.\kubectl.exe rollout restart statefulset/jenkins -n jenkins`

### Syntax errors in job definition

Check Jenkins logs for JCasC errors:
```powershell
.\kubectl.exe logs -n jenkins -l app.kubernetes.io/component=jenkins-controller | Select-String -Pattern "JCasC"
```

## References

- [Jenkins Configuration as Code](https://github.com/jenkinsci/configuration-as-code-plugin)
- [Job DSL Plugin](https://plugins.jenkins.io/job-dsl/)
- [Jenkins Helm Chart](https://github.com/jenkinsci/helm-charts)

## Migration from Manual Jobs

If you have existing manually-created jobs:

1. Export job config: `java -jar jenkins-cli.jar get-job <job-name> > job.xml`
2. Convert to Job DSL format (see examples in `k8s/jenkins/jobs-configmap.yaml`)
3. Add to ConfigMap
4. Deploy: `.\k8s\jenkins\deploy-jobs.ps1`
5. Delete old manual job from UI
