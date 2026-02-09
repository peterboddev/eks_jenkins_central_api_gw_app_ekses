# Jenkins EKS Cluster - Quick Start Guide

## Prerequisites

Ensure you have the following installed:
- AWS CLI v2.x
- kubectl v1.28+
- Node.js v18+
- AWS CDK v2.x
- AWS account with appropriate permissions

## Step 1: Deploy Infrastructure (30-45 minutes)

```bash
# Clone or navigate to the project directory
cd eks_jenkins

# Install dependencies
npm install

# Build the project
npm run build

# Bootstrap CDK (first time only)
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
cdk bootstrap aws://${AWS_ACCOUNT_ID}/us-west-2

# Deploy the CDK stack
cdk deploy

# Configure kubectl
aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2

# Verify cluster access
kubectl get nodes
```

## Step 2: Deploy EFS CSI Driver (5-10 minutes)

```bash
cd k8s/efs-csi-driver
chmod +x deploy.sh
./deploy.sh

# Verify deployment
kubectl get deployment efs-csi-controller -n kube-system
kubectl get storageclass efs-sc
```

## Step 3: Deploy Jenkins Controller (10-15 minutes)

```bash
cd ../jenkins
chmod +x deploy.sh
./deploy.sh

# Verify deployment
kubectl get all -n jenkins

# Wait for Jenkins pod to be ready
kubectl wait --for=condition=ready pod -l app=jenkins-controller -n jenkins --timeout=600s
```

## Step 4: Deploy Cluster Autoscaler (5-10 minutes)

```bash
cd ../cluster-autoscaler
chmod +x deploy.sh

export CLUSTER_NAME=jenkins-eks-cluster
export CLUSTER_AUTOSCALER_ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ClusterAutoscalerRoleArn`].OutputValue' \
  --output text)

CLUSTER_NAME=$CLUSTER_NAME CLUSTER_AUTOSCALER_ROLE_ARN=$CLUSTER_AUTOSCALER_ROLE_ARN ./deploy.sh

# Verify deployment
kubectl get deployment cluster-autoscaler -n kube-system
```

## Step 5: Deploy Node Termination Handler (5 minutes)

```bash
cd ../node-termination-handler
chmod +x deploy.sh
./deploy.sh

# Verify deployment
kubectl get daemonset aws-node-termination-handler -n kube-system
```

## Step 6: Deploy CloudWatch Container Insights (5-10 minutes)

```bash
cd ../monitoring
chmod +x deploy.sh

export CLUSTER_NAME=jenkins-eks-cluster
export AWS_REGION=us-west-2

CLUSTER_NAME=$CLUSTER_NAME AWS_REGION=$AWS_REGION ./deploy.sh

# Verify deployment
kubectl get daemonset -n amazon-cloudwatch
```

## Step 7: Deploy Jenkins Agent Pod Template (2 minutes)

```bash
cd ../jenkins

# Apply the agent pod template ConfigMap
kubectl apply -f agent-pod-template-configmap.yaml

# Verify ConfigMap
kubectl get configmap jenkins-agent-pod-template -n jenkins
```

## Step 8: Access Jenkins (5 minutes)

```bash
# Port forward to Jenkins
kubectl port-forward -n jenkins svc/jenkins 8080:8080 &

# Get initial admin password
kubectl exec -n jenkins $(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}') -- cat /var/jenkins_home/secrets/initialAdminPassword

# Open browser to http://localhost:8080
# Enter the initial admin password
# Install suggested plugins
# Create admin user
```

## Step 9: Configure Jenkins (10 minutes)

1. **Install Kubernetes Plugin**:
   - Navigate to **Manage Jenkins** > **Manage Plugins**
   - Install "Kubernetes" plugin

2. **Configure Kubernetes Cloud**:
   - Navigate to **Manage Jenkins** > **Manage Nodes and Clouds** > **Configure Clouds**
   - Add Kubernetes cloud:
     - Name: kubernetes
     - Kubernetes URL: https://kubernetes.default
     - Kubernetes Namespace: jenkins
     - Jenkins URL: http://jenkins.jenkins.svc.cluster.local:8080
     - Jenkins tunnel: jenkins.jenkins.svc.cluster.local:50000
   - Test connection and save

3. **Configure Pod Template**:
   - In Kubernetes cloud, add Pod Template:
     - Name: jenkins-agent
     - Namespace: jenkins
     - Labels: jenkins-agent
     - Node Selector: node-lifecycle=spot
   - Add Container:
     - Name: jnlp
     - Image: jenkins/inbound-agent:latest
     - Resources: CPU 1-2, Memory 2Gi-4Gi

## Step 10: Test the Setup (5 minutes)

Create a test pipeline:

```groovy
pipeline {
    agent {
        kubernetes {
            label 'jenkins-agent'
        }
    }
    stages {
        stage('Test') {
            steps {
                sh 'echo "Hello from Jenkins on EKS!"'
                sh 'kubectl version --client'
                sh 'aws --version'
            }
        }
    }
}
```

## Verification Checklist

- [ ] CDK stack deployed successfully
- [ ] kubectl can access the cluster
- [ ] 3 nodes running (1 controller, 2 agents)
- [ ] EFS CSI Driver deployed
- [ ] Storage class 'efs-sc' exists
- [ ] Jenkins pod running
- [ ] Jenkins PVC bound
- [ ] Cluster Autoscaler deployed
- [ ] Node Termination Handler deployed
- [ ] CloudWatch Container Insights deployed
- [ ] Jenkins UI accessible
- [ ] Test pipeline runs successfully

## Troubleshooting

### CDK Deploy Fails
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check CDK version
cdk --version

# Review CloudFormation events
aws cloudformation describe-stack-events --stack-name JenkinsEksStack
```

### Jenkins Pod Not Starting
```bash
# Check pod status
kubectl describe pod -n jenkins -l app=jenkins-controller

# Check PVC status
kubectl get pvc -n jenkins

# Check EFS CSI Driver
kubectl get pods -n kube-system -l app=efs-csi-controller
```

### Cannot Access Jenkins UI
```bash
# Check service
kubectl get svc -n jenkins

# Check port-forward
kubectl port-forward -n jenkins svc/jenkins 8080:8080

# Check pod logs
kubectl logs -n jenkins -l app=jenkins-controller
```

## Cost Estimate

**Monthly Cost** (us-west-2):
- EKS Cluster: ~$73
- EC2 Instances: ~$90 (1 on-demand + 2 spot)
- EFS: ~$10 (100GB)
- S3: ~$2 (100GB)
- NAT Gateways: ~$65
- VPC Endpoints: ~$15
- CloudWatch: ~$10
- **Total: ~$265/month**

## Next Steps

1. Configure Jenkins pipelines for your applications
2. Set up Jenkins authentication (LDAP, SAML, etc.)
3. Configure backup notifications (subscribe to SNS topic)
4. Set up CloudWatch alarms notifications
5. Review and adjust autoscaling settings
6. Configure Jenkins plugins for your workflow
7. Set up Jenkins job DSL or Configuration as Code

## Support

- **Documentation**: See DEPLOYMENT_GUIDE.md for detailed instructions
- **Status**: See DEPLOYMENT_STATUS.md for component status
- **AWS EKS**: https://docs.aws.amazon.com/eks/
- **Jenkins**: https://www.jenkins.io/doc/

## Clean Up

To delete all resources:

```bash
# Delete Kubernetes resources
kubectl delete namespace jenkins
kubectl delete namespace amazon-cloudwatch
kubectl delete daemonset aws-node-termination-handler -n kube-system
kubectl delete deployment cluster-autoscaler -n kube-system
kubectl delete daemonset efs-csi-node -n kube-system
kubectl delete deployment efs-csi-controller -n kube-system

# Delete CDK stack
cd eks_jenkins
cdk destroy
```

**Warning**: This will delete all data including Jenkins configurations and build history!

---

**Total Setup Time**: ~90 minutes  
**Status**: ✅ Ready for Production
