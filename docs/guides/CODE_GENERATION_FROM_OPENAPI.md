# Code Generation from OpenAPI

## Overview

This project uses **OpenAPI-first development** with **automatic code generation**. You define your API in `openapi.yaml`, and everything else is generated automatically:

- ✅ Express routes and handlers
- ✅ API Gateway routes and integrations
- ✅ nginx routing configuration
- ✅ Integration tests
- ✅ CDK infrastructure code

**Developers only write business logic.** All boilerplate is generated.

## Architecture

```
┌─────────────────────────────────────┐
│  openapi.yaml                       │
│  (Single Source of Truth)           │
└──────────────┬──────────────────────┘
               │
               │ Code Generation
               │
       ┌───────┴────────┬──────────────┬──────────────┬──────────────┐
       │                │              │              │              │
       ▼                ▼              ▼              ▼              ▼
  Express App      API Gateway    nginx.conf    Integration    CDK Code
  (app.js)         (routes)       (routing)     Tests          (infra)
  + handlers/      + integrations + methods     (bash)         (TypeScript)
```

## Quick Start

### 1. Define Your API

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
                        price:
                          type: number
```

### 2. Generate Everything

```bash
# Generate Express app, API Gateway, nginx config, tests
node generate-infrastructure-from-openapi.js

# Or just generate Express app
cd nginx-api
npm run generate-app
```

### 3. Fill in Business Logic

Generated code has `TODO` markers:

```javascript
// handlers/getProducts.js
async function getProducts(req, res, next) {
  try {
    // TODO: Implement your business logic here
    
    // Example: Connect to database
    const products = await db.query('SELECT * FROM products');
    
    res.status(200).json({ products });
  } catch (error) {
    next(error);
  }
}
```

### 4. Deploy

```bash
git add .
git commit -m "Add products endpoint"
git push
```

Jenkins automatically deploys.

## Code Generators

### 1. Express App Generator

**File**: `nginx-api/generate-app-from-openapi.js`

**Generates**:
- `app.generated.js` - Monolithic app with all routes
- `app.modular.js` - Modular app with separate handler files
- `handlers/*.js` - Individual handler files (one per endpoint)

**Usage**:
```bash
cd nginx-api
npm run generate-app
```

**Output**:
```
nginx-api/
├── app.generated.js          # All routes in one file
├── app.modular.js            # Routes with separate handlers
└── handlers/
    ├── getHealth.js
    ├── getInfo.js
    ├── getTest.js
    ├── postEcho.js
    ├── getUsers.js
    ├── createUser.js
    └── getProducts.js        # Your new endpoint
```

**What's Generated**:
- Route definitions (`app.get()`, `app.post()`, etc.)
- Request/response handling
- Error handling
- Sample responses from OpenAPI schemas
- TODO markers for business logic

**What You Write**:
- Database queries
- External API calls
- Data processing
- Validation logic
- Business rules

### 2. Infrastructure Generator

**File**: `generate-infrastructure-from-openapi.js`

**Generates**:
- `lib/api-gateway-from-openapi.generated.ts` - CDK code for API Gateway
- `nginx-api/openapi.aws.yaml` - OpenAPI with AWS extensions
- `nginx-api/nginx.generated.conf` - nginx configuration
- `deploy-from-openapi.sh` - Deployment script

**Usage**:
```bash
node generate-infrastructure-from-openapi.js
```

**What's Generated**:

#### API Gateway CDK Code
```typescript
// lib/api-gateway-from-openapi.generated.ts
export class ApiGatewayFromOpenApi extends Construct {
  constructor(scope: Construct, id: string, props: ApiGatewayFromOpenApiProps) {
    // Creates HTTP API
    // Adds routes for each endpoint in OpenAPI
    // Configures Cognito authorizer
    // Sets up ALB integration
  }
}
```

#### nginx Configuration
```nginx
# nginx-api/nginx.generated.conf
location /api/products {
    limit_except GET {
        deny all;
    }
    proxy_pass http://nodejs_backend;
}
```

#### API Gateway OpenAPI
```yaml
# nginx-api/openapi.aws.yaml
paths:
  /api/products:
    get:
      x-amazon-apigateway-integration:
        type: http_proxy
        uri: ${ALB_URL}/api/products
```

### 3. Test Generator

**File**: `nginx-api/generate-tests-from-openapi.js`

**Generates**:
- `jenkins-jobs/nginx-api-build/test-endpoints-generated.sh`

**Usage**:
```bash
cd nginx-api
npm run generate-tests
```

**What's Generated**:
```bash
# Test: List products
echo "Testing GET /api/products..."
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_GATEWAY_URL/api/products")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ GET /api/products failed"
  exit 1
fi
echo "✅ GET /api/products - Status: $HTTP_CODE"
```

## Development Workflow

### Option 1: Monolithic (Simple)

```bash
# 1. Define API
vim nginx-api/openapi.yaml

# 2. Generate app
cd nginx-api
npm run generate-app

# 3. Edit app.generated.js - fill in TODO sections
vim app.generated.js

# 4. Rename to app.js
mv app.generated.js app.js

# 5. Test locally
npm start

# 6. Deploy
git add . && git commit -m "Add products endpoint" && git push
```

### Option 2: Modular (Recommended)

```bash
# 1. Define API
vim nginx-api/openapi.yaml

# 2. Generate app and handlers
cd nginx-api
npm run generate-app

# 3. Edit individual handlers
vim handlers/getProducts.js

# 4. Use modular app
mv app.modular.js app.js

# 5. Test locally
npm start

# 6. Deploy
git add . && git commit -m "Add products endpoint" && git push
```

### Option 3: Full Stack Generation

```bash
# 1. Define API
vim nginx-api/openapi.yaml

# 2. Generate everything
node generate-infrastructure-from-openapi.js
cd nginx-api && npm run generate-app && cd ..

# 3. Review generated code
# - lib/api-gateway-from-openapi.generated.ts
# - nginx-api/app.modular.js
# - nginx-api/handlers/*.js

# 4. Integrate CDK code
# Edit lib/eks_nginx_api-stack.ts to use generated API Gateway

# 5. Fill in business logic
vim nginx-api/handlers/getProducts.js

# 6. Deploy
./deploy-from-openapi.sh
```

## Generated Code Examples

### Monolithic App (app.generated.js)

```javascript
// List products
// Operation ID: getProducts
app.get('/api/products', async (req, res, next) => {
  try {
    // TODO: Add your business logic here
    
    // Sample response (replace with actual data)
    const response = {
      products: []
    };
    
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});
```

### Modular Handler (handlers/getProducts.js)

```javascript
/**
 * Handler: List products
 * Operation ID: getProducts
 * Method: GET
 * Path: /api/products
 */

async function getProducts(req, res, next) {
  try {
    // TODO: Implement your business logic here
    
    // Query parameters are available in req.query
    
    // Example: Connect to database
    // const result = await db.query('SELECT * FROM products');
    
    // Return response
    res.status(200).json({
      message: 'TODO: Replace with actual response',
      // Add your response data here
    });
  } catch (error) {
    next(error);
  }
}

module.exports = getProducts;
```

### Modular App (app.modular.js)

```javascript
// Import handlers
const getProducts = require('./handlers/getProducts');

// Routes
app.get('/api/products', getProducts); // List products
```

## Regeneration

### When to Regenerate

Regenerate when you:
- Add new endpoints to OpenAPI
- Change endpoint paths or methods
- Modify request/response schemas
- Update authentication requirements

### How to Regenerate

```bash
# Regenerate Express app
cd nginx-api
npm run generate-app

# Regenerate tests
npm run generate-tests

# Regenerate infrastructure
cd ..
node generate-infrastructure-from-openapi.js
```

### Preserving Custom Code

**Monolithic approach**: 
- Generated code goes to `app.generated.js`
- Your code stays in `app.js`
- Manually merge changes

**Modular approach** (recommended):
- Existing handler files are NOT overwritten
- Only new handlers are created
- Your business logic is preserved

```
📁 handlers/
├── getProducts.js      ← Your code (preserved)
├── getUsers.js         ← Your code (preserved)
└── getOrders.js        ← New endpoint (generated)
```

## Integration with CI/CD

### Jenkins Pipeline

Add generation step to `Jenkinsfile`:

```groovy
stage('Generate from OpenAPI') {
    steps {
        container('docker') {
            sh '''
                # Generate Express app if needed
                cd nginx-api
                
                # Check if handlers need regeneration
                if [ ! -d "handlers" ]; then
                    echo "Generating handlers from OpenAPI..."
                    npm run generate-app
                fi
                
                # Always regenerate tests
                npm run generate-tests
            '''
        }
    }
}
```

### Pre-commit Hook

Automatically regenerate on commit:

```bash
# .git/hooks/pre-commit
#!/bin/bash
cd nginx-api
npm run generate-tests
git add ../jenkins-jobs/nginx-api-build/test-endpoints-generated.sh
```

## Best Practices

### 1. OpenAPI First
- Always update OpenAPI before coding
- Use OpenAPI as contract between teams
- Review OpenAPI changes in PRs

### 2. Don't Edit Generated Files
- Generated files are marked with comments
- Edit handler files, not generated app files
- Regenerate instead of manually editing

### 3. Use Modular Approach
- Easier to maintain
- Preserves custom code
- Better separation of concerns

### 4. Version Control
- Commit OpenAPI spec
- Commit handler files (your code)
- Don't commit `*.generated.*` files (optional)

### 5. Test Generated Code
- Run `npm run validate` after generation
- Test locally before deploying
- Review generated tests

## Advanced Features

### Custom Response Schemas

OpenAPI schemas are used to generate sample responses:

```yaml
responses:
  '200':
    content:
      application/json:
        schema:
          type: object
          properties:
            products:
              type: array
              items:
                $ref: '#/components/schemas/Product'
        example:
          products:
            - id: 1
              name: "Product A"
              price: 29.99
```

Generated code includes the example:

```javascript
const response = {
  products: [
    { id: 1, name: "Product A", price: 29.99 }
  ]
};
```

### Path Parameters

OpenAPI path parameters are automatically handled:

```yaml
paths:
  /api/products/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
```

Generated handler:

```javascript
async function getProduct(req, res, next) {
  try {
    const { id } = req.params; // Path parameter
    
    // TODO: Fetch product by ID
    const product = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    
    res.status(200).json(product);
  } catch (error) {
    next(error);
  }
}
```

### Request Validation

Add validation middleware:

```javascript
const { body, param, validationResult } = require('express-validator');

app.post('/api/products',
  body('name').isString().notEmpty(),
  body('price').isNumeric(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    // Your handler code
  }
);
```

## Troubleshooting

### Generation Fails

```bash
# Check OpenAPI syntax
npm install -g @apidevtools/swagger-cli
swagger-cli validate nginx-api/openapi.yaml
```

### Handlers Not Generated

- Check that `operationId` is defined in OpenAPI
- Ensure method is one of: get, post, put, delete, patch
- Verify file permissions on handlers directory

### Tests Fail After Generation

- Regenerate tests: `npm run generate-tests`
- Check that OpenAPI examples match actual responses
- Verify authentication is configured correctly

## Summary

With OpenAPI-first development and code generation:

✅ **Define once** - API contract in OpenAPI
✅ **Generate everything** - Routes, handlers, tests, infrastructure
✅ **Write business logic only** - No boilerplate
✅ **Stay in sync** - Regenerate when API changes
✅ **Deploy with confidence** - Everything validated against spec

The workflow becomes:
1. Update `openapi.yaml`
2. Run `npm run generate-all`
3. Fill in TODO sections
4. Commit and push
5. Jenkins deploys automatically

No manual route creation, no manual test writing, no drift between layers.
