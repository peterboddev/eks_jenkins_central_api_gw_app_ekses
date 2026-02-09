# nginx-api Build Job

This Jenkins job builds and deploys the nginx-api Node.js application (with nginx reverse proxy) to the nginx-api-cluster.

## Architecture

The application consists of:
- **Node.js Express app** (port 3000) - Where developers write actual application code
- **nginx reverse proxy** (port 8080) - Forwards requests to Node.js app

Both run in the same container, with nginx proxying all requests to the Node.js backend.

## What it does

1. **Checkout** - Pulls the latest code from the repository
2. **Build** - Builds the Docker image from `nginx-api/Dockerfile` (includes npm install)
3. **Push** - Pushes the image to ECR (`450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-api`)
4. **Deploy** - Updates the deployment in the nginx-api-cluster
5. **Verify** - Checks that the deployment rolled out successfully
6. **Integration Tests** - Tests all API endpoints through API Gateway with Cognito auth
   - GET /health
   - GET /api/info
   - GET /api/test
   - POST /api/echo

The pipeline will **fail** if any endpoint test fails, ensuring only working code is deployed.

## Prerequisites

- Jenkins must have access to the nginx-api-cluster via Transit Gateway
- ECR repository `nginx-api` must exist
- nginx-api application must be deployed (initial Helm deployment)
- Jenkins service account must have appropriate IAM permissions

## Creating the Job

Jobs are managed as Configuration-as-Code using Jenkins Configuration as Code (JCasC).

### Deploy Jobs via ConfigMap

```powershell
# Apply the jobs ConfigMap and restart Jenkins
.\k8s\jenkins\deploy-jobs.ps1
```

Or on Linux/Mac:
```bash
./k8s/jenkins/deploy-jobs.sh
```

This will:
1. Create/update the `jenkins-casc-jobs` ConfigMap with job definitions
2. Restart Jenkins to load the new configuration
3. Jobs will be automatically created by JCasC

### Adding New Jobs

To add a new job, edit `k8s/jenkins/jobs-configmap.yaml` and add your job definition:

```yaml
- script: >
    pipelineJob('my-new-job') {
      description('My new job description')
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

Then run `.\k8s\jenkins\deploy-jobs.ps1` to apply the changes.

### Manual Creation (Not Recommended)

If you need to create a job manually for testing:

```bash
# From the project root
java -jar jenkins-cli.jar -s http://k8s-jenkins-jenkins-b637b220e8-2120753307.us-west-2.elb.amazonaws.com \
  -auth admin:g3YVie94Ei61bVdGVHawnV \
  create-job nginx-api-build < jenkins-jobs/nginx-api-build/job-config.xml
```

### Option 2: Using Jenkins UI

1. Go to Jenkins: http://k8s-jenkins-jenkins-b637b220e8-2120753307.us-west-2.elb.amazonaws.com
2. Click "New Item"
3. Enter name: `nginx-api-build`
4. Select "Pipeline"
5. Click "OK"
6. Under "Pipeline" section:
   - Definition: "Pipeline script from SCM"
   - SCM: "Git"
   - Repository URL: Your git repository URL
   - Branch: `*/main`
   - Script Path: `jenkins-jobs/nginx-api-build/Jenkinsfile`
7. Click "Save"

### Option 3: Using PowerShell Script

```powershell
# Create the job
.\create-nginx-api-job.ps1
```

## Triggering the Build

### Manual Trigger
1. Go to the job page
2. Click "Build Now"

### Automatic Trigger
- The job is configured to poll SCM every 5 minutes
- Any changes to the `nginx-api/` directory will trigger a build

## Testing the Deployment

The pipeline automatically tests all endpoints after deployment. You can also run tests manually:

```bash
# Run the test script
./jenkins-jobs/nginx-api-build/test-endpoints.sh
```

Or on Windows:
```powershell
.\test-api-test-endpoint.ps1
```

## Endpoints

The nginx-api application exposes these endpoints:

- `GET /health` - Health check
- `GET /api/info` - Application info
- `GET /api/test` - Test endpoint (NEW!)
- `POST /api/echo` - Echo server

All endpoints are accessible via API Gateway:
`https://79jzt0dapd.execute-api.us-west-2.amazonaws.com`

## Troubleshooting

### Build fails at "Push to ECR"
- Check that ECR repository exists: `aws ecr describe-repositories --region us-west-2`
- Verify Jenkins has ECR permissions

### Deploy fails with "Deployment does not exist"
- The initial deployment must be done via Helm
- Run: `helm install nginx-api ./nginx-api-chart`

### Deployment times out
- Check pod logs: `kubectl logs -n default -l app=nginx-api`
- Check pod status: `kubectl get pods -n default -l app=nginx-api`
- Check events: `kubectl get events -n default --sort-by='.lastTimestamp'`

## Image Tags

- `latest` - Always points to the most recent build
- `<BUILD_NUMBER>` - Specific build number for rollback

To rollback to a previous version:
```bash
kubectl set image deployment/nginx-api nginx-api=450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-api:<BUILD_NUMBER> -n default
```
