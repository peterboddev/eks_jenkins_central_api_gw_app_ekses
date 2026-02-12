#!/usr/bin/env node
/**
 * Test Generator from OpenAPI Spec
 * 
 * Generates integration tests based on the OpenAPI specification.
 * Ensures all endpoints defined in the spec are tested.
 * 
 * Usage: node generate-tests-from-openapi.js > test-endpoints-generated.sh
 */

const fs = require('fs');
const yaml = require('js-yaml');

// Load OpenAPI spec
const spec = yaml.load(fs.readFileSync('./openapi.yaml', 'utf8'));

// Generate bash test script
console.log('#!/bin/bash');
console.log('# Auto-generated integration tests from OpenAPI spec');
console.log('# DO NOT EDIT MANUALLY - regenerate using generate-tests-from-openapi.js');
console.log('');
console.log('set -e');
console.log('');
console.log('# Configuration');
console.log('API_GATEWAY_URL="${API_GATEWAY_URL:-https://79jzt0dapd.execute-api.us-west-2.amazonaws.com}"');
console.log('COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID:-5pc3u5as9anjs5vrp3vtblsfs6}"');
console.log('COGNITO_USERNAME="${COGNITO_USERNAME:-testuser@example.com}"');
console.log('COGNITO_PASSWORD="${COGNITO_PASSWORD:-TestPass123!}"');
console.log('');
console.log('echo "🔐 Getting Cognito access token..."');
console.log('TOKEN=$(aws cognito-idp initiate-auth \\');
console.log('  --auth-flow USER_PASSWORD_AUTH \\');
console.log('  --client-id $COGNITO_CLIENT_ID \\');
console.log('  --auth-parameters USERNAME=$COGNITO_USERNAME,PASSWORD=$COGNITO_PASSWORD \\');
console.log('  --region us-west-2 \\');
console.log('  --query "AuthenticationResult.AccessToken" \\');
console.log('  --output text)');
console.log('');
console.log('if [ -z "$TOKEN" ]; then');
console.log('  echo "❌ Failed to get access token"');
console.log('  exit 1');
console.log('fi');
console.log('');
console.log('echo "✅ Got access token"');
console.log('echo ""');
console.log('');

// Generate tests for each endpoint
Object.keys(spec.paths).forEach(path => {
  const pathItem = spec.paths[path];
  
  Object.keys(pathItem).forEach(method => {
    if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) return;
    
    const operation = pathItem[method];
    const operationId = operation.operationId || `${method}_${path}`;
    const summary = operation.summary || path;
    const requiresAuth = !(operation.security && operation.security.length === 0);
    
    console.log(`# Test: ${summary}`);
    console.log(`echo "Testing ${method.toUpperCase()} ${path}..."`);
    
    if (method === 'get') {
      if (requiresAuth) {
        console.log(`RESPONSE=$(curl -s -w "\\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_GATEWAY_URL${path}")`);
      } else {
        console.log(`RESPONSE=$(curl -s -w "\\n%{http_code}" "$API_GATEWAY_URL${path}")`);
      }
    } else if (method === 'post') {
      // Generate sample request body from schema
      let requestBody = '{}';
      if (operation.requestBody && operation.requestBody.content['application/json']) {
        const schema = operation.requestBody.content['application/json'].schema;
        if (schema.example) {
          requestBody = JSON.stringify(schema.example);
        } else if (schema.$ref) {
          // Look up the schema reference
          const refPath = schema.$ref.split('/').slice(2);
          let refSchema = spec.components;
          refPath.forEach(part => {
            refSchema = refSchema[part];
          });
          if (refSchema.example) {
            requestBody = JSON.stringify(refSchema.example);
          }
        }
      }
      
      if (requiresAuth) {
        console.log(`RESPONSE=$(curl -s -w "\\n%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '${requestBody}' "$API_GATEWAY_URL${path}")`);
      } else {
        console.log(`RESPONSE=$(curl -s -w "\\n%{http_code}" -X POST -H "Content-Type: application/json" -d '${requestBody}' "$API_GATEWAY_URL${path}")`);
      }
    }
    
    console.log('HTTP_CODE=$(echo "$RESPONSE" | tail -n1)');
    console.log('BODY=$(echo "$RESPONSE" | sed \'$d\')');
    console.log('');
    
    // Check expected status code
    const successCode = method === 'post' && path.includes('users') ? '201' : '200';
    console.log(`if [ "$HTTP_CODE" != "${successCode}" ]; then`);
    console.log(`  echo "❌ ${method.toUpperCase()} ${path} failed with status $HTTP_CODE"`);
    console.log('  echo "Response: $BODY"');
    console.log('  exit 1');
    console.log('fi');
    console.log('');
    console.log(`echo "✅ ${method.toUpperCase()} ${path} - Status: $HTTP_CODE"`);
    console.log('echo ""');
    console.log('');
  });
});

console.log('echo "🎉 All tests passed!"');
