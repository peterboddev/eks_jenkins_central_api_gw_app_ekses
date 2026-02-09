# Jenkins to App Cluster Connectivity Guide

## Current State

The nginx-api-cluster EKS cluster is accessible from Jenkins **without Transit Gateway** because:
- ✅ Public endpoint is enabled
- ✅ IAM authentication is configured
- ✅ Jenkins pods can reach the public internet via NAT Gateway

## Quick Setup: Connect Jenkins to App Cluster

### Step 1: Configure IAM Access

The Jenkins service account needs permission to access the app cluster:

```bash
# Add Jenkins IAM role to app cluster's aws-auth ConfigMap
kubectl edit configmap aws-auth -n kube-system --context arn:aws:eks:us-west-2:450683699755:cluster/nginx-api-cluster
```

Add this entry:
```yaml
- rolearn: arn:aws:iam::450683699755:role/jenkins-eks-cluster-JenkinsServiceAccountRole
  username: jenkins-deployer
  groups:
    - system:masters
```

### Step 2: Test Connection from Jenkins

Create a test Jenkins job:

```groovy
pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: jenkins
  containers:
  - name: kubectl
    image: amazon/aws-cli:latest
    command:
    - cat
    tty: true
'''
        }
    }
    stages {
        stage('Test App Cluster Access') {
            steps {
                container('kubectl') {
                    sh '''
                        # Install kubectl
                        curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                        chmod +x kubectl
                        mv kubectl /usr/local/bin/
                        
                        # Configure kubeconfig for app cluster
                        aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2
                        
                        # Test connection
                        kubectl get nodes
                        kubectl get pods -A
                    '''
                }
            }
        }
    }
}
```

### Step 3: Deploy to App Cluster from Jenkins

Example deployment job:

```groovy
pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: jenkins
  containers:
  - name: deployer
    image: alpine/helm:latest
    command:
    - cat
    tty: true
'''
        }
    }
    stages {
        stage('Deploy to App Cluster') {
            steps {
                container('deployer') {
                    sh '''
                        # Install AWS CLI
                        apk add --no-cache aws-cli
                        
                        # Configure kubeconfig
                        aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2
                        
                        # Deploy with Helm
                        helm upgrade --install nginx-api ./nginx-api-chart \
                          --namespace default \
                          --set image.tag=${BUILD_NUMBER}
                    '''
                }
            }
        }
    }
}
```

## Connectivity Options Comparison

| Option | Cost | Complexity | Latency | Security | Status |
|--------|------|------------|---------|----------|--------|
| **Public Endpoint** | Free | Low | Medium | IAM Auth | ✅ Available Now |
| **Transit Gateway** | ~$36/month | Medium | Low | Private | ❌ Not Configured |
| **VPC Peering** | Free | Low | Low | Private | ❌ Not Configured |

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                             │
└────────────┬────────────────────────────────────┬───────────┘
             │                                    │
             │ HTTPS                              │ HTTPS (IAM Auth)
             │                                    │
    ┌────────▼────────┐                  ┌───────▼────────┐
    │  API Gateway    │                  │ Jenkins Pods   │
    │  (Public)       │                  │ (via NAT GW)   │
    └────────┬────────┘                  └────────────────┘
             │                                    │
             │ HTTPS                              │
             │                                    │
    ┌────────▼────────┐                          │
    │  Public ALB     │                          │
    │  (10.1.x.x)     │                          │
    └────────┬────────┘                          │
             │                                    │
             │ HTTP                               │
             │                                    │
    ┌────────▼────────┐                          │
    │  nginx Pods     │◄─────────────────────────┘
    │  (10.1.x.x)     │      kubectl/helm
    └─────────────────┘      (via public endpoint)
```

## Why Public Endpoint Works

1. **EKS Public Endpoint**: The app cluster control plane is accessible via public internet
2. **IAM Authentication**: AWS IAM provides secure authentication (no passwords/tokens needed)
3. **TLS Encryption**: All kubectl/API traffic is encrypted in transit
4. **No Additional Cost**: Uses existing NAT Gateway in Jenkins VPC

## When to Use Transit Gateway

Consider Transit Gateway if you need:
- **Private-only connectivity** (no public endpoints)
- **Multiple VPCs** (3+ VPCs that need to communicate)
- **Lower latency** for frequent kubectl operations
- **Compliance requirements** for private-only management

## Security Considerations

### Public Endpoint Security
- ✅ IAM authentication required
- ✅ TLS encryption for all traffic
- ✅ CloudTrail logs all API calls
- ✅ Can restrict by source IP if needed
- ⚠️ Control plane endpoint is publicly routable (but secured)

### Transit Gateway Security
- ✅ Fully private connectivity
- ✅ No public exposure
- ✅ Lower attack surface
- ⚠️ Additional cost (~$36/month)
- ⚠️ More complex to set up

## Recommended Approach

**For MVP/Development**: Use public endpoint (current state)
- Zero additional cost
- Works immediately
- Secure with IAM authentication

**For Production**: Consider Transit Gateway if:
- Security policy requires private-only management
- You have multiple VPCs to connect
- Budget allows for additional infrastructure

## Testing Connectivity

From your local machine (to verify it works):

```bash
# Update kubeconfig for app cluster
aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2

# Test connection
kubectl get nodes --context arn:aws:eks:us-west-2:450683699755:cluster/nginx-api-cluster

# Deploy something
kubectl apply -f test-pod.yaml --context arn:aws:eks:us-west-2:450683699755:cluster/nginx-api-cluster
```

This same approach works from Jenkins pods - they just need:
1. AWS CLI installed
2. IAM permissions to access the cluster
3. kubectl installed

## Next Steps

1. **Add Jenkins IAM role to app cluster aws-auth** (Step 1 above)
2. **Create test Jenkins job** to verify connectivity
3. **Update existing Jenkins jobs** to deploy to app cluster
4. **Optional**: Implement Transit Gateway if private connectivity is required
