#!/usr/bin/env node
/**
 * Express App Generator from OpenAPI Spec
 * 
 * Generates Express routes, handlers, and tests from OpenAPI specification.
 * Developers only need to fill in the business logic (marked with TODO).
 * 
 * Usage: node generate-app-from-openapi.js
 */

const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// Determine the correct path to openapi.yaml
const openapiPath = fs.existsSync('./openapi.yaml') 
  ? './openapi.yaml' 
  : path.join(__dirname, 'openapi.yaml');

// Load OpenAPI spec
const spec = yaml.load(fs.readFileSync(openapiPath, 'utf8'));

console.log('🚀 Generating Express app from OpenAPI spec...\n');

// Generate Express app
function generateExpressApp() {
  let code = `// Auto-generated Express app from OpenAPI specification
// Generated on: ${new Date().toISOString()}
// 
// TODO sections indicate where you need to add business logic.
// Everything else is generated automatically from openapi.yaml

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(\`\${new Date().toISOString()} - \${req.method} \${req.path}\`);
  next();
});

`;

  // Generate routes from OpenAPI spec
  Object.keys(spec.paths).forEach(path => {
    const pathItem = spec.paths[path];
    
    Object.keys(pathItem).forEach(method => {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) return;
      
      const operation = pathItem[method];
      const operationId = operation.operationId || `${method}_${path.replace(/\//g, '_')}`;
      const summary = operation.summary || 'No description';
      const hasRequestBody = operation.requestBody !== undefined;
      const successCode = method === 'post' ? '201' : '200';
      
      code += `// ${summary}\n`;
      code += `// Operation ID: ${operationId}\n`;
      code += `app.${method}('${path}', async (req, res, next) => {\n`;
      code += `  try {\n`;
      
      if (hasRequestBody) {
        code += `    const requestBody = req.body;\n`;
        code += `    \n`;
        code += `    // TODO: Validate request body\n`;
        code += `    // TODO: Add your business logic here\n`;
        code += `    \n`;
      } else {
        code += `    // TODO: Add your business logic here\n`;
        code += `    \n`;
      }
      
      // Generate sample response based on schema
      const response = operation.responses[successCode];
      if (response && response.content && response.content['application/json']) {
        const schema = response.content['application/json'].schema;
        const sampleResponse = generateSampleResponse(schema);
        code += `    // Sample response (replace with actual data)\n`;
        code += `    const response = ${JSON.stringify(sampleResponse, null, 6).replace(/\n/g, '\n    ')};\n`;
        code += `    \n`;
        code += `    res.status(${successCode}).json(response);\n`;
      } else {
        code += `    res.status(${successCode}).json({ success: true });\n`;
      }
      
      code += `  } catch (error) {\n`;
      code += `    next(error);\n`;
      code += `  }\n`;
      code += `});\n\n`;
    });
  });

  // Add error handlers
  code += `// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(\`API server listening on port \${PORT}\`);
    console.log(\`Environment: \${process.env.NODE_ENV || 'development'}\`);
  });
}

module.exports = app;
`;

  return code;
}

// Generate sample response from schema
function generateSampleResponse(schema) {
  if (schema.$ref) {
    // Resolve reference
    const refPath = schema.$ref.split('/').slice(2);
    let refSchema = spec.components;
    refPath.forEach(part => {
      refSchema = refSchema[part];
    });
    return generateSampleResponse(refSchema);
  }
  
  if (schema.example) {
    return schema.example;
  }
  
  if (schema.type === 'object') {
    const obj = {};
    if (schema.properties) {
      Object.keys(schema.properties).forEach(key => {
        const prop = schema.properties[key];
        if (prop.example !== undefined) {
          obj[key] = prop.example;
        } else if (prop.type === 'string') {
          obj[key] = prop.format === 'date-time' ? new Date().toISOString() : 'TODO: Add value';
        } else if (prop.type === 'number' || prop.type === 'integer') {
          obj[key] = 0;
        } else if (prop.type === 'boolean') {
          obj[key] = true;
        } else if (prop.type === 'array') {
          obj[key] = [];
        } else if (prop.type === 'object') {
          obj[key] = {};
        }
      });
    }
    return obj;
  }
  
  if (schema.type === 'array') {
    return [];
  }
  
  return null;
}

// Generate handlers directory structure
function generateHandlers() {
  const handlersDir = './handlers';
  if (!fs.existsSync(handlersDir)) {
    fs.mkdirSync(handlersDir);
  }
  
  console.log('📁 Generating handler files...');
  
  Object.keys(spec.paths).forEach(path => {
    const pathItem = spec.paths[path];
    
    Object.keys(pathItem).forEach(method => {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) return;
      
      const operation = pathItem[method];
      const operationId = operation.operationId || `${method}_${path.replace(/\//g, '_')}`;
      const handlerFile = `${handlersDir}/${operationId}.js`;
      
      // Don't overwrite existing handlers
      if (fs.existsSync(handlerFile)) {
        console.log(`  ⏭️  Skipping ${operationId}.js (already exists)`);
        return;
      }
      
      const handlerCode = `/**
 * Handler: ${operation.summary || 'No description'}
 * Operation ID: ${operationId}
 * Method: ${method.toUpperCase()}
 * Path: ${path}
 */

async function ${operationId}(req, res, next) {
  try {
    // TODO: Implement your business logic here
    
    ${operation.requestBody ? '// Request body is available in req.body' : ''}
    ${path.includes('{') ? '// Path parameters are available in req.params' : ''}
    // Query parameters are available in req.query
    
    // Example: Connect to database
    // const result = await db.query('SELECT * FROM table');
    
    // Example: Call external API
    // const response = await fetch('https://api.example.com/data');
    
    // Example: Process data
    // const processedData = processData(req.body);
    
    // Return response
    res.status(${method === 'post' ? '201' : '200'}).json({
      message: 'TODO: Replace with actual response',
      // Add your response data here
    });
  } catch (error) {
    next(error);
  }
}

module.exports = ${operationId};
`;
      
      fs.writeFileSync(handlerFile, handlerCode);
      console.log(`  ✅ Created ${operationId}.js`);
    });
  });
}

// Generate app with modular handlers
function generateModularApp() {
  let code = `// Auto-generated Express app from OpenAPI specification
// Generated on: ${new Date().toISOString()}
// 
// This app uses modular handlers in the ./handlers directory.
// Edit handler files to add your business logic.

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(\`\${new Date().toISOString()} - \${req.method} \${req.path}\`);
  next();
});

// Import handlers
`;

  // Import all handlers
  const handlers = [];
  Object.keys(spec.paths).forEach(path => {
    const pathItem = spec.paths[path];
    
    Object.keys(pathItem).forEach(method => {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) return;
      
      const operation = pathItem[method];
      const operationId = operation.operationId || `${method}_${path.replace(/\//g, '_')}`;
      handlers.push(operationId);
      code += `const ${operationId} = require('./handlers/${operationId}');\n`;
    });
  });
  
  code += `\n// Routes\n`;
  
  // Generate routes
  Object.keys(spec.paths).forEach(path => {
    const pathItem = spec.paths[path];
    
    Object.keys(pathItem).forEach(method => {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) return;
      
      const operation = pathItem[method];
      const operationId = operation.operationId || `${method}_${path.replace(/\//g, '_')}`;
      const summary = operation.summary || 'No description';
      
      code += `app.${method}('${path}', ${operationId}); // ${summary}\n`;
    });
  });

  // Add error handlers
  code += `
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(\`API server listening on port \${PORT}\`);
    console.log(\`Environment: \${process.env.NODE_ENV || 'development'}\`);
  });
}

module.exports = app;
`;

  return code;
}

// Main execution
console.log('📝 Generating app.generated.js (monolithic)...');
const monolithicApp = generateExpressApp();
fs.writeFileSync('./app.generated.js', monolithicApp);
console.log('✅ Created app.generated.js\n');

console.log('📝 Generating app.modular.js (with separate handlers)...');
generateHandlers();
const modularApp = generateModularApp();
fs.writeFileSync('./app.modular.js', modularApp);
console.log('✅ Created app.modular.js\n');

console.log('🎉 Generation complete!\n');
console.log('Next steps:');
console.log('1. Review app.generated.js or app.modular.js');
console.log('2. Fill in TODO sections with your business logic');
console.log('3. If using modular approach, edit files in ./handlers/');
console.log('4. Rename to app.js when ready');
console.log('5. Run: npm start');
