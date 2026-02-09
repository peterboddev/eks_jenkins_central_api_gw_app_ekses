# nginx-api Application

This is a Node.js Express application with nginx as a reverse proxy. This is where developers write actual application code.

## Architecture

```
Client → API Gateway (Cognito Auth) → ALB → nginx (port 8080) → Node.js app (port 3000)
```

- **nginx**: Acts as reverse proxy on port 8080, forwards all requests to Node.js
- **Node.js**: Express application running on port 3000, contains actual business logic

## API Contract (OpenAPI)

This project uses **OpenAPI 3.0** as the single source of truth for the API contract.

### OpenAPI Specification
- **File**: `openapi.yaml`
- **Purpose**: Defines all endpoints, schemas, and authentication
- **Benefits**: Ensures consistency across API Gateway, nginx, Express, and tests

### Validate Implementation
```bash
npm run validate
```

This checks that all routes in `openapi.yaml` are implemented in `app.js`.

### Generate Tests
```bash
npm run generate-tests
```

This generates integration tests from the OpenAPI spec automatically.

### Workflow
1. Update `openapi.yaml` with new endpoint
2. Implement in `app.js`
3. Run `npm run validate` to check consistency
4. Run `npm run generate-tests` to update tests
5. Commit and push (Jenkins deploys automatically)

See `../API_CONTRACT_MANAGEMENT.md` for complete details.

## Files

- `app.js` - Express application (this is where you write code)
- `package.json` - Node.js dependencies
- `nginx.conf` - nginx reverse proxy configuration
- `Dockerfile` - Multi-service container (nginx + Node.js)

## Local Development

### Prerequisites
- Node.js 18+
- Docker (for containerized testing)

### Run Locally (Node.js only)
```bash
cd nginx-api
npm install
npm start
```

Test endpoints:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/info
curl http://localhost:3000/api/test
curl -X POST http://localhost:3000/api/echo -H "Content-Type: application/json" -d '{"test":"data"}'
```

### Run Locally (Full Stack with Docker)
```bash
# Build image
docker build -t nginx-api:local .

# Run container
docker run -p 8080:8080 nginx-api:local

# Test through nginx
curl http://localhost:8080/health
curl http://localhost:8080/api/info
curl http://localhost:8080/api/test
```

Or use the PowerShell script:
```powershell
.\build-nginx-api.ps1
```

## Available Endpoints

### Health & Info
- `GET /health` - Health check endpoint
- `GET /api/info` - Application information

### Test Endpoints
- `GET /api/test` - Test endpoint with request details
- `POST /api/echo` - Echo back the request body

### Example Endpoints (for developers to extend)
- `GET /api/users` - List users (TODO: connect to database)
- `POST /api/users` - Create user (TODO: add validation, save to DB)

## Adding New Endpoints

Edit `app.js` and add your routes:

```javascript
// Example: Add a new GET endpoint
app.get('/api/products', (req, res) => {
    // Your logic here
    res.json({ products: [] });
});

// Example: Add a new POST endpoint
app.post('/api/products', (req, res) => {
    // Your logic here
    res.status(201).json({ id: 1, ...req.body });
});
```

No need to modify `nginx.conf` - it proxies all requests to Node.js automatically.

## CI/CD Pipeline

The Jenkins pipeline (`nginx-api-build`) is configured for continuous deployment:

### Automatic Deployment
- Jenkins polls the Git repository every 5 minutes
- Detects changes to the `nginx-api/` directory
- Automatically builds, tests, and deploys

### What the Pipeline Does
1. Builds the Docker image (nginx + Node.js)
2. Runs `npm ci --only=production` during build
3. Pushes to ECR
4. Deploys to EKS (nginx-api-cluster)
5. Runs integration tests on all endpoints
6. Fails the build if any test fails

### To Deploy Your Changes
1. Edit `app.js` or other files
2. Commit and push to main branch
3. Jenkins automatically deploys within 5 minutes

### Manual Trigger (if needed)
Go to Jenkins UI and click "Build Now" on the `nginx-api-build` job:
http://k8s-jenkins-jenkins-b637b220e8-2120753307.us-west-2.elb.amazonaws.com

## Environment Variables

Available in the container:
- `NODE_ENV` - Environment (development/production)
- `HOSTNAME` - Pod hostname in Kubernetes

## Testing

Integration tests run automatically in the Jenkins pipeline. See `jenkins-jobs/nginx-api-build/test-endpoints.sh`.

## Deployment

Deployed to:
- **Cluster**: nginx-api-cluster (EKS 1.32)
- **Namespace**: default
- **Service**: nginx-api
- **Access**: Via API Gateway with Cognito authentication

See `access_details/CURRENT_ACCESS.md` for URLs and credentials.

## Next Steps for Developers

1. **Add Database**: Connect to RDS, DynamoDB, or other data store
2. **Add Authentication**: Validate Cognito JWT tokens in the app
3. **Add Business Logic**: Implement your actual API endpoints
4. **Add Validation**: Use libraries like `joi` or `express-validator`
5. **Add Logging**: Use structured logging (e.g., `winston`, `pino`)
6. **Add Monitoring**: Add metrics, tracing (e.g., CloudWatch, X-Ray)

## Troubleshooting

### Container won't start
Check logs:
```bash
kubectl logs -n default -l app=nginx-api
```

### Node.js app not responding
The Dockerfile starts Node.js first, then nginx. If Node.js fails to start, nginx will return 502 Bad Gateway.

### Port conflicts
- nginx listens on 8080 (external)
- Node.js listens on 3000 (internal)
- Don't change these without updating Dockerfile and nginx.conf
