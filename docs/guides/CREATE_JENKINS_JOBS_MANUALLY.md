# Create Jenkins Jobs Manually

Since the Jenkins jobs aren't being created automatically, here's how to create them manually via the Jenkins UI.

## Access Jenkins

Open your browser to: http://k8s-jenkins-jenkins-b637b220e8-2120753307.us-west-2.elb.amazonaws.com/

## Create nginx-api-build Job

1. Click "New Item" in the left sidebar
2. Enter name: `nginx-api-build`
3. Select "Pipeline" and click OK
4. Configure the job:

### General Section
- **Description**: `Build and deploy nginx-api Node.js application (with nginx reverse proxy) to nginx-api-cluster`
- **GitHub project**: Check this box
  - **Project url**: `https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses/`

### Build Triggers
- Check "GitHub hook trigger for GITScm polling"

### Pipeline Section
- **Definition**: Pipeline script from SCM
- **SCM**: Git
  - **Repository URL**: `https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git`
  - **Credentials**: (leave as none for public repo)
  - **Branch Specifier**: `*/main`
- **Script Path**: `jenkins-jobs/nginx-api-build/Jenkinsfile`
- **Lightweight checkout**: Check this box

5. Click "Save"

## Create nginx-docker-build Job

1. Click "New Item" in the left sidebar
2. Enter name: `nginx-docker-build`
3. Select "Pipeline" and click OK
4. Configure the job:

### General Section
- **Description**: `Build nginx demo Docker image`

### Build Triggers
- Check "GitHub hook trigger for GITScm polling"

### Pipeline Section
- **Definition**: Pipeline script from SCM
- **SCM**: Git
  - **Repository URL**: `https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git`
  - **Credentials**: (leave as none for public repo)
  - **Branch Specifier**: `*/main`
- **Script Path**: `jenkins-jobs/nginx-docker-build/Jenkinsfile`
- **Lightweight checkout**: Check this box

5. Click "Save"

## Verify Jobs

1. Go to Jenkins home page
2. You should see both jobs listed:
   - nginx-api-build
   - nginx-docker-build

## Test Webhook

1. Make a commit and push to the `main` branch
2. GitHub webhook should trigger both jobs
3. Check Jenkins to see if builds start automatically

## Troubleshooting

### Jobs don't trigger on push

1. Go to GitHub webhook settings: https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses/settings/hooks
2. Click on your webhook
3. Check "Recent Deliveries" tab
4. Look for green checkmarks (success) or red X (failure)
5. If failed, check the response body for error details

### Can't access Jenkins

- Verify the ALB URL is correct
- Check if Jenkins pod is running (you'll need cluster access for this)
- Try accessing via port-forward if you have cluster access

## Why Manual Creation?

Jenkins Configuration as Code (JCasC) can load configuration, but it doesn't automatically execute Job DSL scripts to create jobs. The jobs ConfigMap exists but needs to be processed by either:

1. Job DSL plugin with a seed job (requires plugin installation)
2. Jenkins REST API (requires authentication)
3. Manual creation via UI (simplest for now)

## Future Automation

To automate job creation in the future:

1. Install Job DSL plugin in Jenkins
2. Create a seed job that processes the jobs ConfigMap
3. Or use Jenkins REST API with authentication tokens
4. Or use Jenkins init scripts to create jobs on startup

For now, manual creation is the quickest path forward.
