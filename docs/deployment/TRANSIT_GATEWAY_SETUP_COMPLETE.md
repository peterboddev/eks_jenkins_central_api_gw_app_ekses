# Transit Gateway Setup - Complete

## Overview

Transit Gateway connectivity has been successfully configured between the Jenkins VPC and the nginx-api-cluster VPC, enabling private network communication for CI/CD operations.

## Transit Gateway Details

- **Transit Gateway ID**: tgw-02f987a644404377f
- **Name**: jenkins-app-tgw
- **ASN**: 64512
- **DNS Support**: Enabled
- **Auto Accept Attachments**: Enabled
- **Default Route Table**: tgw-rtb-01961a71112abd088

## VPC Attachments

### Jenkins VPC Attachment
- **Attachment ID**: tgw-attach-021fcab0b94d16a57
- **VPC ID**: vpc-03f4521a8c48a73e4
- **CIDR**: 10.0.0.0/16
- **Subnets**: 
  - subnet-0782b7f0eff0751ba (us-west-2b, private)
  - subnet-0ba6e8191c326a4e6 (us-west-2a, private)

### App VPC Attachment
- **Attachment ID**: tgw-attach-0d86ad8ffcd35dde8
- **VPC ID**: vpc-034b59e141c9a0afa
- **CIDR**: 10.1.0.0/16
- **Subnets**:
  - subnet-0752179b36efe3bdd (us-west-2b, private)
  - subnet-04cd45d65ad61253d (us-west-2a, private)

## Route Table Configuration

### Jenkins VPC Private Subnets
Routes to App VPC (10.1.0.0/16) via Transit Gateway:

| Route Table ID | Subnet | Destination | Target |
|----------------|--------|-------------|--------|
| rtb-07397676ff14310b0 | subnet-0782b7f0eff0751ba | 10.1.0.0/16 | tgw-02f987a644404377f |
| rtb-0c3aaa85b6740aa04 | subnet-0ba6e8191c326a4e6 | 10.1.0.0/16 | tgw-02f987a644404377f |

### App VPC Private Subnets
Routes to Jenkins VPC (10.0.0.0/16) via Transit Gateway:

| Route Table ID | Subnet | Destination | Target |
|----------------|--------|-------------|--------|
| rtb-021db00b810c3693a | subnet-0752179b36efe3bdd | 10.0.0.0/16 | tgw-02f987a644404377f |
| rtb-0156ce145b65c7876 | subnet-04cd45d65ad61253d | 10.0.0.0/16 | tgw-02f987a644404377f |

## Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Transit Gateway                              │
│                  tgw-02f987a644404377f                          │
│                                                                  │
│  ┌──────────────────────┐         ┌──────────────────────┐    │
│  │  Jenkins VPC         │         │  App VPC             │    │
│  │  10.0.0.0/16         │         │  10.1.0.0/16         │    │
│  │                      │         │                      │    │
│  │  Private Subnets:    │         │  Private Subnets:    │    │
│  │  - 10.0.1.0/24       │◄───────►│  - 10.1.2.0/24       │    │
│  │  - 10.0.2.0/24       │         │  - 10.1.3.0/24       │    │
│  │                      │         │                      │    │
│  │  Jenkins Pods        │         │  nginx API Pods      │    │
│  │  EKS Control Plane   │         │  EKS Control Plane   │    │
│  └──────────────────────┘         └──────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Enabled Use Cases

### 1. Jenkins kubectl Access to App Cluster
Jenkins pods can now use kubectl to manage the app cluster via the private EKS endpoint:

```bash
# From Jenkins pod
aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2
kubectl get nodes
kubectl get pods -A
```

### 2. Jenkins Helm Deployments
Jenkins can deploy applications to the app cluster using Helm:

```bash
# From Jenkins pod
helm upgrade --install nginx-api ./nginx-api-chart \
  --namespace default \
  --set image.tag=${BUILD_NUMBER}
```

### 3. Cross-Cluster Communication
- Jenkins can reach app cluster control plane at: https://9C1E5FD737E6D0DF7AB621306207041F.gr7.us-west-2.eks.amazonaws.com
- App cluster pods can pull images from Jenkins ECR (already configured)
- Private network connectivity for all management operations

## Security Configuration

### EKS Control Plane Security Groups

The app cluster security group (sg-09f86d5c198e396d5) already allows:
- Port 443 from Jenkins VPC CIDR (10.0.0.0/16) ✅

No additional security group changes needed!

### IAM Configuration Required

To enable Jenkins to manage the app cluster, add the Jenkins service account role to the app cluster's aws-auth ConfigMap:

```bash
kubectl edit configmap aws-auth -n kube-system --context arn:aws:eks:us-west-2:450683699755:cluster/nginx-api-cluster
```

Add this entry:
```yaml
mapRoles: |
  - rolearn: arn:aws:iam::450683699755:role/jenkins-eks-cluster-JenkinsServiceAccountRole
    username: jenkins-deployer
    groups:
      - system:masters
```

## Testing Connectivity

### Test 1: Network Connectivity
From a Jenkins pod, test network connectivity to the app cluster:

```bash
# Get a shell in Jenkins pod
kubectl exec -it <jenkins-pod> -n jenkins -- /bin/bash

# Test connectivity to app cluster control plane
curl -k https://9C1E5FD737E6D0DF7AB621306207041F.gr7.us-west-2.eks.amazonaws.com

# Should return 403 (authentication required) - this means network connectivity works!
```

### Test 2: kubectl Access
After configuring IAM (aws-auth), test kubectl access:

```bash
# From Jenkins pod
aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2
kubectl get nodes
kubectl get pods -A
```

### Test 3: Deploy Application
Create a Jenkins job to deploy to the app cluster:

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
        stage('Deploy to App Cluster') {
            steps {
                container('kubectl') {
                    sh '''
                        # Install kubectl
                        curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                        chmod +x kubectl
                        mv kubectl /usr/local/bin/
                        
                        # Configure kubeconfig
                        aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2
                        
                        # Deploy
                        kubectl get nodes
                        kubectl get pods -A
                    '''
                }
            }
        }
    }
}
```

## Cost

Transit Gateway costs approximately:
- **Attachment fee**: $0.05/hour per attachment × 2 = $0.10/hour = $73/month
- **Data transfer**: $0.02/GB for data processed

**Total estimated cost**: ~$73-100/month depending on data transfer

## Benefits of Transit Gateway

1. **Private Connectivity**: All management traffic stays within AWS private network
2. **Scalability**: Can easily add more VPCs without complex peering
3. **Security**: No public endpoint exposure required for management
4. **Customer Pattern**: Replicates real-world multi-VPC architectures
5. **Lower Latency**: Direct private network path vs. public internet

## Alternative: Public Endpoint

If Transit Gateway cost is a concern, the app cluster also has a public endpoint enabled, allowing Jenkins to connect via the internet with IAM authentication (no Transit Gateway required).

## Next Steps

1. **Configure IAM Access**: Add Jenkins role to app cluster aws-auth ConfigMap
2. **Test Connectivity**: Run test Jenkins job to verify kubectl access
3. **Update CI/CD Pipelines**: Modify existing Jenkins jobs to deploy to app cluster
4. **Monitor Costs**: Track Transit Gateway data transfer costs

## Deployment Date

February 6, 2026
