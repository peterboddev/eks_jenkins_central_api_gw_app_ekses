# Automated OpenAPI Workflow

## Overview

This project uses **automated code generation** triggered by OpenAPI specification changes. When you edit `nginx-api/openapi.yaml`, Kiro automatically regenerates all code.

## How It Works

### 1. Edit OpenAPI Spec

```yaml
# nginx-api/openapi.yaml
paths:
  /api/products:
    get:
      summary: List products
      operationId: getProducts
      responses:
        '200':
          description: List of products
```

### 2. Save the File

When you save `openapi.yaml`, a Kiro hook automatically triggers.

### 3. Automatic Regeneration

Kiro automatically:
- ✅ Runs `npm run generate-all`
- ✅ Generates/updates Express app
- ✅ Creates new handler files (preserves existing ones)
- ✅ Regenerates integration tests
- ✅ Validates the contract
- ✅ Reports what was generated

### 4. Fill in Business Logic

If new handlers were created, you'll see:

```javascript
// nginx-api/handlers/getProducts.js
async function getProducts(req, res, next) {
  try {
    // TODO: Implement your business logic here
    res.status(200).json({ products: [] });
  } catch (error) {
    next(error);
  }
}
```

Just fill in the TODO section with your actual logic.

### 5. Deploy

```bash
git add .
git commit -m "Add products endpoint"
git push
```

Jenkins automatically deploys.

## Kiro Hook Details

**Hook Name**: Regenerate from OpenAPI  
**Hook ID**: `openapi-regenerate`  
**Trigger**: When `nginx-api/openapi.yaml` is edited  
**Action**: Asks Kiro to regenerate everything

### What Gets Regenerated

1. **Express App** (`nginx-api/app.js`)
   - Route definitions
   - Handler imports
   - Middleware setup

2. **Handler Files** (`nginx-api/handlers/*.js`)
   - New handlers created with TODO markers
   - Existing handlers preserved (not overwritten)

3. **Integration Tests** (`jenkins-jobs/nginx-api-build/test-endpoints-generated.sh`)
   - Test for each endpoint
   - Proper authentication
   - Status code validation

4. **Validation**
   - Ensures all OpenAPI routes are implemented
   - Checks for undocumented routes

## Example Workflow

### Adding a New Endpoint

**Step 1: Edit OpenAPI**
```yaml
# Add to nginx-api/openapi.yaml
paths:
  /api/products:
    get:
      summary: List products
      operationId: getProducts
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

**Step 2: Save**

Kiro automatically:
```
🚀 Generating Express app from OpenAPI spec...
✅ Created handlers/getProducts.js
✅ Updated app.js
✅ Generated integration tests
✅ Validation passed
```

**Step 3: Implement**
```javascript
// nginx-api/handlers/getProducts.js
async function getProducts(req, res, next) {
  try {
    // Connect to database
    const products = await db.query('SELECT * FROM products');
    
    res.status(200).json({ products });
  } catch (error) {
    next(error);
  }
}
```

**Step 4: Deploy**
```bash
git add .
git commit -m "Add products endpoint"
git push
```

Done! Jenkins deploys and tests automatically.

## Benefits

### 1. Zero Manual Work
- No manual route creation
- No manual test writing
- No manual validation

### 2. Instant Feedback
- See generated code immediately
- Know what needs to be implemented
- Catch errors before commit

### 3. Consistency Guaranteed
- All layers stay in sync
- No drift between spec and code
- Contract validated automatically

### 4. Fast Development
- Add endpoint in 2 minutes
- Focus only on business logic
- No boilerplate to write

## Hook Configuration

The hook is defined in `.kiro/hooks/openapi-regenerate.json`:

```json
{
  "name": "Regenerate from OpenAPI",
  "version": "1.0.0",
  "description": "Automatically regenerates Express app, handlers, and integration tests when openapi.yaml is modified",
  "when": {
    "type": "fileEdited",
    "patterns": ["nginx-api/openapi.yaml"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "The OpenAPI specification has been updated. Please:\n1. Run `cd nginx-api && npm run generate-all` to regenerate the Express app and tests\n2. Review the generated/updated handler files in nginx-api/handlers/\n3. If new handlers were created, fill in the business logic (look for TODO comments)\n4. Run `npm run validate` to ensure the implementation matches the OpenAPI spec\n5. Summarize what was generated/updated"
  }
}
```

## Disabling the Hook

If you want to disable automatic regeneration:

1. Open Kiro Command Palette
2. Search for "Kiro: Open Hooks UI"
3. Find "Regenerate from OpenAPI"
4. Toggle it off

Or edit `.kiro/hooks/openapi-regenerate.json` and set `"enabled": false`.

## Manual Regeneration

You can also regenerate manually:

```bash
cd nginx-api
npm run generate-all
```

Or just the app:
```bash
npm run generate-app
```

Or just the tests:
```bash
npm run generate-tests
```

## Validation

After regeneration, validation runs automatically:

```bash
npm run validate
```

Output:
```
🔍 Validating API contract...

Express Routes:
  GET /health
  GET /api/info
  GET /api/test
  POST /api/echo
  GET /api/users
  POST /api/users
  GET /api/products  ← New!

OpenAPI Routes:
  GET /health (getHealth)
  GET /api/info (getInfo)
  GET /api/test (getTest)
  POST /api/echo (postEcho)
  GET /api/users (getUsers)
  POST /api/users (createUser)
  GET /api/products (getProducts)  ← New!

✅ All routes match! API contract is valid.
```

## Troubleshooting

### Hook Not Triggering

1. Check hook is enabled in Kiro Hooks UI
2. Verify file pattern matches: `nginx-api/openapi.yaml`
3. Check Kiro output panel for errors

### Generation Fails

1. Validate OpenAPI syntax:
   ```bash
   npm install -g @apidevtools/swagger-cli
   swagger-cli validate nginx-api/openapi.yaml
   ```

2. Check for missing dependencies:
   ```bash
   cd nginx-api
   npm install
   ```

3. Run manually to see errors:
   ```bash
   npm run generate-all
   ```

### Validation Fails

If validation fails after regeneration:
- Check that all `operationId` values are unique
- Ensure all routes in OpenAPI are valid HTTP methods
- Verify handler files were created

## Best Practices

### 1. Always Update OpenAPI First
- Never manually edit `app.js` or handler files before updating OpenAPI
- OpenAPI is the source of truth

### 2. Review Generated Code
- Check what Kiro generated
- Verify new handlers were created
- Look for TODO comments

### 3. Implement Incrementally
- Add one endpoint at a time
- Test locally before committing
- Deploy frequently

### 4. Use Descriptive Operation IDs
```yaml
# Good
operationId: getProducts
operationId: createProduct
operationId: updateProduct

# Bad
operationId: get1
operationId: post2
```

### 5. Document Everything
```yaml
paths:
  /api/products:
    get:
      summary: List all products
      description: Returns a paginated list of products with optional filtering
      operationId: getProducts
```

## Integration with CI/CD

The Jenkins pipeline also validates the contract:

```groovy
stage('Validate API Contract') {
    steps {
        sh 'cd nginx-api && npm run validate'
    }
}
```

This ensures:
- No drift between OpenAPI and implementation
- All endpoints are tested
- Contract is enforced before deployment

## Summary

With the automated OpenAPI workflow:

1. **Edit** `openapi.yaml`
2. **Save** (Kiro regenerates everything)
3. **Implement** business logic in handlers
4. **Deploy** (Jenkins handles the rest)

No manual route creation, no manual test writing, no manual validation. Everything is automated and guaranteed to stay in sync.

**Time to add endpoint**: 2 minutes  
**Lines of boilerplate**: 0  
**Consistency**: 100%
