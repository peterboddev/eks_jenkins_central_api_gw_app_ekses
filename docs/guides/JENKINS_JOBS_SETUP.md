# Jenkins Jobs Setup Guide

**Last Updated**: 2026-02-12

## Overview

This guide explains how Jenkins jobs are automatically created and managed in this infrastructure. Following the deployment philosophy, **everything is automated through CDK and JCasC** - no manual job creation required.

## Current Status

- ✅ Jenkins is running and accessible
- ✅ Job DSL plugin installed automatically
- ✅ Seed job created automatically via JCasC on Jenkins startup
- ✅ No manual job creation required
- ⏳ Waiting for GitHub push to trigger job creation

## How It Works (Automated)

### 1. Seed Job Creation (Automatic)

The seed job is created automatically when Jenkins starts via Jenkins Configuration as Code (JCasC):

- **Configuration**: `k8s/jenkins/jcasc-main-configmap.yaml`
- **Job DSL Script**: `jenkins-jobs/seed-job.groovy`
- **Repository**: https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git (public, no credentials needed)
- **Branch**: main
- **SCM Polling**: Every 5 minutes (H/5 * * * *)

### 2. Job Creation Flow

```
1. Jenkins starts
   ↓
2. JCasC creates seed job automatically
   ↓
3. SCM polling detects changes in repository
   ↓
4. Seed job runs Job DSL script
   ↓
5. nginx_api_build and nginx_docker_build jobs created
   ↓
6. Jobs ready to use
```

### 3. No Manual Steps Required

Following the deployment philosophy:
- ✅ Seed job created automatically via JCasC
- ✅ No manual job creation in Jenkins UI
- ✅ No kubectl commands needed
- ✅ No placeholder replacements
- ✅ Everything managed through code

## Jobs Created by Seed Job

### nginx_api_build
- **Purpose**: Build and deploy nginx-api application to nginx-api-cluster
- **Trigger**: GitHub push
- **Source**: `jenkins-jobs/nginx-api-build/Jenkinsfile`
- **Requirements**: 
  - AWS credentials (via IRSA - automatic)
  - kubectl access to nginx-api-cluster

### nginx_docker_build
- **Purpose**: Build nginx demo Docker image
- **Trigger**: GitHub push
- **Source**: `jenkins-jobs/nginx-docker-build/Jenkinsfile`
- **Requirements**:
  - AWS ECR access (via IRSA - automatic)

## Current Setup Status

### ✅ Completed
1. Seed job created automatically via JCasC
2. Job DSL script configured in repository
3. SCM polling enabled (every 5 minutes)
4. Public repository - no credentials needed

### ⏳ Pending
1. GitHub push with Job DSL fix (Code Defender approval required)
2. Seed job will automatically detect changes and create jobs

## Verification

### Check Seed Job Exists

```bash
# Via kubectl
kubectl exec -n jenkins jenkins-controller-0 -- ls -la /var/jenkins_home/jobs/

# Expected output:
drwxr-xr-x. 3 jenkins jenkins 6144 Feb 12 00:30 seed-job
```

### Check Seed Job Configuration

```bash
# View seed job config
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/jobs/seed-job/config.xml
```

### Check Seed Job Logs

```bash
# View latest build log
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/jobs/seed-job/builds/1/log
```

### After GitHub Push - Check Created Jobs

```bash
# List all jobs
kubectl exec -n jenkins jenkins-controller-0 -- ls -la /var/jenkins_home/jobs/

# Expected output after seed job runs:
drwxr-xr-x. 3 jenkins jenkins 6144 Feb 12 00:30 nginx_api_build
drwxr-xr-x. 3 jenkins jenkins 6144 Feb 12 00:30 nginx_docker_build
drwxr-xr-x. 3 jenkins jenkins 6144 Feb 12 00:30 seed-job
```

## Accessing Jenkins

### Via ALB (Recommended)

```bash
# Get ALB URL
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Output: jenkins-alb-652899647.us-west-2.elb.amazonaws.com
```

- **URL**: http://jenkins-alb-652899647.us-west-2.elb.amazonaws.com
- **Username**: admin
- **Password**: admin
- **Access**: Restricted to IPs in `security/alb-ip-whitelist.json`

### Via Port Forward (Alternative)

```bash
# Port forward to Jenkins
kubectl port-forward -n jenkins svc/jenkins 8080:8080

# Access at: http://localhost:8080
```

## Triggering Seed Job Manually (Optional)

If you want to trigger the seed job immediately instead of waiting for SCM polling:

### Via Jenkins UI
1. Open Jenkins at ALB URL
2. Click on `seed-job`
3. Click **Build Now**
4. Wait for build to complete
5. Refresh dashboard - nginx jobs should appear

### Via Jenkins CLI (Advanced)

```bash
# Port forward first
kubectl port-forward -n jenkins svc/jenkins 8080:8080

# Download Jenkins CLI
wget http://localhost:8080/jnlpJars/jenkins-cli.jar

# Trigger build
java -jar jenkins-cli.jar -s http://localhost:8080/ -auth admin:admin build seed-job
```

## Job DSL Script Details

### Location
`jenkins-jobs/seed-job.groovy`

### Job Naming Convention
- Use underscores (not hyphens) in job names
- Job DSL requires: letters, digits, underscores only
- Example: `nginx_api_build` (not `nginx-api-build`)

### Script Content

```groovy
pipelineJob('nginx_api_build') {
    description('Build and deploy nginx-api application to nginx-api-cluster')
    
    properties {
        githubProjectUrl('https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses')
    }
    
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
            scriptPath('jenkins-jobs/nginx-api-build/Jenkinsfile')
            lightweight(true)
        }
    }
}

pipelineJob('nginx_docker_build') {
    description('Build nginx demo Docker image')
    
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
            scriptPath('jenkins-jobs/nginx-docker-build/Jenkinsfile')
            lightweight(true)
        }
    }
}
```

## Updating Jobs

To update job definitions:

1. Edit `jenkins-jobs/seed-job.groovy` in your repository
2. Commit and push changes to GitHub
3. Wait for SCM polling (5 minutes) or trigger seed job manually
4. Seed job will update existing jobs automatically

## Troubleshooting

### Seed Job Not Created

**Check JCasC Configuration**:
```bash
kubectl logs -n jenkins jenkins-controller-0 | grep "seed-job"
```

Expected output:
```
createOrUpdateConfig for seed-job
```

**Solution**: JCasC creates the seed job automatically. If missing, check:
- `k8s/jenkins/jcasc-main-configmap.yaml` has jobs section
- Jenkins pod restarted after ConfigMap changes

### Seed Job Fails with "invalid script name"

**Cause**: Job names contain hyphens (not allowed by Job DSL)

**Solution**: Use underscores in job names:
- ✅ `nginx_api_build`
- ❌ `nginx-api-build`

### Jobs Not Created After Seed Job Runs

**Check Seed Job Console Output**:
```bash
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/jobs/seed-job/builds/1/log
```

**Common Issues**:
1. Job DSL syntax error - check groovy script
2. Repository not accessible - verify URL
3. Job naming error - use underscores only

### GitHub Push Blocked by Code Defender

**Solution**: Approve repository first:
```bash
git-defender --request-repo --url https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git --reason 3
```

Then push:
```bash
git push origin main
```

### SCM Polling Not Working

**Check Seed Job Configuration**:
```bash
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/jobs/seed-job/config.xml | grep -A 3 "SCMTrigger"
```

Expected output:
```xml
<hudson.triggers.SCMTrigger>
    <spec>H/5 * * * *</spec>
    <ignorePostCommitHooks>false</ignorePostCommitHooks>
</hudson.triggers.SCMTrigger>
```

## GitHub Webhooks (Optional)

For instant builds instead of polling:

### Step 1: Get Webhook Secret

```bash
aws secretsmanager get-secret-value \
  --secret-id jenkins/github-webhook-secret \
  --region us-west-2 \
  --query SecretString \
  --output text | jq -r .secret
```

### Step 2: Configure in GitHub

1. Go to repository settings > Webhooks
2. Add webhook:
   - **Payload URL**: `http://jenkins-alb-652899647.us-west-2.elb.amazonaws.com/github-webhook/`
   - **Content type**: application/json
   - **Secret**: Use value from Step 1
   - **Events**: Just the push event
3. Click **Add webhook**

## Deployment Philosophy Compliance

This setup follows the deployment philosophy:

- ✅ **No Manual Steps**: Seed job created automatically via JCasC
- ✅ **No kubectl Commands**: Everything managed through CDK
- ✅ **No Placeholders**: Repository URL and configuration in code
- ✅ **Git Push Managed**: Jobs created automatically after push
- ✅ **Repeatable**: Same setup in any environment

## Next Steps

1. ⏳ Approve GitHub repository in Code Defender
2. ⏳ Push Job DSL fix: `git push origin main`
3. ⏳ Wait for SCM polling (5 min) or manually trigger seed job
4. ⏳ Verify nginx_api_build and nginx_docker_build jobs are created
5. Configure GitHub webhooks for instant builds (optional)
6. Test pipeline execution
7. Add more jobs to seed-job.groovy as needed

## Notes

- Seed job is created automatically - no manual creation required
- Public repository - no GitHub credentials needed
- Job names must use underscores (not hyphens) for Job DSL compatibility
- SCM polling runs every 5 minutes
- All job definitions are version-controlled in Git
- Changes to jobs require updating seed-job.groovy and pushing to GitHub
