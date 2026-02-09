# Node.js Application Integration Complete

## Summary

Successfully integrated a real Node.js Express application into the nginx-api service, replacing static nginx responses with actual application code where developers can write business logic.

## Architecture Change

### Before (Static nginx)
```
Client → API Gateway → ALB → nginx (returns static JSON)
```

### After (Node.js + nginx)
```
Client → API Gateway → ALB → nginx (port 8080) → Node.js app (port 3000)
```

## What Was Created/Updated

### New Files
1. **nginx-api/app.js** - Express.js application with:
   - Health check endpoint
   - API info endpoint
   - Test endpoint
   - Echo endpoint
   - Example user endpoints (for developers to extend)
   - Error handling middleware

2. **nginx-api/package.json** - Node.js dependencies:
   - express: ^4.18.2
   - nodemon: ^3.0.1 (dev)

3. **nginx-api/.dockerignore** - Optimizes Docker builds

4. **nginx-api/README.md** - Complete developer documentation:
   - Architecture overview
   - Local development instructions
   - How to add new endpoints
   - CI/CD pipeline info
   - Troubleshooting guide

### Updated Files
1. **nginx-api/Dockerfile** - Now runs both nginx and Node.js:
   - Uses node:18-alpine base image
   - Installs nginx
   - Installs npm dependencies
   - Starts Node.js app in background
   - Starts nginx in foreground (proxies to Node.js)

2. **nginx-api/nginx.conf** - Simplified to pure reverse proxy:
   - Removed all static JSON responses
   - Proxies all requests to Node.js on port 3000
   - Proper headers and timeouts configured

3. **k8s/jenkins/jobs-configmap.yaml** - Updated job description to reflect Node.js architecture

4. **jenkins-jobs/nginx-api-build/README.md** - Updated with architecture details

## Available Endpoints

All endpoints are now handled by Node.js Express application:

- `GET /health` - Health check with uptime
- `GET /api/info` - Application info with environment details
- `GET /api/test` - Test endpoint with request details
- `POST /api/echo` - Echo back request body
- `GET /api/users` - Example endpoint (TODO: connect to database)
- `POST /api/users` - Example endpoint (TODO: add validation)

## Developer Workflow

### Local Development (Node.js only)
```bash
cd nginx-api
npm install
npm start
# App runs on http://localhost:3000
```

### Local Development (Full stack with Docker)
```bash
cd nginx-api
docker build -t nginx-api:local .
docker run -p 8080:8080 nginx-api:local
# App accessible on http://localhost:8080
```

### Adding New Endpoints
Developers edit `nginx-api/app.js`:
```javascript
app.get('/api/products', (req, res) => {
    // Your logic here
    res.json({ products: [] });
});
```

No need to modify nginx.conf - it proxies everything automatically.

### Deploying Changes

The Jenkins pipeline is configured for continuous deployment:

1. **Make your changes** to `nginx-api/app.js` or other files
2. **Commit and push** to the main branch
3. **Jenkins automatically detects** changes (polls every 5 minutes)
4. **Pipeline runs automatically**:
   - Builds Docker image (npm install included)
   - Pushes to ECR
   - Deploys to EKS
   - Runs integration tests
5. **If tests pass**, new version is live
6. **If tests fail**, deployment is rolled back

You can also manually trigger a build from the Jenkins UI if needed.

## Container Details

The Docker container runs two processes:
1. **Node.js app** (port 3000) - Background process
2. **nginx** (port 8080) - Foreground process, proxies to Node.js

Both processes run in a single container using a startup script.

## Next Steps for Developers

1. **Add Database Connection**
   - Connect to RDS, DynamoDB, or other data store
   - Update example endpoints to use real data

2. **Add JWT Validation**
   - Validate Cognito JWT tokens in the Express app
   - Extract user info from tokens

3. **Add Request Validation**
   - Use libraries like `joi` or `express-validator`
   - Validate request bodies, query params

4. **Add Structured Logging**
   - Use `winston` or `pino` for logging
   - Log to CloudWatch

5. **Add Monitoring**
   - Add custom metrics
   - Integrate with CloudWatch, X-Ray

6. **Add Tests**
   - Unit tests for business logic
   - Integration tests for API endpoints

## Testing

### Local Testing
```bash
# Test Node.js directly
curl http://localhost:3000/health

# Test through nginx
curl http://localhost:8080/health
```

### Production Testing
```bash
# Get Cognito token first
TOKEN=$(curl -X POST https://cognito-idp.us-west-2.amazonaws.com/ \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -d '{"AuthFlow":"USER_PASSWORD_AUTH","ClientId":"5pc3u5as9anjs5vrp3vtblsfs6","AuthParameters":{"USERNAME":"testuser@example.com","PASSWORD":"TestPass123!"}}' \
  | jq -r '.AuthenticationResult.IdToken')

# Test endpoints
curl -H "Authorization: Bearer $TOKEN" https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health
curl -H "Authorization: Bearer $TOKEN" https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api/test
```

## Access Details

See `access_details/CURRENT_ACCESS.md` for:
- API Gateway URL
- Jenkins URL
- Cognito credentials
- Test user credentials

## Documentation

- **Application README**: `nginx-api/README.md`
- **Jenkins Job README**: `jenkins-jobs/nginx-api-build/README.md`
- **Access Details**: `access_details/CURRENT_ACCESS.md`
- **Jenkins Jobs as Code**: `JENKINS_JOBS_AS_CODE.md`

## Deployment

To deploy the updated application:

### Option 1: Via Jenkins (Recommended)
```powershell
.\trigger-nginx-api-build.ps1
```

### Option 2: Manual Build and Push
```powershell
.\build-nginx-api.ps1
```

Then restart the deployment:
```bash
kubectl rollout restart deployment/nginx-api -n default
```

## Verification

After deployment, verify:
1. Pods are running: `kubectl get pods -n default -l app=nginx-api`
2. Logs show both nginx and Node.js: `kubectl logs -n default -l app=nginx-api`
3. Endpoints respond correctly (Jenkins tests do this automatically)

## Repository Structure

The `nginx-api/` directory is now a complete application repository that can be:
- Separated into its own Git repository
- Developed independently by application developers
- Built and deployed via Jenkins CI/CD

Current structure:
```
nginx-api/
├── app.js              # Express application (developers edit this)
├── package.json        # Node.js dependencies
├── nginx.conf          # nginx reverse proxy config
├── Dockerfile          # Multi-service container
├── .dockerignore       # Docker build optimization
└── README.md           # Developer documentation
```

## Status

✅ Node.js application created
✅ Express endpoints implemented
✅ Dockerfile updated to run both nginx and Node.js
✅ nginx.conf updated to proxy to Node.js
✅ package.json created with dependencies
✅ Developer documentation created
✅ Jenkins job updated
✅ Ready for deployment

## Deployment

The Jenkins job `nginx-api-build` is configured to automatically:
- Poll the Git repository every 5 minutes
- Detect changes to the `nginx-api/` directory
- Build, test, and deploy automatically

### To Deploy Your Changes

**Option 1: Automatic (Recommended)**
1. Commit your changes to the `nginx-api/` directory
2. Push to the main branch
3. Jenkins will automatically detect and deploy within 5 minutes

**Option 2: Manual Trigger**
1. Go to Jenkins: http://k8s-jenkins-jenkins-b637b220e8-2120753307.us-west-2.elb.amazonaws.com
2. Navigate to the `nginx-api-build` job
3. Click "Build Now"

The pipeline will:
1. Build the Docker image (including npm install)
2. Push to ECR
3. Deploy to nginx-api-cluster
4. Run integration tests
5. Fail the build if any test fails
