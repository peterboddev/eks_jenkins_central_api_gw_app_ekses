# API Contract Management with OpenAPI

## Problem Statement

In a multi-layer architecture, inconsistencies can occur between:
1. **API Gateway routes** - What endpoints are exposed
2. **nginx routing** - How requests are proxied
3. **Express app routes** - What the application actually implements
4. **Integration tests** - What gets tested

Without a single source of truth, these layers can drift apart, causing:
- 404 errors for documented endpoints
- Untested endpoints in production
- Mismatched request/response formats
- Documentation that doesn't match reality

## Solution: OpenAPI as Single Source of Truth

We use **OpenAPI 3.0** specification as the contract that all layers must conform to.

```
┌─────────────────────────────────────┐
│     openapi.yaml (Source of Truth)  │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┬───────────────┬──────────────┐
       │               │               │              │
       ▼               ▼               ▼              ▼
  API Gateway      nginx.conf      app.js      Integration
   Routes          Routing         Routes         Tests
```

## File Structure

```
nginx-api/
├── openapi.yaml                      # Single source of truth
├── app.js                            # Express implementation
├── validate-api-contract.js          # Validates app matches spec
├── generate-tests-from-openapi.js    # Generates tests from spec
└── package.json                      # Dependencies
```

## OpenAPI Specification

Location: `nginx-api/openapi.yaml`

This file defines:
- All endpoints (paths and methods)
- Request/response schemas
- Authentication requirements
- Server URLs (production, staging, local)
- Example requests and responses

### Example Entry

```yaml
paths:
  /api/users:
    get:
      summary: List users
      operationId: getUsers
      tags: [Users]
      responses:
        '200':
          description: List of users
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserList'
```

## Validation Tools

### 1. Contract Validator

**File**: `nginx-api/validate-api-contract.js`

**Purpose**: Ensures Express app implements all routes defined in OpenAPI spec

**Usage**:
```bash
cd nginx-api
npm install js-yaml
node validate-api-contract.js
```

**What it checks**:
- ✅ All OpenAPI routes are implemented in Express
- ✅ No undocumented routes in Express
- ✅ HTTP methods match (GET, POST, etc.)

**Output**:
```
🔍 Validating API contract...

Express Routes:
  GET /health
  GET /api/info
  GET /api/test
  POST /api/echo
  GET /api/users
  POST /api/users

OpenAPI Routes:
  GET /health (getHealth)
  GET /api/info (getInfo)
  GET /api/test (getTest)
  POST /api/echo (postEcho)
  GET /api/users (getUsers)
  POST /api/users (createUser)

✅ All routes match! API contract is valid.
```

### 2. Test Generator

**File**: `nginx-api/generate-tests-from-openapi.js`

**Purpose**: Generates integration tests from OpenAPI spec

**Usage**:
```bash
cd nginx-api
node generate-tests-from-openapi.js > ../jenkins-jobs/nginx-api-build/test-endpoints-generated.sh
chmod +x ../jenkins-jobs/nginx-api-build/test-endpoints-generated.sh
```

**What it generates**:
- Bash script with curl commands for each endpoint
- Proper authentication headers
- Sample request bodies from OpenAPI examples
- Status code validation

**Benefits**:
- Tests are always in sync with spec
- No manual test maintenance
- Catches missing endpoints immediately

## Workflow

### 1. Design-First Approach

```
1. Update openapi.yaml
   ↓
2. Validate spec (optional: use Swagger Editor)
   ↓
3. Implement in app.js
   ↓
4. Run validate-api-contract.js
   ↓
5. Generate tests
   ↓
6. Commit and deploy
```

### 2. Adding a New Endpoint

**Step 1: Define in OpenAPI**

Edit `nginx-api/openapi.yaml`:

```yaml
paths:
  /api/products:
    get:
      summary: List products
      operationId: getProducts
      tags: [Products]
      responses:
        '200':
          description: List of products
          content:
            application/json:
              schema:
                type: object
                properties:
                  products:
                    type: array
                    items:
                      type: object
                      properties:
                        id:
                          type: integer
                        name:
                          type: string
```

**Step 2: Implement in Express**

Edit `nginx-api/app.js`:

```javascript
app.get('/api/products', (req, res) => {
    res.json({
        products: [
            { id: 1, name: 'Product A' },
            { id: 2, name: 'Product B' }
        ]
    });
});
```

**Step 3: Validate**

```bash
cd nginx-api
node validate-api-contract.js
```

**Step 4: Generate Tests**

```bash
node generate-tests-from-openapi.js > ../jenkins-jobs/nginx-api-build/test-endpoints-generated.sh
```

**Step 5: Commit**

```bash
git add nginx-api/openapi.yaml nginx-api/app.js jenkins-jobs/nginx-api-build/test-endpoints-generated.sh
git commit -m "Add products endpoint"
git push
```

Jenkins will automatically deploy and test.

## Integration with CI/CD

### Jenkins Pipeline Integration

Add validation step to `jenkins-jobs/nginx-api-build/Jenkinsfile`:

```groovy
stage('Validate API Contract') {
    steps {
        container('docker') {
            sh '''
                cd nginx-api
                npm install js-yaml
                node validate-api-contract.js
            '''
        }
    }
}
```

This ensures:
- Contract validation runs before deployment
- Build fails if implementation doesn't match spec
- No drift between spec and implementation

## API Gateway Integration

### Current Setup

Currently, API Gateway uses a catch-all `/{proxy+}` route that forwards everything to the ALB. This works but doesn't validate routes at the API Gateway level.

### Recommended: Import OpenAPI to API Gateway

AWS API Gateway can import OpenAPI specs directly:

```bash
# Export current API Gateway config
aws apigatewayv2 export-api \
  --api-id 79jzt0dapd \
  --output-type YAML \
  --specification OAS30 \
  --region us-west-2 > current-api-gateway.yaml

# Update API Gateway from OpenAPI spec
aws apigatewayv2 import-api \
  --body file://nginx-api/openapi.yaml \
  --region us-west-2
```

**Benefits**:
- API Gateway validates routes before forwarding
- Returns 404 at gateway level for undefined routes
- Request/response validation at gateway
- Automatic API documentation

### CDK Integration

Update `lib/eks_nginx_api-stack.ts` to import OpenAPI:

```typescript
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as fs from 'fs';

// Load OpenAPI spec
const openApiSpec = fs.readFileSync('nginx-api/openapi.yaml', 'utf8');

// Create API from OpenAPI spec
const api = new apigatewayv2.CfnApi(this, 'NginxApi', {
  name: 'nginx-api',
  protocolType: 'HTTP',
  body: openApiSpec
});
```

## nginx Configuration

Currently, nginx uses a catch-all proxy:

```nginx
location / {
    proxy_pass http://nodejs_backend;
}
```

This is fine because:
- nginx doesn't need to know about specific routes
- All routing logic is in Express
- nginx just forwards everything

If you want nginx to validate routes:

```nginx
# Specific routes only
location ~ ^/(health|api/info|api/test|api/echo|api/users)$ {
    proxy_pass http://nodejs_backend;
}

# Everything else returns 404
location / {
    return 404 '{"error":"Not Found"}';
}
```

## Documentation Generation

### Swagger UI

Serve OpenAPI spec with Swagger UI for interactive documentation:

```javascript
// Add to app.js
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');

const openApiSpec = yaml.load(fs.readFileSync('./openapi.yaml', 'utf8'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
```

Access at: `https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api-docs`

### Redoc

Alternative documentation UI:

```javascript
const redoc = require('redoc-express');

app.get('/docs', redoc({
  title: 'nginx-api Documentation',
  specUrl: '/openapi.yaml'
}));

app.get('/openapi.yaml', (req, res) => {
  res.sendFile(__dirname + '/openapi.yaml');
});
```

## Request/Response Validation

### Express Validator

Validate requests against OpenAPI schemas:

```bash
npm install express-openapi-validator
```

```javascript
const OpenApiValidator = require('express-openapi-validator');

app.use(
  OpenApiValidator.middleware({
    apiSpec: './openapi.yaml',
    validateRequests: true,
    validateResponses: true
  })
);
```

**Benefits**:
- Automatic request validation
- Returns 400 for invalid requests
- Validates response schemas in development
- Catches schema drift early

## Monitoring and Alerting

### Track Undefined Endpoints

Add middleware to log 404s:

```javascript
app.use((req, res, next) => {
  if (res.statusCode === 404) {
    console.warn(`404 - Undefined endpoint: ${req.method} ${req.path}`);
    // Send to CloudWatch, Datadog, etc.
  }
  next();
});
```

### API Gateway Metrics

Monitor API Gateway for:
- 4xx errors (client errors, possibly undefined routes)
- 5xx errors (server errors)
- Latency per route

## Best Practices

### 1. OpenAPI First
- Always update OpenAPI spec before implementing
- Use spec as contract between frontend and backend teams
- Review OpenAPI changes in pull requests

### 2. Validate in CI/CD
- Run `validate-api-contract.js` in every build
- Fail build if validation fails
- Generate tests from spec automatically

### 3. Version Your API
- Use semantic versioning in OpenAPI info.version
- Consider API versioning in URLs (/v1/api/users)
- Maintain backward compatibility

### 4. Document Everything
- Add descriptions to all endpoints
- Include examples for all schemas
- Document error responses

### 5. Keep Spec in Sync
- Update spec when adding/removing endpoints
- Regenerate tests after spec changes
- Review spec changes in code reviews

## Tools and Resources

### OpenAPI Tools
- **Swagger Editor**: https://editor.swagger.io/ (validate and edit specs)
- **Swagger UI**: Interactive API documentation
- **Redoc**: Alternative documentation UI
- **OpenAPI Generator**: Generate client SDKs

### Validation Libraries
- **express-openapi-validator**: Request/response validation
- **swagger-parser**: Parse and validate OpenAPI specs
- **openapi-schema-validator**: Validate OpenAPI documents

### Testing Tools
- **Dredd**: Test API against OpenAPI spec
- **Schemathesis**: Property-based testing from OpenAPI
- **Postman**: Import OpenAPI specs for manual testing

## Summary

By using OpenAPI as the single source of truth:

✅ **Consistency**: All layers reference the same contract
✅ **Validation**: Automated checks prevent drift
✅ **Testing**: Tests generated from spec, always in sync
✅ **Documentation**: Self-documenting API
✅ **Collaboration**: Clear contract between teams
✅ **Tooling**: Rich ecosystem of OpenAPI tools

The workflow becomes:
1. Design API in OpenAPI
2. Validate implementation matches spec
3. Generate tests from spec
4. Deploy with confidence

No more manual scripts, no more drift, no more surprises.
