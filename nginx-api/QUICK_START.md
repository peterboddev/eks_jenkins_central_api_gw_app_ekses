# Quick Start Guide

## For Developers

### 1. Add a New Endpoint

**Step 1: Define in OpenAPI**
```bash
# Edit openapi.yaml
vim openapi.yaml
```

Add your endpoint:
```yaml
paths:
  /api/products:
    get:
      summary: List products
      operationId: getProducts
      responses:
        '200':
          description: List of products
```

**Step 2: Implement in Express**
```bash
# Edit app.js
vim app.js
```

Add your route:
```javascript
app.get('/api/products', (req, res) => {
    res.json({ products: [] });
});
```

**Step 3: Validate**
```bash
npm run validate
```

**Step 4: Generate Tests**
```bash
npm run generate-tests
```

**Step 5: Deploy**
```bash
git add .
git commit -m "Add products endpoint"
git push
```

Jenkins automatically deploys within 5 minutes.

### 2. Test Locally

**Node.js only:**
```bash
npm install
npm start
curl http://localhost:3000/health
```

**Full stack (Docker):**
```bash
docker build -t nginx-api:local .
docker run -p 8080:8080 nginx-api:local
curl http://localhost:8080/health
```

### 3. Test in Production

```bash
# Get token
TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id 5pc3u5as9anjs5vrp3vtblsfs6 \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPass123! \
  --region us-west-2 \
  --query 'AuthenticationResult.AccessToken' \
  --output text)

# Test endpoint
curl -H "Authorization: Bearer $TOKEN" \
  https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api/test
```

## For DevOps

### View OpenAPI Spec
```bash
cat nginx-api/openapi.yaml
```

### Validate Contract
```bash
cd nginx-api
npm install
npm run validate
```

### Generate Tests
```bash
npm run generate-tests
```

### Manual Deployment
Go to Jenkins and click "Build Now":
http://k8s-jenkins-jenkins-b637b220e8-2120753307.us-west-2.elb.amazonaws.com

### Check Deployment
```bash
kubectl get pods -n default -l app=nginx-api
kubectl logs -n default -l app=nginx-api -f
```

## Common Commands

```bash
# Validate API contract
npm run validate

# Generate tests from OpenAPI
npm run generate-tests

# Start local development
npm start

# Build Docker image
docker build -t nginx-api:local .

# Run Docker container
docker run -p 8080:8080 nginx-api:local

# Check pod status
kubectl get pods -n default -l app=nginx-api

# View logs
kubectl logs -n default -l app=nginx-api

# Get Cognito token
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id 5pc3u5as9anjs5vrp3vtblsfs6 \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPass123! \
  --region us-west-2
```

## Documentation

- **API_CONTRACT_MANAGEMENT.md** - Complete OpenAPI workflow
- **README.md** - Full developer guide
- **ARCHITECTURE.md** - System architecture
- **../WORKFLOW_SUMMARY.md** - CI/CD workflow
- **../access_details/CURRENT_ACCESS.md** - Access URLs and credentials
