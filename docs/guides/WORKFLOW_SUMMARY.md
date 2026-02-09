# Development and Deployment Workflow

## Overview

This project uses Jenkins for CI/CD with Configuration-as-Code (JCasC). All jobs are defined declaratively and deployment is automated.

## Architecture

```
Developer → Git → Jenkins (auto-detects changes) → Build → Test → Deploy → EKS
```

## Jenkins Jobs

All Jenkins jobs are managed as Configuration-as-Code in `k8s/jenkins/jobs-configmap.yaml`.

### nginx-api-build
- **Purpose**: Build and deploy the Node.js application
- **Trigger**: Automatic (polls SCM every 5 minutes)
- **What it does**:
  1. Detects changes to `nginx-api/` directory
  2. Builds Docker image (nginx + Node.js)
  3. Pushes to ECR
  4. Deploys to nginx-api-cluster
  5. Runs integration tests
  6. Fails if any test fails

### nginx-docker-build
- **Purpose**: Build nginx demo image
- **Trigger**: Automatic (polls SCM every 5 minutes)
- **What it does**:
  1. Builds nginx demo Docker image
  2. Pushes to ECR

## Developer Workflow

### 1. Local Development

```bash
# Work on the Node.js application
cd nginx-api
npm install
npm start

# Test locally
curl http://localhost:3000/health
curl http://localhost:3000/api/test
```

### 2. Test with Docker (Optional)

```bash
# Build and run full stack locally
cd nginx-api
docker build -t nginx-api:local .
docker run -p 8080:8080 nginx-api:local

# Test through nginx
curl http://localhost:8080/health
```

### 3. Deploy to Production

```bash
# Commit your changes
git add nginx-api/
git commit -m "Add new feature"
git push origin main

# Jenkins automatically:
# - Detects the change within 5 minutes
# - Builds the Docker image
# - Runs tests
# - Deploys to EKS if tests pass
```

### 4. Monitor Deployment

```bash
# Watch Jenkins build
# Go to: http://k8s-jenkins-jenkins-b637b220e8-2120753307.us-west-2.elb.amazonaws.com

# Or watch pods directly
kubectl get pods -n default -l app=nginx-api -w

# Check logs
kubectl logs -n default -l app=nginx-api -f
```

## No Manual Scripts Needed

❌ **Don't use these patterns:**
- `.\trigger-nginx-api-build.ps1` - Deleted (use Jenkins UI or wait for auto-trigger)
- `.\test-api-test-endpoint.ps1` - Deleted (tests run in pipeline)
- `.\build-nginx-api.ps1` - Only for local ECR pushes, not for deployment

✅ **Use these patterns:**
- Commit and push → Jenkins auto-deploys
- Jenkins UI → "Build Now" for manual trigger
- Local Docker build for testing only

## Jenkins Job Management

### Viewing Jobs
```bash
# Go to Jenkins UI
http://k8s-jenkins-jenkins-b637b220e8-2120753307.us-west-2.elb.amazonaws.com
```

### Adding New Jobs
1. Edit `k8s/jenkins/jobs-configmap.yaml`
2. Add your job definition
3. Deploy the ConfigMap:
   ```powershell
   .\k8s\jenkins\deploy-jobs.ps1
   ```
4. Jenkins automatically loads the new job

### Updating Existing Jobs
1. Edit `k8s/jenkins/jobs-configmap.yaml`
2. Update the job definition
3. Deploy the ConfigMap:
   ```powershell
   .\k8s\jenkins\deploy-jobs.ps1
   ```
4. Jenkins automatically reloads

## Application Structure

```
nginx-api/
├── app.js              # Express application (edit this)
├── package.json        # Dependencies
├── nginx.conf          # Reverse proxy config
├── Dockerfile          # Container definition
├── start.sh            # Startup script
├── .dockerignore       # Build optimization
├── README.md           # Developer docs
└── ARCHITECTURE.md     # Architecture docs
```

## Testing

### Local Testing
```bash
# Test Node.js directly
cd nginx-api
npm start
curl http://localhost:3000/health
```

### Integration Testing
Integration tests run automatically in the Jenkins pipeline:
- GET /health
- GET /api/info
- GET /api/test
- POST /api/echo

Tests are defined in `jenkins-jobs/nginx-api-build/test-endpoints.sh`.

### Production Testing
```bash
# Get Cognito token
TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id 5pc3u5as9anjs5vrp3vtblsfs6 \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPass123! \
  --region us-west-2 \
  --query 'AuthenticationResult.AccessToken' \
  --output text)

# Test endpoints
curl -H "Authorization: Bearer $TOKEN" \
  https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health
```

## Deployment Flow

```
1. Developer commits to nginx-api/
   ↓
2. Git push to main branch
   ↓
3. Jenkins polls SCM (every 5 minutes)
   ↓
4. Jenkins detects change
   ↓
5. Checkout code
   ↓
6. Build Docker image
   - npm ci --only=production
   - Copy app.js, nginx.conf
   - Create multi-process container
   ↓
7. Push to ECR
   ↓
8. Deploy to EKS
   - kubectl set image
   - kubectl rollout status
   ↓
9. Run integration tests
   - Test all endpoints
   - Validate responses
   ↓
10. Success or Failure
    - Success: New version live
    - Failure: Build marked as failed
```

## Access Details

See `access_details/CURRENT_ACCESS.md` for:
- Jenkins URL and credentials
- API Gateway URL
- Cognito credentials
- Test user credentials
- kubectl commands

## Documentation

- **This file**: Overall workflow
- **JENKINS_JOBS_AS_CODE.md**: How Jenkins jobs are managed
- **NODEJS_APPLICATION_COMPLETE.md**: Node.js integration details
- **nginx-api/README.md**: Application developer guide
- **nginx-api/ARCHITECTURE.md**: Detailed architecture
- **access_details/CURRENT_ACCESS.md**: All access URLs and credentials

## Key Principles

1. **No manual scripts for deployment** - Jenkins handles everything
2. **Configuration as Code** - Jobs defined in Git, not Jenkins UI
3. **Automated testing** - Tests run in pipeline, not manually
4. **Continuous deployment** - Push to main = automatic deployment
5. **Developer focus** - Developers write code in `app.js`, not infrastructure

## Troubleshooting

### Build not triggering
- Check Jenkins job configuration
- Verify SCM polling is enabled
- Check Jenkins logs

### Build failing
- Check Jenkins console output
- Look for test failures
- Check pod logs: `kubectl logs -n default -l app=nginx-api`

### Deployment not working
- Check pod status: `kubectl get pods -n default -l app=nginx-api`
- Check events: `kubectl get events -n default --sort-by='.lastTimestamp'`
- Check logs: `kubectl logs -n default -l app=nginx-api`

### Tests failing
- Check test script: `jenkins-jobs/nginx-api-build/test-endpoints.sh`
- Verify endpoints are responding
- Check Cognito authentication
