# nginx-api Architecture

## Complete Request Flow

```
┌─────────┐
│ Client  │
└────┬────┘
     │ HTTPS + JWT Token
     │
     ▼
┌─────────────────────────────────────────┐
│ API Gateway                             │
│ https://79jzt0dapd.execute-api.us-west-2│
│ .amazonaws.com                          │
│                                         │
│ ✓ Validates JWT with Cognito           │
│ ✓ Returns 401 if invalid/missing       │
└────┬────────────────────────────────────┘
     │ HTTP (authenticated)
     │
     ▼
┌─────────────────────────────────────────┐
│ Application Load Balancer (ALB)         │
│ k8s-default-nginxapi-229d97ff9c-        │
│ 1487485550.us-west-2.elb.amazonaws.com  │
│                                         │
│ ✓ Load balances across pods             │
│ ✓ Health checks                         │
└────┬────────────────────────────────────┘
     │ HTTP
     │
     ▼
┌─────────────────────────────────────────┐
│ Kubernetes Service                      │
│ nginx-api (ClusterIP)                   │
│                                         │
│ ✓ Service discovery                     │
│ ✓ Pod selection                         │
└────┬────────────────────────────────────┘
     │ HTTP
     │
     ▼
┌─────────────────────────────────────────┐
│ Pod: nginx-api-xxxxx                    │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ nginx (port 8080)                 │  │
│  │ - Reverse proxy                   │  │
│  │ - Request forwarding              │  │
│  │ - Header management               │  │
│  └────┬──────────────────────────────┘  │
│       │ HTTP (localhost)                │
│       ▼                                 │
│  ┌───────────────────────────────────┐  │
│  │ Node.js Express (port 3000)       │  │
│  │ - app.js                          │  │
│  │ - Business logic                  │  │
│  │ - Database connections            │  │
│  │ - API endpoints                   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

## Component Details

### 1. Client
- Any HTTP client (browser, curl, Postman, mobile app)
- Must obtain JWT token from Cognito first
- Sends token in `Authorization: Bearer <token>` header

### 2. API Gateway
- **Type**: AWS API Gateway (HTTP API)
- **URL**: https://79jzt0dapd.execute-api.us-west-2.amazonaws.com
- **Authorizer**: JWT authorizer (Cognito)
- **Cognito User Pool**: us-west-2_LSGkua2JE
- **Responsibilities**:
  - Validate JWT signature
  - Check token expiration
  - Return 401 Unauthorized if invalid
  - Forward authenticated requests to ALB

### 3. Application Load Balancer (ALB)
- **Type**: AWS Application Load Balancer
- **DNS**: k8s-default-nginxapi-229d97ff9c-1487485550.us-west-2.elb.amazonaws.com
- **Managed by**: AWS Load Balancer Controller (in EKS)
- **Responsibilities**:
  - Load balance across multiple pods
  - Health checks (GET /health)
  - SSL termination (if configured)
  - Target group management

### 4. Kubernetes Service
- **Name**: nginx-api
- **Type**: ClusterIP (internal)
- **Namespace**: default
- **Selector**: app=nginx-api
- **Responsibilities**:
  - Service discovery within cluster
  - Pod selection and routing
  - Stable internal endpoint

### 5. Kubernetes Pod
- **Deployment**: nginx-api
- **Replicas**: Configurable (auto-scaled by Karpenter)
- **Image**: 450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-api:latest
- **Contains**: Two processes in one container

#### 5a. nginx (Reverse Proxy)
- **Port**: 8080 (exposed to Kubernetes)
- **Config**: `/etc/nginx/nginx.conf`
- **Responsibilities**:
  - Accept incoming HTTP requests
  - Proxy all requests to Node.js on localhost:3000
  - Add headers (X-Real-IP, X-Forwarded-For, etc.)
  - Buffer responses
  - Handle timeouts

#### 5b. Node.js Express Application
- **Port**: 3000 (internal, not exposed)
- **Code**: `/app/app.js`
- **Responsibilities**:
  - Handle business logic
  - Process API requests
  - Connect to databases
  - Return JSON responses
  - Error handling

## Port Mapping

```
External → Internal

Client:443 (HTTPS)
    ↓
API Gateway:443 (HTTPS)
    ↓
ALB:80 (HTTP)
    ↓
K8s Service:80 (HTTP)
    ↓
Pod:8080 (nginx)
    ↓
Pod:3000 (Node.js)
```

## Authentication Flow

### Getting a Token
```bash
# User authenticates with Cognito
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id 5pc3u5as9anjs5vrp3vtblsfs6 \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TestPass123! \
  --region us-west-2
```

Returns:
```json
{
  "AuthenticationResult": {
    "AccessToken": "eyJraWQiOiJ...",
    "IdToken": "eyJraWQiOiJ...",
    "RefreshToken": "eyJjdHkiOiJ...",
    "ExpiresIn": 3600
  }
}
```

### Using the Token
```bash
# Client sends request with token
curl -H "Authorization: Bearer eyJraWQiOiJ..." \
  https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api/test
```

### Token Validation
1. API Gateway receives request
2. Extracts JWT from Authorization header
3. Validates JWT signature using Cognito public keys
4. Checks expiration (tokens expire after 1 hour)
5. If valid: forwards to ALB
6. If invalid: returns 401 Unauthorized

## Data Flow Example

### Request: GET /api/test

```
1. Client → API Gateway
   GET https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api/test
   Authorization: Bearer eyJraWQiOiJ...

2. API Gateway validates JWT
   ✓ Signature valid
   ✓ Not expired
   ✓ Issuer matches Cognito

3. API Gateway → ALB
   GET http://k8s-default-nginxapi-229d97ff9c-1487485550.us-west-2.elb.amazonaws.com/api/test
   (JWT validation already done)

4. ALB → Kubernetes Service
   GET http://nginx-api.default.svc.cluster.local/api/test

5. Service → Pod (nginx)
   GET http://10.1.x.x:8080/api/test

6. nginx → Node.js
   GET http://127.0.0.1:3000/api/test
   X-Real-IP: <client-ip>
   X-Forwarded-For: <client-ip>

7. Node.js processes request
   app.get('/api/test', (req, res) => {
     res.json({
       message: 'Test endpoint working',
       method: req.method,
       uri: req.originalUrl,
       timestamp: new Date().toISOString()
     });
   });

8. Response flows back
   Node.js → nginx → Pod → Service → ALB → API Gateway → Client
```

## Scaling

### Horizontal Pod Autoscaling
- Managed by Karpenter
- Scales based on CPU/memory usage
- Adds/removes pods automatically

### Node Scaling
- Karpenter provisions EC2 instances as needed
- Scales down unused nodes to save costs

## Monitoring

### Health Checks
- ALB checks: `GET /health` every 10 seconds
- Unhealthy pods are removed from rotation
- Kubernetes restarts failed pods

### Logs
```bash
# View nginx + Node.js logs
kubectl logs -n default -l app=nginx-api

# Follow logs in real-time
kubectl logs -n default -l app=nginx-api -f

# View logs from specific pod
kubectl logs -n default nginx-api-xxxxx
```

### Metrics
- CloudWatch Container Insights
- Kubernetes metrics server
- Custom application metrics (TODO)

## Development vs Production

### Development (Local)
```
Developer → Node.js (port 3000)
```
- Run Node.js directly: `npm start`
- Fast iteration, no Docker needed
- Direct access to application

### Development (Docker)
```
Developer → nginx (port 8080) → Node.js (port 3000)
```
- Run full stack: `docker run -p 8080:8080 nginx-api:local`
- Test nginx configuration
- Test full request flow

### Production (EKS)
```
Client → API Gateway → ALB → nginx → Node.js
```
- Full authentication
- Load balancing
- Auto-scaling
- High availability

## Security Layers

1. **API Gateway**: JWT validation (Cognito)
2. **ALB**: Security groups, WAF (optional)
3. **Kubernetes**: Network policies, RBAC
4. **Application**: Input validation, error handling

## File Locations

### In Repository
- `nginx-api/app.js` - Node.js application code
- `nginx-api/nginx.conf` - nginx configuration
- `nginx-api/Dockerfile` - Container definition
- `nginx-api/package.json` - Node.js dependencies

### In Container
- `/app/app.js` - Node.js application
- `/etc/nginx/nginx.conf` - nginx configuration
- `/start.sh` - Startup script (runs both processes)

### In Kubernetes
- Deployment: `kubectl get deployment nginx-api -n default`
- Service: `kubectl get svc nginx-api -n default`
- Pods: `kubectl get pods -n default -l app=nginx-api`

## Troubleshooting

### 401 Unauthorized
- Token expired (get new token)
- Token invalid (check Cognito user pool)
- Missing Authorization header

### 502 Bad Gateway
- Node.js not running (check pod logs)
- Node.js crashed (check pod logs)
- Port 3000 not listening

### 503 Service Unavailable
- No healthy pods (check pod status)
- All pods failing health checks
- Deployment not ready

### 504 Gateway Timeout
- Node.js taking too long to respond
- Database query timeout
- Increase nginx proxy timeout

## Next Steps

1. **Add Database**: Connect to RDS/DynamoDB
2. **Add Caching**: Redis for session/data caching
3. **Add Monitoring**: Custom metrics, APM
4. **Add Tracing**: AWS X-Ray for request tracing
5. **Add Rate Limiting**: Protect against abuse
6. **Add CORS**: Configure for frontend apps
