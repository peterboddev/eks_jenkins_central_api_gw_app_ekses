# Nginx API Cluster Deployment - Complete

## Deployment Summary

The nginx-api-cluster has been successfully deployed with full end-to-end connectivity through API Gateway.

## Infrastructure Components

### VPC and Networking
- **VPC ID**: vpc-034b59e141c9a0afa
- **CIDR**: 10.1.0.0/16
- **Availability Zones**: 2 (us-west-2a, us-west-2b)
- **NAT Gateways**: 1 (cost-optimized)
- **Subnets**: 2 public, 2 private

### EKS Cluster
- **Cluster Name**: nginx-api-cluster
- **Kubernetes Version**: 1.28
- **Endpoint**: https://9C1E5FD737E6D0DF7AB621306207041F.gr7.us-west-2.eks.amazonaws.com
- **Control Plane Logging**: Enabled (audit, authenticator, controller manager)
- **Cluster Security Group**: sg-09f86d5c198e396d5

### Karpenter (Dynamic Node Provisioning)
- **Version**: 1.1.1
- **Instance Profile**: KarpenterNodeInstanceProfile-nginx-api-cluster
- **Interruption Queue**: nginx-api-cluster-karpenter-interruption
- **Node Types**: t3.medium, t3.large, t3a.medium, t3a.large
- **Capacity Type**: On-demand
- **Bootstrap Nodegroup**: karpenter-bootstrap-medium (t3.medium, 1 node)

### AWS Load Balancer Controller
- **Version**: Latest (via Helm)
- **IAM Policy**: AWSLoadBalancerControllerIAMPolicy-nginx-api-cluster
- **IAM Role**: AWSLoadBalancerControllerRole-nginx-api-cluster
- **Status**: Running and operational

### Application Load Balancer
- **DNS Name**: k8s-default-nginxapi-229d97ff9c-1487485550.us-west-2.elb.amazonaws.com
- **Scheme**: Internet-facing
- **Security Group**: sg-078976752768a6ce4
- **Listener**: HTTP on port 80
- **Target Type**: IP (direct to pods)
- **Health Check**: /health endpoint

### API Gateway
- **API ID**: 79jzt0dapd
- **URL**: https://79jzt0dapd.execute-api.us-west-2.amazonaws.com
- **Type**: HTTP API
- **Integration**: HTTP_PROXY to ALB
- **Routes**: ANY /{proxy+} (catch-all)
- **CORS**: Enabled for all origins
- **Logging**: CloudWatch Logs enabled

### Nginx Application
- **Deployment**: nginx-api (via Helm)
- **Replicas**: 3 (currently 2 running)
- **Image**: nginx:alpine
- **Configuration**: ConfigMap-based nginx.conf
- **Endpoints**:
  - `/health` - Health check endpoint
  - `/api/info` - Application metadata
  - `/api/echo` - Echo server for testing

## API Endpoints (Public Access)

All endpoints are accessible through API Gateway:

### Health Endpoint
```bash
curl https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/health
```
Response:
```json
{"status":"healthy","timestamp":"2026-02-06T17:42:15+00:00"}
```

### Info Endpoint
```bash
curl https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api/info
```
Response:
```json
{"app":"nginx-api","version":"1.0.0","cluster":"nginx-api-cluster"}
```

### Echo Endpoint
```bash
curl -X POST https://79jzt0dapd.execute-api.us-west-2.amazonaws.com/api/echo \
  -H "Content-Type: application/json" \
  -d '{"test":"data","message":"hello"}'
```
Response: Empty (echo functionality needs enhancement)

## Security Configuration

### ALB Security Group (sg-078976752768a6ce4)
- **Inbound**:
  - Port 80 from 0.0.0.0/0 (HTTP)
  - Port 443 from 0.0.0.0/0 (HTTPS)
- **Outbound**: All traffic

### Cluster Security Group (sg-09f86d5c198e396d5)
- **Inbound**:
  - All traffic from itself
  - Port 8080 from ALB security group (sg-078976752768a6ce4)
- **Outbound**: All traffic

## IAM Roles and Policies

### Karpenter Node Role
- **Policies**:
  - AmazonEKSWorkerNodePolicy
  - AmazonEKS_CNI_Policy
  - AmazonEC2ContainerRegistryReadOnly
  - AmazonSSMManagedInstanceCore
  - Custom ECR cross-account access

### ALB Controller Role
- **Policy**: AWSLoadBalancerControllerIAMPolicy-nginx-api-cluster
- **Key Permission Added**: elasticloadbalancing:DescribeListenerAttributes

## Completed Tasks

✅ VPC infrastructure with proper subnet tagging
✅ EKS cluster with control plane logging
✅ Karpenter infrastructure and controller deployment
✅ AWS Load Balancer Controller deployment
✅ ALB provisioning with proper security groups
✅ API Gateway HTTP API with routes
✅ Nginx application deployment via Helm
✅ End-to-end connectivity testing

## Issues Resolved

1. **ALB Controller IAM Permission**: Added missing `elasticloadbalancing:DescribeListenerAttributes` permission
2. **Security Group Configuration**: 
   - Added port 80 ingress to ALB security group
   - Added port 8080 ingress from ALB to cluster security group
3. **API Gateway Integration**: Configured HTTP_PROXY integration with catch-all route

## Optional Tasks (Not Completed)

The following optional tasks were skipped for MVP:
- Transit Gateway connectivity to Jenkins VPC (tasks 8-9)
- Custom Docker image build and push to ECR (task 10)
- Property-based tests (task 18)
- Integration tests (task 19)

## Access Commands

### Update kubeconfig
```bash
aws eks update-kubeconfig --name nginx-api-cluster --region us-west-2
```

### Check cluster status
```bash
kubectl get nodes
kubectl get pods -A
```

### Check Karpenter status
```bash
kubectl get nodepools
kubectl get ec2nodeclasses
kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter
```

### Check ALB Controller status
```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

### Check application status
```bash
kubectl get ingress
kubectl get svc
kubectl get pods
```

## Next Steps (If Needed)

1. **Transit Gateway Setup**: Connect to Jenkins VPC for cross-cluster communication
2. **Custom Docker Image**: Build and deploy custom nginx image with enhanced echo functionality
3. **HTTPS Configuration**: Add ACM certificate and configure HTTPS listener on ALB
4. **Monitoring**: Set up CloudWatch dashboards and alarms
5. **Testing**: Implement property-based and integration tests

## Cost Optimization Notes

- Using 1 NAT Gateway instead of 2 (saves ~$32/month)
- Using on-demand instances with Karpenter for predictable costs
- Bootstrap nodegroup uses single t3.medium instance
- ALB is internet-facing but only accepts traffic on required ports

## Deployment Date

February 6, 2026
