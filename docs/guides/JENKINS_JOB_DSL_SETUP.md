# Jenkins Job DSL Plugin Setup

This guide explains how to set up Jenkins with the Job DSL plugin to automatically create jobs from code.

## What Changed

We've added:
1. **Job DSL Plugin** - Automatically creates jobs from Groovy scripts
2. **Plugins ConfigMap** - Defines which plugins to install
3. **Seed Job ConfigMap** - JCasC configuration that creates a seed job
4. **Init Container** - Installs plugins before Jenkins starts

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Init Container installs plugins from plugins.txt         │
│    (including job-dsl plugin)                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Jenkins starts and loads JCasC configurations            │
│    - Agent pod template                                      │
│    - Seed job configuration                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. JCasC creates the "seed-job" automatically                │
│    - Polls GitHub every 5 minutes                            │
│    - Runs jenkins-jobs/seed-job.groovy                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Seed job processes Job DSL script                         │
│    - Creates nginx-api-build job                             │
│    - Creates nginx-docker-build job                          │
│    - Both jobs watch the main branch                         │
│    - Both jobs have GitHub webhook triggers                  │
└─────────────────────────────────────────────────────────────┘
```

## Files Added

- `k8s/jenkins/plugins-configmap.yaml` - List of plugins to install
- `k8s/jenkins/jcasc-seed-job-configmap.yaml` - Seed job configuration
- Updated `k8s/jenkins/statefulset.yaml` - Added init container and volume mounts
- Updated `k8s/jenkins/kustomization.yaml` - Added new ConfigMaps

## Deployment

### Prerequisites

You need access to the Jenkins EKS cluster. Since it has a private endpoint, you'll need to:
- Use a bastion host in the VPC
- Or use AWS Systems Manager Session Manager
- Or temporarily enable public endpoint access

### Deploy the Update

```bash
# Switch to Jenkins cluster context
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2

# Apply the updated configuration
cd k8s/jenkins
kubectl apply -k .

# Restart Jenkins to pick up changes
kubectl rollout restart statefulset/jenkins-controller -n jenkins

# Wait for Jenkins to be ready (this will take a few minutes due to plugin installation)
kubectl rollout status statefulset/jenkins-controller -n jenkins

# Check logs to see plugin installation progress
kubectl logs -n jenkins -l app=jenkins-controller -c install-plugins

# Check Jenkins logs
kubectl logs -n jenkins -l app=jenkins-controller -c jenkins -f
```

### Verify Installation

1. **Check if plugins are installed**:
   - Access Jenkins UI
   - Go to "Manage Jenkins" → "Manage Plugins" → "Installed"
   - Look for "Job DSL" plugin

2. **Check if seed job was created**:
   - Go to Jenkins home page
   - You should see a job called "seed-job"
   - Click on it and check if it ran successfully

3. **Check if jobs were created**:
   - Go to Jenkins home page
   - You should see:
     - nginx-api-build
     - nginx-docker-build

## Troubleshooting

### Plugins not installing

Check init container logs:
```bash
kubectl logs -n jenkins -l app=jenkins-controller -c install-plugins
```

Common issues:
- Network connectivity (private subnet needs NAT Gateway)
- Plugin dependencies missing (check plugins.txt)

### Seed job not created

Check Jenkins logs:
```bash
kubectl logs -n jenkins -l app=jenkins-controller -c jenkins | grep -i "seed"
```

Common issues:
- JCasC configuration syntax error
- Job DSL plugin not installed
- ConfigMap not mounted correctly

### Jobs not created by seed job

1. Check seed job console output in Jenkins UI
2. Look for Job DSL errors
3. Common issues:
   - Groovy syntax error in seed-job.groovy
   - GitHub repository not accessible
   - Branch name mismatch (should be `main`)

### Jenkins pod stuck in Init

Check init container status:
```bash
kubectl describe pod -n jenkins -l app=jenkins-controller
```

The init container needs to download plugins, which can take 2-5 minutes.

## Benefits of This Approach

### ✅ Infrastructure as Code
- Jobs are defined in Git
- Version controlled
- Reviewable via pull requests

### ✅ Automatic Job Creation
- No manual UI work
- Jobs created on Jenkins startup
- Jobs updated when seed-job.groovy changes

### ✅ Disaster Recovery
- If Jenkins data is lost, jobs are recreated automatically
- Just redeploy and jobs come back

### ✅ Consistency
- All environments use the same job definitions
- No configuration drift

## How to Add New Jobs

1. Edit `jenkins-jobs/seed-job.groovy`
2. Add your new job definition using Job DSL syntax
3. Commit and push to GitHub
4. Seed job will run automatically (every 5 minutes)
5. Or trigger seed job manually in Jenkins UI

Example:
```groovy
pipelineJob('my-new-job') {
    description('My new pipeline job')
    
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

## Next Steps

After deployment:
1. Verify jobs are created
2. Test webhook by pushing code
3. Monitor seed job for any errors
4. Add more jobs as needed by editing seed-job.groovy

## Rollback

If something goes wrong, you can rollback:

```bash
# Rollback to previous version
kubectl rollout undo statefulset/jenkins-controller -n jenkins

# Or delete the new ConfigMaps and restart
kubectl delete configmap jenkins-plugins jenkins-casc-seed-job -n jenkins
kubectl rollout restart statefulset/jenkins-controller -n jenkins
```

Then create jobs manually as documented in `CREATE_JENKINS_JOBS_MANUALLY.md`.
