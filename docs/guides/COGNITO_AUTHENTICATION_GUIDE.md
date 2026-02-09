# Cognito Authentication Guide - nginx-api-cluster

## 🔐 Authentication Status: ACTIVE

The API Gateway is now secured with AWS Cognito JWT authentication. All API requests require a valid access token.

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ 1. Authenticate with Cognito
       │
┌──────▼──────────────────────────────────┐
│  AWS Cognito User Pool                  │
│  us-west-2_LSGkua2JE                    │
│  (nginx-api-users)                      │
└──────┬──────────────────────────────────┘
       │ 2. Returns JWT Access Token
       │
┌──────▼──────┐
│   Client    │
└──────┬──────┘
       │ 3. Request with Authorization: Bearer <token>
       │
┌──────▼──────────────────────────────────┐
│  API Gateway                             │
│  79jzt0dapd                              │
│  JWT Authorizer: 6pdhft                 │
└──────┬──────────────────────────────────┘
       │ 4. Validates JWT signature and claims
       │ 5. Forwards to ALB if valid
       │
┌──────▼──────────────────────────────────┐
│  Application Load Balancer              │
│  → nginx API Pods                       │
└─────────────────────────────────────────┘
```

## Cognito Configuration

### User Pool Details
- **User Pool ID**: us-west-2_LSGkua2JE
- **User Pool Name**: nginx-api-users
- **Region**: us-west-2
- **Client ID**: 5pc3u5as9anjs5vrp3vtblsfs6
- **Client Secret**: None (public client)

### JWT Authorizer
- **Authorizer ID**: 6pdhft
- **Authorizer Name**: cognito-authorizer
- **Type**: JWT
- **Identity Source**: $request.header.Authorization
- **Issuer**: https://cognito-idp.us-west-2.amazonaws.com/us-west-2_LSGkua2JE
- **Audience**: 5pc3u5as9anjs5vrp3vtblsfs6

### Protected Routes
- **Route ID**: lsebya4
- **Path**: ANY /{proxy+}
- **Authorization**: Required (JWT)
- **All API endpoints require authentication**

## Test User

A test user has been created for development and testing:

- **Username**: testuser@example.com
- **Password**: TestPass123!
- **Status**: CONFIRMED (ready to use)

## Authentication Flow

### Step 1: Obtain Access Token

Use the AWS CLI to authenticate and get an access token:

```bash
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id 5pc3u5as9anjs5vrp3vtblsfs6 \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPass123! \
  --region us-west-2 \
  --query 'AuthenticationResult.AccessToken' \
  --output text
```

**Response**: A JWT access token (valid for 1 hour)

### Step 2: Make Authenticated Requests

Include the access token in the Authorization header:

```bash
# Store token in variable
TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id 5pc3u5as9anjs5vrp3vtblsfs6 \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPass123! \
  --region us-west-2 \
  --query 'AuthenticationResult.AccessToken' \
  --output text)

# Make authenticated request
curl -H "Authorization: Bearer $TOKEN" \
  https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health
```

## API Endpoints

All endpoints require authentication:

### 1. Health Check
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health
```

**Response (200 OK)**:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-06T19:24:12+00:00"
}
```

### 2. Application Info
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api/info
```

**Response (200 OK)**:
```json
{
  "app": "nginx-api",
  "version": "1.0.0",
  "cluster": "nginx-api-cluster"
}
```

### 3. Echo Endpoint
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","data":"test"}' \
  https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api/echo
```

**Response (200 OK)**:
```json
{
  "message": "hello",
  "data": "test"
}
```

## PowerShell Examples

### Get Access Token
```powershell
$token = aws cognito-idp initiate-auth `
  --auth-flow USER_PASSWORD_AUTH `
  --client-id 5pc3u5as9anjs5vrp3vtblsfs6 `
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPass123! `
  --region us-west-2 `
  --query "AuthenticationResult.AccessToken" `
  --output text
```

### Make Authenticated Request
```powershell
Invoke-WebRequest `
  -Uri "https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health" `
  -Method GET `
  -Headers @{Authorization="Bearer $token"} `
  -UseBasicParsing
```

## Error Responses

### 401 Unauthorized (No Token)
```bash
curl https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health
```

**Response**:
```json
{
  "message": "Unauthorized"
}
```

### 401 Unauthorized (Invalid Token)
```bash
curl -H "Authorization: Bearer invalid_token" \
  https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health
```

**Response**:
```json
{
  "message": "Unauthorized"
}
```

### 401 Unauthorized (Expired Token)
Tokens expire after 1 hour. Obtain a new token using the authentication flow.

## User Management

### Create New User
```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-west-2_LSGkua2JE \
  --username newuser@example.com \
  --user-attributes Name=email,Value=newuser@example.com Name=email_verified,Value=true \
  --temporary-password TempPass123! \
  --region us-west-2
```

### Set Permanent Password
```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id us-west-2_LSGkua2JE \
  --username newuser@example.com \
  --password NewPass123! \
  --permanent \
  --region us-west-2
```

### List Users
```bash
aws cognito-idp list-users \
  --user-pool-id us-west-2_LSGkua2JE \
  --region us-west-2
```

### Delete User
```bash
aws cognito-idp admin-delete-user \
  --user-pool-id us-west-2_LSGkua2JE \
  --username user@example.com \
  --region us-west-2
```

## Token Details

### Access Token Claims
The JWT access token contains:
- **sub**: User's unique identifier (UUID)
- **iss**: Token issuer (Cognito User Pool)
- **client_id**: Application client ID
- **token_use**: "access"
- **scope**: "aws.cognito.signin.user.admin"
- **auth_time**: Authentication timestamp
- **exp**: Expiration timestamp (1 hour from auth_time)
- **iat**: Issued at timestamp
- **jti**: JWT ID (unique token identifier)
- **username**: User's UUID

### Token Validation
API Gateway automatically validates:
1. **Signature**: Verifies JWT signature using Cognito's public keys
2. **Issuer**: Matches configured issuer URL
3. **Audience**: Matches configured client ID
4. **Expiration**: Token is not expired
5. **Token Use**: Token is an access token

## Security Best Practices

### Token Storage
- **Never** commit tokens to version control
- Store tokens securely in environment variables or secrets managers
- Rotate tokens regularly (obtain new token before expiration)

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Production Recommendations
1. **Enable MFA**: Add multi-factor authentication for users
2. **Custom Domain**: Use custom domain for API Gateway
3. **Rate Limiting**: Configure API Gateway throttling
4. **Monitoring**: Set up CloudWatch alarms for authentication failures
5. **User Pool Policies**: Configure password policies and account recovery
6. **Token Refresh**: Implement refresh token flow for long-lived sessions

## Integration with Applications

### JavaScript/Node.js
```javascript
const AWS = require('aws-sdk');
const axios = require('axios');

const cognito = new AWS.CognitoIdentityServiceProvider({
  region: 'us-west-2'
});

async function authenticate(username, password) {
  const params = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: '5pc3u5as9anjs5vrp3vtblsfs6',
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password
    }
  };
  
  const result = await cognito.initiateAuth(params).promise();
  return result.AuthenticationResult.AccessToken;
}

async function callApi(token) {
  const response = await axios.get(
    'https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health',
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  return response.data;
}

// Usage
(async () => {
  const token = await authenticate('testuser@example.com', 'TestPass123!');
  const data = await callApi(token);
  console.log(data);
})();
```

### Python
```python
import boto3
import requests

cognito = boto3.client('cognito-idp', region_name='us-west-2')

def authenticate(username, password):
    response = cognito.initiate_auth(
        AuthFlow='USER_PASSWORD_AUTH',
        ClientId='5pc3u5as9anjs5vrp3vtblsfs6',
        AuthParameters={
            'USERNAME': username,
            'PASSWORD': password
        }
    )
    return response['AuthenticationResult']['AccessToken']

def call_api(token):
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.get(
        'https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health',
        headers=headers
    )
    return response.json()

# Usage
token = authenticate('testuser@example.com', 'TestPass123!')
data = call_api(token)
print(data)
```

## Troubleshooting

### Issue: "Unauthorized" with valid token
**Possible Causes**:
- Token expired (tokens are valid for 1 hour)
- Wrong Authorization header format (must be "Bearer <token>")
- Token from different user pool or client

**Solution**: Obtain a new token and verify header format

### Issue: "User does not exist"
**Possible Causes**:
- Username typo
- User not created or deleted

**Solution**: Verify username and create user if needed

### Issue: "Incorrect username or password"
**Possible Causes**:
- Wrong password
- User status is not CONFIRMED

**Solution**: Reset password or confirm user status

### Issue: Token validation fails
**Possible Causes**:
- Authorizer misconfigured
- Wrong issuer or audience

**Solution**: Verify authorizer configuration matches user pool

## Monitoring

### CloudWatch Logs
API Gateway logs authentication failures:
```bash
aws logs tail /aws/apigateway/nginx-api-gateway --follow --region us-west-2
```

### Cognito Metrics
Monitor authentication attempts:
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Cognito \
  --metric-name SignInSuccesses \
  --dimensions Name=UserPool,Value=us-west-2_LSGkua2JE \
  --start-time 2026-02-06T00:00:00Z \
  --end-time 2026-02-06T23:59:59Z \
  --period 3600 \
  --statistics Sum \
  --region us-west-2
```

## Cost Considerations

### Cognito Pricing
- **Free Tier**: 50,000 MAUs (Monthly Active Users)
- **Beyond Free Tier**: $0.0055 per MAU

### API Gateway Pricing
- **HTTP API**: $1.00 per million requests
- **Data Transfer**: Standard AWS data transfer rates

## Next Steps

1. **Add More Users**: Create additional users for your team
2. **Implement Refresh Tokens**: For long-lived sessions
3. **Add User Groups**: Organize users by role or permissions
4. **Custom Attributes**: Add custom user attributes if needed
5. **Social Identity Providers**: Integrate Google, Facebook, etc.
6. **SAML/OIDC**: Integrate with corporate identity providers

## Support

For issues or questions:
- Check API Gateway logs in CloudWatch
- Review Cognito User Pool events
- Verify JWT token claims using jwt.io
- Test authentication flow with AWS CLI

## Deployment Date

February 6, 2026
