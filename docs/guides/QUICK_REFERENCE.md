# Quick Reference - nginx-api-cluster

## Public API Endpoints

### Base URL
```
https://79jzt0dapd.execute-api.us-west-2.amazonaws.com
```

### Endpoints

**Health Check**
```bash
curl https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health
```

**App Info**
```bash
curl https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api/info
```

**Echo**
```bash
curl -X POST https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api/echo \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
```

## Cluster Access

### Configure kubectl
```bash
aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2
```

### Common Commands
```bash
# Check nodes
kubectl get nodes

# Check pods
kubectl get pods -A

# Check ingress
kubectl get ingress

# Check Karpenter
kubectl get nodepools
kubectl get ec2nodeclasses

# Check ALB Controller
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

## Jenkins Deployment Example

```groovy
pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: kubectl
    image: amazon/aws-cli:latest
    command: [cat]
    tty: true
'''
        }
    }
    stages {
        stage('Deploy') {
            steps {
                container('kubectl') {
                    sh '''
                        curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                        chmod +x kubectl && mv kubectl /usr/local/bin/
                        
                        aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2
                        kubectl get nodes
                    '''
                }
            }
        }
    }
}
```

## Key Resources

| Resource | ID/Name |
|----------|---------|
| **App VPC** | vpc-034b59e141c9a0afa |
| **Jenkins VPC** | vpc-03f4521a8c48a73e4 |
| **App Cluster** | nginx-api-cluster |
| **Jenkins Cluster** | jenkins-eks-cluster |
| **Transit Gateway** | tgw-02f987a644404377f |
| **ALB** | k8s-default-nginxapi-229d97ff9c-1487485550.us-west-2.elb.amazonaws.com |
| **API Gateway** | 79jzt0dapd |
| **ALB Security Group** | sg-078976752768a6ce4 |
| **Cluster Security Group** | sg-09f86d5c198e396d5 |

## Troubleshooting

### ALB Not Working
```bash
# Check ALB Controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller

# Check ingress status
kubectl describe ingress nginx-api

# Check target health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn> \
  --region us-west-2
```

### Karpenter Not Scaling
```bash
# Check Karpenter logs
kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter

# Check NodePool
kubectl describe nodepool default

# Check EC2NodeClass
kubectl describe ec2nodeclass default
```

### Jenkins Can't Access App Cluster
```bash
# Verify Transit Gateway attachments
aws ec2 describe-transit-gateway-attachments \
  --filters "Name=transit-gateway-id,Values=tgw-02f987a644404377f" \
  --region us-west-2

# Verify route tables
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=vpc-03f4521a8c48a73e4" \
  --region us-west-2

# Check IAM access
aws eks list-access-entries \
  --cluster-name nginx-api-cluster \
  --region us-west-2
```

## Cost Optimization

- **NAT Gateway**: Using 1 instead of 2 saves ~$32/month
- **Karpenter**: Automatically scales down unused nodes
- **On-Demand Instances**: Predictable costs, no spot interruptions
- **Single ALB**: Shared across all services

## Monitoring

### CloudWatch Logs
- **API Gateway**: `/aws/apigateway/nginx-api-cluster`
- **EKS Control Plane**: `/aws/eks/nginx-api-cluster/cluster`

### Metrics to Watch
- ALB target health
- Karpenter node provisioning time
- API Gateway 4xx/5xx errors
- EKS control plane API latency
