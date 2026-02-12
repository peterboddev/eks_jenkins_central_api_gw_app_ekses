#!/usr/bin/env node
/**
 * Infrastructure Generator from OpenAPI Spec
 * 
 * Generates:
 * 1. AWS CDK code for API Gateway with routes from OpenAPI
 * 2. API Gateway export for direct import
 * 3. nginx configuration with specific routes
 * 
 * Usage: node generate-infrastructure-from-openapi.js
 */

const fs = require('fs');
const yaml = require('js-yaml');

// Load OpenAPI spec
const spec = yaml.load(fs.readFileSync('./nginx-api/openapi.yaml', 'utf8'));

console.log('🏗️  Generating infrastructure from OpenAPI spec...\n');

// 1. Generate CDK code for API Gateway
function generateCDKApiGateway() {
  let code = `// Auto-generated API Gateway CDK code from OpenAPI
// Generated on: ${new Date().toISOString()}

import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayv2_authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Construct } from 'constructs';

export interface ApiGatewayFromOpenApiProps {
  albUrl: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
}

export class ApiGatewayFromOpenApi extends Construct {
  public readonly api: apigatewayv2.HttpApi;
  
  constructor(scope: Construct, id: string, props: ApiGatewayFromOpenApiProps) {
    super(scope, id);
    
    // Create HTTP API
    this.api = new apigatewayv2.HttpApi(this, 'Api', {
      apiName: '${spec.info.title}',
      description: '${spec.info.description}',
    });
    
    // Create ALB integration
    const albIntegration = new apigatewayv2_integrations.HttpUrlIntegration(
      'AlbIntegration',
      props.albUrl,
      {
        method: apigatewayv2.HttpMethod.ANY,
      }
    );
    
    // Create Cognito authorizer
    const authorizer = new apigatewayv2_authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      \`https://cognito-idp.\${cdk.Stack.of(this).region}.amazonaws.com/\${props.cognitoUserPoolId}\`,
      {
        jwtAudience: [props.cognitoClientId],
      }
    );
    
`;

  // Generate routes
  Object.keys(spec.paths).forEach(path => {
    const pathItem = spec.paths[path];
    
    Object.keys(pathItem).forEach(method => {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) return;
      
      const operation = pathItem[method];
      const requiresAuth = !(operation.security && operation.security.length === 0);
      const routeKey = `${method.toUpperCase()} ${path}`;
      
      code += `    // ${operation.summary || 'No description'}\n`;
      code += `    this.api.addRoutes({\n`;
      code += `      path: '${path}',\n`;
      code += `      methods: [apigatewayv2.HttpMethod.${method.toUpperCase()}],\n`;
      code += `      integration: albIntegration,\n`;
      if (requiresAuth) {
        code += `      authorizer: authorizer,\n`;
      }
      code += `    });\n\n`;
    });
  });

  code += `    // Output API endpoint
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url!,
      description: 'API Gateway endpoint URL',
    });
  }
}
`;

  return code;
}

// 2. Generate API Gateway OpenAPI export (for direct import)
function generateApiGatewayOpenApi() {
  // Clone spec and add AWS extensions
  const awsSpec = JSON.parse(JSON.stringify(spec));
  
  // Add x-amazon-apigateway-integration to each path
  Object.keys(awsSpec.paths).forEach(path => {
    const pathItem = awsSpec.paths[path];
    
    Object.keys(pathItem).forEach(method => {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) return;
      
      const operation = pathItem[method];
      
      // Add AWS API Gateway integration
      operation['x-amazon-apigateway-integration'] = {
        type: 'http_proxy',
        httpMethod: method.toUpperCase(),
        uri: '${ALB_URL}' + path,
        connectionType: 'INTERNET',
        payloadFormatVersion: '1.0',
        timeoutInMillis: 29000,
      };
      
      // Add authorizer if required
      const requiresAuth = !(operation.security && operation.security.length === 0);
      if (requiresAuth) {
        operation['x-amazon-apigateway-authorizer'] = {
          type: 'jwt',
          jwtConfiguration: {
            audience: ['${COGNITO_CLIENT_ID}'],
            issuer: 'https://cognito-idp.${AWS_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}',
          },
        };
      }
    });
  });
  
  return yaml.dump(awsSpec);
}

// 3. Generate nginx configuration with specific routes
function generateNginxConfig() {
  let config = `# Auto-generated nginx configuration from OpenAPI
# Generated on: ${new Date().toISOString()}

events {
    worker_connections 1024;
}

http {
    # Upstream Node.js application
    upstream nodejs_backend {
        server 127.0.0.1:3000;
    }

    server {
        listen 8080;
        
        # Specific routes from OpenAPI spec
`;

  // Generate location blocks for each path
  Object.keys(spec.paths).forEach(path => {
    const pathItem = spec.paths[path];
    const methods = Object.keys(pathItem).filter(m => 
      ['get', 'post', 'put', 'delete', 'patch'].includes(m)
    ).map(m => m.toUpperCase());
    
    if (methods.length > 0) {
      const nginxPath = path.replace(/{([^}]+)}/g, '~'); // Convert {id} to regex
      config += `        \n`;
      config += `        # ${pathItem[Object.keys(pathItem)[0]].summary || path}\n`;
      config += `        location ${nginxPath.includes('~') ? '~ ' : ''}${nginxPath} {\n`;
      
      // Limit methods
      config += `            limit_except ${methods.join(' ')} {\n`;
      config += `                deny all;\n`;
      config += `            }\n`;
      config += `            \n`;
      config += `            proxy_pass http://nodejs_backend;\n`;
      config += `            proxy_http_version 1.1;\n`;
      config += `            \n`;
      config += `            # Pass headers\n`;
      config += `            proxy_set_header Host $host;\n`;
      config += `            proxy_set_header X-Real-IP $remote_addr;\n`;
      config += `            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n`;
      config += `            proxy_set_header X-Forwarded-Proto $scheme;\n`;
      config += `        }\n`;
    }
  });

  config += `        
        # Catch-all for undefined routes
        location / {
            default_type application/json;
            return 404 '{"error":"Not Found","message":"Route not defined in API specification"}';
        }
    }
}
`;

  return config;
}

// 4. Generate deployment script
function generateDeploymentScript() {
  return `#!/bin/bash
# Auto-generated deployment script from OpenAPI
# Generated on: ${new Date().toISOString()}

set -e

echo "🚀 Deploying API from OpenAPI specification..."

# Configuration
AWS_REGION="\${AWS_REGION:-us-west-2}"
STACK_NAME="\${STACK_NAME:-nginx-api-cluster}"

# 1. Generate Express app
echo "📝 Generating Express app..."
cd nginx-api
node generate-app-from-openapi.js

# 2. Review generated code
echo "⏸️  Please review the generated code:"
echo "   - nginx-api/app.generated.js (or app.modular.js)"
echo "   - nginx-api/handlers/* (if using modular approach)"
echo ""
read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 1
fi

# 3. Deploy CDK stack
echo "🏗️  Deploying CDK stack..."
cd ..
npm run build
npx cdk deploy $STACK_NAME --require-approval never

# 4. Import OpenAPI to API Gateway (optional)
echo "📤 Importing OpenAPI to API Gateway..."
# Uncomment to enable:
# aws apigatewayv2 import-api \\
#   --body file://nginx-api/openapi.aws.yaml \\
#   --region $AWS_REGION

echo "✅ Deployment complete!"
`;
}

// Main execution
console.log('1️⃣  Generating CDK code...');
const cdkCode = generateCDKApiGateway();
fs.writeFileSync('./lib/api-gateway-from-openapi.generated.ts', cdkCode);
console.log('✅ Created lib/api-gateway-from-openapi.generated.ts\n');

console.log('2️⃣  Generating API Gateway OpenAPI export...');
const awsOpenApi = generateApiGatewayOpenApi();
fs.writeFileSync('./nginx-api/openapi.aws.yaml', awsOpenApi);
console.log('✅ Created nginx-api/openapi.aws.yaml\n');

console.log('3️⃣  Generating nginx configuration...');
const nginxConfig = generateNginxConfig();
fs.writeFileSync('./nginx-api/nginx.generated.conf', nginxConfig);
console.log('✅ Created nginx-api/nginx.generated.conf\n');

console.log('4️⃣  Generating deployment script...');
const deployScript = generateDeploymentScript();
fs.writeFileSync('./deploy-from-openapi.sh', deployScript);
fs.chmodSync('./deploy-from-openapi.sh', '755');
console.log('✅ Created deploy-from-openapi.sh\n');

console.log('🎉 Infrastructure generation complete!\n');
console.log('Generated files:');
console.log('  - lib/api-gateway-from-openapi.generated.ts (CDK code)');
console.log('  - nginx-api/openapi.aws.yaml (API Gateway import)');
console.log('  - nginx-api/nginx.generated.conf (nginx config)');
console.log('  - deploy-from-openapi.sh (deployment script)');
console.log('');
console.log('Next steps:');
console.log('1. Review generated CDK code');
console.log('2. Integrate into your stack (lib/eks_nginx_api-stack.ts)');
console.log('3. Generate Express app: cd nginx-api && node generate-app-from-openapi.js');
console.log('4. Fill in business logic in generated handlers');
console.log('5. Deploy: ./deploy-from-openapi.sh');
