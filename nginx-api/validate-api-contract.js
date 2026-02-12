#!/usr/bin/env node
/**
 * API Contract Validator
 * 
 * Validates that the Express app implementation matches the OpenAPI spec.
 * Run this before deployment to catch mismatches.
 * 
 * Usage: node validate-api-contract.js
 */

const fs = require('fs');
const yaml = require('js-yaml');
const express = require('express');

// Load OpenAPI spec
const openApiSpec = yaml.load(fs.readFileSync('./openapi.yaml', 'utf8'));

// Load Express app (without starting the server)
const app = require('./app.js');

// Extract routes from Express app
function extractExpressRoutes(app) {
  const routes = [];
  
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      // Direct route
      const methods = Object.keys(middleware.route.methods);
      methods.forEach(method => {
        routes.push({
          method: method.toUpperCase(),
          path: middleware.route.path
        });
      });
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods);
          methods.forEach(method => {
            routes.push({
              method: method.toUpperCase(),
              path: handler.route.path
            });
          });
        }
      });
    }
  });
  
  return routes;
}

// Extract routes from OpenAPI spec
function extractOpenApiRoutes(spec) {
  const routes = [];
  
  Object.keys(spec.paths).forEach(path => {
    const pathItem = spec.paths[path];
    Object.keys(pathItem).forEach(method => {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
        routes.push({
          method: method.toUpperCase(),
          path: path,
          operationId: pathItem[method].operationId
        });
      }
    });
  });
  
  return routes;
}

// Validate
console.log('🔍 Validating API contract...\n');

const expressRoutes = extractExpressRoutes(app);
const openApiRoutes = extractOpenApiRoutes(openApiSpec);

console.log('Express Routes:');
expressRoutes.forEach(r => console.log(`  ${r.method} ${r.path}`));

console.log('\nOpenAPI Routes:');
openApiRoutes.forEach(r => console.log(`  ${r.method} ${r.path} (${r.operationId})`));

// Check for missing routes in Express
console.log('\n📋 Checking for missing implementations...');
let missingCount = 0;

openApiRoutes.forEach(apiRoute => {
  const found = expressRoutes.find(
    expRoute => expRoute.method === apiRoute.method && expRoute.path === apiRoute.path
  );
  
  if (!found) {
    console.log(`  ❌ Missing: ${apiRoute.method} ${apiRoute.path}`);
    missingCount++;
  }
});

// Check for undocumented routes in Express
console.log('\n📋 Checking for undocumented routes...');
let undocumentedCount = 0;

expressRoutes.forEach(expRoute => {
  const found = openApiRoutes.find(
    apiRoute => apiRoute.method === expRoute.method && apiRoute.path === expRoute.path
  );
  
  if (!found) {
    console.log(`  ⚠️  Undocumented: ${expRoute.method} ${expRoute.path}`);
    undocumentedCount++;
  }
});

// Summary
console.log('\n' + '='.repeat(50));
if (missingCount === 0 && undocumentedCount === 0) {
  console.log('✅ All routes match! API contract is valid.');
  process.exit(0);
} else {
  console.log(`❌ Contract validation failed:`);
  console.log(`   - ${missingCount} routes missing implementation`);
  console.log(`   - ${undocumentedCount} routes undocumented`);
  process.exit(1);
}
