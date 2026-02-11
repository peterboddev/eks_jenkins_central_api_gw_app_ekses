# Jenkins Jobs Setup Guide

**Last Updated**: 2025-02-11

## Overview

This guide explains how to set up Jenkins jobs for the nginx-api-build and nginx-docker-build pipelines. The jobs are defined as code in the repository using Job DSL, but need initial setup in Jenkins.

## Current Status

- ✅ Jenkins is running and accessible
- ✅ Job DSL plugin is installed
- ✅ JCasC configuration includes seed job definition
- ❌ Jobs not visible yet (need GitHub credentials and seed job trigger)

## Option 1: Manual Job Creation (Quickest)

### Step 1: Access Jenkins

1. Open Jenkins at: http://jenkins-alb-1673255351.us-west-2.elb.amazonaws.com
2. Log in with admin credentials

### Step 2: Create GitHub Credentials (if using private repo)

1. Navigate to **Manage Jenkins** > **Manage Credentials**
2. Click **(global)** domain
3. Click **Add Credentials**
4. Configure:
   - **Kind**: Username with password
   - **Scope**: Global
   - **Username**: Your GitHub username
   - **Password**: Your GitHub personal access token
   - **ID**: `github-credentials`
   - **Description**: GitHub credentials for repository access
5. Click **Create**

### Step 3: Create Seed Job Manually

1. Click **New Item**
2. Enter name: `seed-job`
3. Select **Freestyle project**
4. Click **OK**
5. Configure:
   - **Description**: Seed job that creates all other Jenkins jobs from Job DSL scripts
   - **Source Code Management**: Git
     - **Repository URL**: `https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git`
     - **Credentials**: Select `github-credentials` (if private repo)
     - **Branch**: `*/main`
   - **Build Triggers**: 
     - ☑ GitHub hook trigger for GITScm polling
     - ☑ Poll SCM: `H/5 * * * *`
   - **Build Steps**: Add build step > **Process Job DSLs**
     - **Look on Filesystem**: ☑
     - **DSL Scripts**: `jenkins-jobs/seed-job.groovy`
     - **Action for removed jobs**: Delete
     - **Action for removed views**: Delete
6. Click **Save**

### Step 4: Run Seed Job

1. Click **Build Now** on the seed-job
2. Wait for build to complete
3. Check console output for job creation messages
4. Refresh Jenkins dashboard - you should now see:
   - `nginx-api-build` job
   - `nginx-docker-build` job

## Option 2: Use JCasC Seed Job (Automated)

The seed job is already defined in JCasC configuration, but it needs GitHub credentials to work.

### Step 1: Add GitHub Credentials via JCasC

Edit `k8s/jenkins/jcasc-main-configmap.yaml` to add GitHub credentials:

```yaml
credentials:
  system:
    domainCredentials:
      - credentials:
          - usernamePassword:
              scope: GLOBAL
              id: "github-credentials"
              username: "${GITHUB_USERNAME}"
              password: "${GITHUB_TOKEN}"
              description: "GitHub credentials for repository access"
          - string:
              scope: GLOBAL
              id: "github-webhook-secret"
              secret: "${GITHUB_WEBHOOK_SECRET}"
              description: "GitHub webhook secret"
```

### Step 2: Add Secrets to Kubernetes

```bash
# Create GitHub credentials secret
kubectl create secret generic github-credentials -n jenkins \
  --from-literal=username='your-github-username' \
  --from-literal=token='your-github-token'

# Update StatefulSet to mount the secret
# Add to env section in statefulset.yaml:
- name: GITHUB_USERNAME
  valueFrom:
    secretKeyRef:
      name: github-credentials
      key: username
- name: GITHUB_TOKEN
  valueFrom:
    secretKeyRef:
      name: github-credentials
      key: token
```

### Step 3: Redeploy Jenkins

```bash
# Rebuild and deploy
npm run build
cdk deploy JenkinsApplicationStack --require-approval never

# Wait for Jenkins to restart
kubectl rollout status statefulset/jenkins-controller -n jenkins
```

### Step 4: Trigger Seed Job

The seed job should be created automatically by JCasC. Trigger it:

```bash
# Port forward to Jenkins
kubectl port-forward -n jenkins svc/jenkins 8080:8080

# Trigger seed job via CLI (or use UI)
# Install Jenkins CLI first, then:
java -jar jenkins-cli.jar -s http://localhost:8080/ build seed-job
```

## Option 3: Create Jobs via Jenkins CLI

If you have Jenkins CLI configured:

```bash
# Create seed job from XML
cat > seed-job.xml << 'EOF'
<?xml version='1.1' encoding='UTF-8'?>
<project>
  <description>Seed job that creates all other Jenkins jobs</description>
  <scm class="hudson.plugins.git.GitSCM">
    <userRemoteConfigs>
      <hudson.plugins.git.UserRemoteConfig>
        <url>https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git</url>
      </hudson.plugins.git.UserRemoteConfig>
    </userRemoteConfigs>
    <branches>
      <hudson.plugins.git.BranchSpec>
        <name>*/main</name>
      </hudson.plugins.git.BranchSpec>
    </branches>
  </scm>
  <triggers>
    <hudson.triggers.SCMTrigger>
      <spec>H/5 * * * *</spec>
    </hudson.triggers.SCMTrigger>
  </triggers>
  <builders>
    <javaposse.jobdsl.plugin.ExecuteDslScripts>
      <targets>jenkins-jobs/seed-job.groovy</targets>
      <removedJobAction>DELETE</removedJobAction>
      <removedViewAction>DELETE</removedViewAction>
    </javaposse.jobdsl.plugin.ExecuteDslScripts>
  </builders>
</project>
EOF

# Create job
java -jar jenkins-cli.jar -s http://localhost:8080/ create-job seed-job < seed-job.xml

# Trigger build
java -jar jenkins-cli.jar -s http://localhost:8080/ build seed-job
```

## Verification

After setting up jobs, verify they exist:

### Via UI
1. Open Jenkins dashboard
2. You should see:
   - `seed-job`
   - `nginx-api-build`
   - `nginx-docker-build`

### Via CLI
```bash
kubectl exec -n jenkins jenkins-controller-0 -- ls -la /var/jenkins_home/jobs/
```

Expected output:
```
drwxr-xr-x. 3 jenkins jenkins 6144 Feb 11 19:30 nginx-api-build
drwxr-xr-x. 3 jenkins jenkins 6144 Feb 11 19:30 nginx-docker-build
drwxr-xr-x. 3 jenkins jenkins 6144 Feb 11 19:30 seed-job
```

## Job Descriptions

### seed-job
- **Purpose**: Creates and updates all other Jenkins jobs from Job DSL scripts in Git
- **Trigger**: GitHub push, SCM polling every 5 minutes
- **Source**: `jenkins-jobs/seed-job.groovy`

### nginx-api-build
- **Purpose**: Build and deploy nginx-api application to nginx-api-cluster
- **Trigger**: GitHub push
- **Source**: `jenkins-jobs/nginx-api-build/Jenkinsfile`
- **Requirements**: 
  - GitHub credentials
  - AWS credentials (via IRSA)
  - kubectl access to nginx-api-cluster

### nginx-docker-build
- **Purpose**: Build nginx demo Docker image
- **Trigger**: GitHub push
- **Source**: `jenkins-jobs/nginx-docker-build/Jenkinsfile`
- **Requirements**:
  - GitHub credentials
  - Docker registry credentials
  - AWS ECR access (via IRSA)

## Troubleshooting

### Seed Job Fails with "Credentials not found"

**Solution**: Create GitHub credentials in Jenkins:
1. Manage Jenkins > Manage Credentials
2. Add credentials with ID: `github-credentials`

### Jobs Not Created After Seed Job Runs

**Solution**: Check seed job console output:
```bash
# Via UI: Click seed-job > Latest build > Console Output

# Via CLI:
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/jobs/seed-job/builds/lastSuccessfulBuild/log
```

### Job DSL Script Errors

**Solution**: Validate Job DSL syntax:
1. Navigate to seed-job configuration
2. Click **Process Job DSLs** > **API Viewer**
3. Test your DSL script

### GitHub Webhook Not Triggering Builds

**Solution**: Configure webhook in GitHub:
1. Go to repository settings > Webhooks
2. Add webhook:
   - **Payload URL**: `http://jenkins-alb-1673255351.us-west-2.elb.amazonaws.com/github-webhook/`
   - **Content type**: application/json
   - **Secret**: Use value from `jenkins/github-webhook-secret` in Secrets Manager
   - **Events**: Just the push event

## Next Steps

1. ✅ Create seed job (Option 1 recommended for quickest setup)
2. ✅ Run seed job to create other jobs
3. Configure GitHub webhooks for automatic builds
4. Test pipeline execution
5. Configure additional jobs as needed

## Notes

- The seed job approach follows Jenkins best practices for job-as-code
- All job definitions are in Git, making them version-controlled
- Changes to job definitions require running the seed job again
- For public repositories, GitHub credentials are optional
