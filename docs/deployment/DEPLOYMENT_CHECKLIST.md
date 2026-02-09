# Jenkins EKS Cluster - Deployment Checklist

Use this checklist to ensure a successful deployment of the Jenkins EKS cluster.

## Pre-Deployment Checklist

### Prerequisites Verification

- [ ] AWS CLI v2.x installed and configured
  ```bash
  aws --version
  aws sts get-caller-identity
  ```

- [ ] kubectl v1.28+ installed
  ```bash
  kubectl version --client
  ```

- [ ] Node.js v18+ installed
  ```bash
  node --version
  ```

- [ ] AWS CDK v2.x installed
  ```bash
  cdk --version
  ```

- [ ] AWS account has sufficient permissions
  - [ ] IAM permissions for CDK
  - [ ] EKS cluster creation
  - [ ] VPC and networking
  - [ ] EFS and S3
  - [ ] CloudWatch

- [ ] AWS service quotas verified
  - [ ] VPCs (need 1)
  - [ ] Elastic IPs (need 2)
  - [ ] NAT Gateways (need 2)
  - [ ] EKS clusters (need 1)
  - [ ] EC2 instances (need 3-12)

### Project Setup

- [ ] Project cloned/downloaded
- [ ] Navigate to project directory
  ```bash
  cd eks_jenkins
  ```

- [ ] Dependencies installed
  ```bash
  npm install
  ```

- [ ] Project builds successfully
  ```bash
  npm run build
  ```

- [ ] CDK synth works
  ```bash
  cdk synth
  ```

## Phase 1: CDK Infrastructure Deployment (30-45 minutes)

### CDK Bootstrap (First Time Only)

- [ ] Get AWS account ID
  ```bash
  AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  echo $AWS_ACCOUNT_ID
  ```

- [ ] Bootstrap CDK
  ```bash
  cdk bootstrap aws://${AWS_ACCOUNT_ID}/us-west-2
  ```

- [ ] Verify bootstrap stack exists
  ```bash
  aws cloudformation describe-stacks --stack-name CDKToolkit --region us-west-2
  ```

### CDK Deployment

- [ ] Review CloudFormation template
  ```bash
  cdk synth > template.yaml
  # Review template.yaml
  ```

- [ ] Deploy CDK stack
  ```bash
  cdk deploy
  ```

- [ ] Confirm deployment when prompted (type 'y')

- [ ] Wait for deployment to complete (~30-45 minutes)

- [ ] Verify CloudFormation stack status
  ```bash
  aws cloudformation describe-stacks --stack-name JenkinsEksStack --region us-west-2 --query 'Stacks[0].StackStatus'
  ```

- [ ] Review CloudFormation outputs
  ```bash
  aws cloudformation describe-stacks --stack-name JenkinsEksStack --region us-west-2 --query 'Stacks[0].Outputs'
  ```

### Post-CDK Verification

- [ ] VPC created
  ```bash
  aws ec2 describe-vpcs --filters "Name=tag:Name,Values=jenkins-eks-vpc" --region us-west-2
  ```

- [ ] EKS cluster created
  ```bash
  aws eks describe-cluster --name jenkins-eks-cluster --region us-west-2
  ```

- [ ] EFS file system created
  ```bash
  aws efs describe-file-systems --region us-west-2 | grep jenkins-eks-efs
  ```

- [ ] S3 bucket created
  ```bash
  aws s3 ls | grep jenkins
  ```

- [ ] Configure kubectl
  ```bash
  aws eks update-kubeconfig --name jenkins-eks-cluster --region us-west-2
  ```

- [ ] Verify kubectl access
  ```bash
  kubectl get nodes
  # Should show 3 nodes (1 controller, 2 agent)
  ```

- [ ] Verify nodes are Ready
  ```bash
  kubectl get nodes -o wide
  # All nodes should be in Ready state
  ```

## Phase 2: EFS CSI Driver Deployment (5-10 minutes)

- [ ] Navigate to EFS CSI Driver directory
  ```bash
  cd k8s/efs-csi-driver
  ```

- [ ] Make deploy script executable
  ```bash
  chmod +x deploy.sh
  ```

- [ ] Run deployment script
  ```bash
  ./deploy.sh
  ```

- [ ] Verify EFS CSI controller deployment
  ```bash
  kubectl get deployment efs-csi-controller -n kube-system
  # Should show 2/2 ready
  ```

- [ ] Verify EFS CSI node DaemonSet
  ```bash
  kubectl get daemonset efs-csi-node -n kube-system
  # Should show pods on all nodes
  ```

- [ ] Verify storage class created
  ```bash
  kubectl get storageclass efs-sc
  # Should show efs-sc storage class
  ```

- [ ] Check EFS CSI controller logs
  ```bash
  kubectl logs -n kube-system deployment/efs-csi-controller -c efs-plugin --tail=20
  # Should show no errors
  ```

## Phase 3: Jenkins Controller Deployment (10-15 minutes)

- [ ] Navigate to Jenkins directory
  ```bash
  cd ../jenkins
  ```

- [ ] Make deploy script executable
  ```bash
  chmod +x deploy.sh
  ```

- [ ] Run deployment script
  ```bash
  ./deploy.sh
  ```

- [ ] Verify Jenkins namespace created
  ```bash
  kubectl get namespace jenkins
  ```

- [ ] Verify Jenkins service account
  ```bash
  kubectl get serviceaccount jenkins-controller -n jenkins
  kubectl describe serviceaccount jenkins-controller -n jenkins | grep eks.amazonaws.com/role-arn
  # Should show IRSA annotation
  ```

- [ ] Verify Jenkins PVC bound
  ```bash
  kubectl get pvc -n jenkins
  # jenkins-home should be Bound
  ```

- [ ] Verify Jenkins StatefulSet
  ```bash
  kubectl get statefulset jenkins-controller -n jenkins
  # Should show 1/1 ready
  ```

- [ ] Verify Jenkins pod running
  ```bash
  kubectl get pods -n jenkins
  # jenkins-controller-0 should be Running
  ```

- [ ] Wait for Jenkins pod to be ready
  ```bash
  kubectl wait --for=condition=ready pod -l app=jenkins-controller -n jenkins --timeout=600s
  ```

- [ ] Check Jenkins pod logs
  ```bash
  kubectl logs -n jenkins -l app=jenkins-controller --tail=50
  # Should show Jenkins startup logs
  ```

- [ ] Verify Jenkins service
  ```bash
  kubectl get service jenkins -n jenkins
  # Should show ClusterIP service with ports 8080 and 50000
  ```

## Phase 4: Cluster Autoscaler Deployment (5-10 minutes)

- [ ] Navigate to Cluster Autoscaler directory
  ```bash
  cd ../cluster-autoscaler
  ```

- [ ] Make deploy script executable
  ```bash
  chmod +x deploy.sh
  ```

- [ ] Set environment variables
  ```bash
  export CLUSTER_NAME=jenkins-eks-cluster
  export CLUSTER_AUTOSCALER_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name JenkinsEksStack --query 'Stacks[0].Outputs[?OutputKey==`ClusterAutoscalerRoleArn`].OutputValue' --output text)
  echo $CLUSTER_AUTOSCALER_ROLE_ARN
  ```

- [ ] Run deployment script
  ```bash
  CLUSTER_NAME=$CLUSTER_NAME CLUSTER_AUTOSCALER_ROLE_ARN=$CLUSTER_AUTOSCALER_ROLE_ARN ./deploy.sh
  ```

- [ ] Verify Cluster Autoscaler deployment
  ```bash
  kubectl get deployment cluster-autoscaler -n kube-system
  # Should show 1/1 ready
  ```

- [ ] Verify Cluster Autoscaler pod running
  ```bash
  kubectl get pods -n kube-system -l app=cluster-autoscaler
  # Should show Running pod
  ```

- [ ] Check Cluster Autoscaler logs
  ```bash
  kubectl logs -n kube-system -l app=cluster-autoscaler --tail=50
  # Should show autoscaler startup and node group discovery
  ```

## Phase 5: Node Termination Handler Deployment (5 minutes)

- [ ] Navigate to Node Termination Handler directory
  ```bash
  cd ../node-termination-handler
  ```

- [ ] Make deploy script executable
  ```bash
  chmod +x deploy.sh
  ```

- [ ] Run deployment script
  ```bash
  ./deploy.sh
  ```

- [ ] Verify Node Termination Handler DaemonSet
  ```bash
  kubectl get daemonset aws-node-termination-handler -n kube-system
  # Should show pods on spot nodes
  ```

- [ ] Verify Node Termination Handler pods running
  ```bash
  kubectl get pods -n kube-system -l app=aws-node-termination-handler
  # Should show Running pods on spot nodes
  ```

- [ ] Check Node Termination Handler logs
  ```bash
  kubectl logs -n kube-system -l app=aws-node-termination-handler --tail=20
  # Should show handler startup logs
  ```

## Phase 6: CloudWatch Container Insights Deployment (5-10 minutes)

- [ ] Navigate to monitoring directory
  ```bash
  cd ../monitoring
  ```

- [ ] Make deploy script executable
  ```bash
  chmod +x deploy.sh
  ```

- [ ] Set environment variables
  ```bash
  export CLUSTER_NAME=jenkins-eks-cluster
  export AWS_REGION=us-west-2
  ```

- [ ] Run deployment script
  ```bash
  CLUSTER_NAME=$CLUSTER_NAME AWS_REGION=$AWS_REGION ./deploy.sh
  ```

- [ ] Verify CloudWatch agent DaemonSet
  ```bash
  kubectl get daemonset cloudwatch-agent -n amazon-cloudwatch
  # Should show pods on all nodes
  ```

- [ ] Verify Fluent Bit DaemonSet
  ```bash
  kubectl get daemonset fluent-bit -n amazon-cloudwatch
  # Should show pods on all nodes
  ```

- [ ] Check CloudWatch agent logs
  ```bash
  kubectl logs -n amazon-cloudwatch -l name=cloudwatch-agent --tail=20
  # Should show agent startup logs
  ```

- [ ] Check Fluent Bit logs
  ```bash
  kubectl logs -n amazon-cloudwatch -l k8s-app=fluent-bit --tail=20
  # Should show log collection activity
  ```

## Phase 7: Jenkins Agent Pod Template Deployment (2 minutes)

- [ ] Navigate to Jenkins directory
  ```bash
  cd ../jenkins
  ```

- [ ] Apply agent pod template ConfigMap
  ```bash
  kubectl apply -f agent-pod-template-configmap.yaml
  ```

- [ ] Verify ConfigMap created
  ```bash
  kubectl get configmap jenkins-agent-pod-template -n jenkins
  ```

- [ ] View ConfigMap content
  ```bash
  kubectl describe configmap jenkins-agent-pod-template -n jenkins
  ```

## Phase 8: Jenkins Access and Configuration (10 minutes)

### Access Jenkins UI

- [ ] Start port forwarding
  ```bash
  kubectl port-forward -n jenkins svc/jenkins 8080:8080 &
  ```

- [ ] Get initial admin password
  ```bash
  kubectl exec -n jenkins $(kubectl get pods -n jenkins -l app=jenkins-controller -o jsonpath='{.items[0].metadata.name}') -- cat /var/jenkins_home/secrets/initialAdminPassword
  ```

- [ ] Open browser to http://localhost:8080

- [ ] Enter initial admin password

- [ ] Install suggested plugins

- [ ] Create admin user

- [ ] Configure Jenkins URL

### Configure Kubernetes Cloud

- [ ] Navigate to Manage Jenkins → Manage Nodes and Clouds → Configure Clouds

- [ ] Add Kubernetes cloud with:
  - Name: kubernetes
  - Kubernetes URL: https://kubernetes.default
  - Kubernetes Namespace: jenkins
  - Jenkins URL: http://jenkins.jenkins.svc.cluster.local:8080
  - Jenkins tunnel: jenkins.jenkins.svc.cluster.local:50000

- [ ] Test connection (should succeed)

- [ ] Save configuration

### Configure Pod Template

- [ ] Add Pod Template with:
  - Name: jenkins-agent
  - Namespace: jenkins
  - Labels: jenkins-agent
  - Node Selector: node-lifecycle=spot

- [ ] Add Container:
  - Name: jnlp
  - Image: jenkins/inbound-agent:latest
  - Resources: CPU 1-2, Memory 2Gi-4Gi

- [ ] Save configuration

## Phase 9: Testing and Verification (10 minutes)

### Create Test Pipeline

- [ ] Create new Pipeline job

- [ ] Add pipeline script:
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

- [ ] Run pipeline

- [ ] Verify pipeline succeeds

- [ ] Check that agent pod was created on spot node
  ```bash
  kubectl get pods -n jenkins -l jenkins=agent
  ```

### Verify Monitoring

- [ ] Open CloudWatch Console

- [ ] Navigate to Container Insights

- [ ] Select jenkins-eks-cluster

- [ ] Verify metrics are being collected

- [ ] Check CloudWatch Logs for log groups:
  - /aws/containerinsights/jenkins-eks-cluster/application
  - /aws/containerinsights/jenkins-eks-cluster/dataplane
  - /aws/containerinsights/jenkins-eks-cluster/host

### Verify Alarms

- [ ] Open CloudWatch Alarms

- [ ] Verify 5 alarms exist:
  - jenkins-eks-cluster-health
  - jenkins-eks-node-failure
  - jenkins-eks-disk-space
  - jenkins-eks-pending-pods
  - jenkins-eks-spot-interruption

- [ ] Subscribe to SNS topic for notifications
  ```bash
  aws sns subscribe --topic-arn $(aws cloudformation describe-stacks --stack-name JenkinsEksStack --query 'Stacks[0].Outputs[?OutputKey==`AlarmTopicArn`].OutputValue' --output text) --protocol email --notification-endpoint your-email@example.com
  ```

- [ ] Confirm subscription in email

## Phase 10: Final Verification (5 minutes)

### Infrastructure Verification

- [ ] All CloudFormation outputs available
- [ ] VPC and subnets created
- [ ] NAT Gateways operational
- [ ] VPC endpoints created
- [ ] EKS cluster healthy
- [ ] EFS file system accessible
- [ ] S3 bucket created
- [ ] IAM roles configured

### Kubernetes Verification

- [ ] All nodes in Ready state
- [ ] EFS CSI Driver operational
- [ ] Storage class available
- [ ] Jenkins pod running
- [ ] Jenkins PVC bound
- [ ] Cluster Autoscaler running
- [ ] Node Termination Handler running
- [ ] CloudWatch agents running

### Jenkins Verification

- [ ] Jenkins UI accessible
- [ ] Admin user created
- [ ] Kubernetes cloud configured
- [ ] Pod template configured
- [ ] Test pipeline runs successfully
- [ ] Agent pods schedule on spot nodes

### Monitoring Verification

- [ ] CloudWatch Container Insights collecting metrics
- [ ] CloudWatch Logs receiving logs
- [ ] CloudWatch Alarms configured
- [ ] SNS notifications configured

## Post-Deployment Tasks

### Documentation

- [ ] Document Jenkins URL and access method
- [ ] Document admin credentials (securely)
- [ ] Document any custom configurations
- [ ] Share deployment guide with team

### Security

- [ ] Review IAM policies
- [ ] Configure Jenkins authentication (LDAP, SAML, etc.)
- [ ] Set up VPN for production access
- [ ] Review security group rules

### Backup

- [ ] Verify AWS Backup is running
- [ ] Test EFS restore procedure
- [ ] Document backup retention policy
- [ ] Set up backup notifications

### Monitoring

- [ ] Create custom CloudWatch dashboards
- [ ] Set up log queries for common issues
- [ ] Configure additional alarms as needed
- [ ] Document monitoring procedures

### Operations

- [ ] Create runbooks for common tasks
- [ ] Document troubleshooting procedures
- [ ] Set up on-call rotation
- [ ] Train team on platform

## Troubleshooting

If any step fails, refer to:
- **DEPLOYMENT_GUIDE.md** - Detailed troubleshooting section
- **Component READMEs** - Specific component troubleshooting
- **CloudWatch Logs** - Check logs for errors
- **kubectl describe** - Check resource events

## Rollback Procedure

If deployment fails and you need to rollback:

```bash
# Delete Kubernetes resources
kubectl delete namespace jenkins
kubectl delete namespace amazon-cloudwatch
kubectl delete daemonset aws-node-termination-handler -n kube-system
kubectl delete deployment cluster-autoscaler -n kube-system
kubectl delete daemonset efs-csi-node -n kube-system
kubectl delete deployment efs-csi-controller -n kube-system

# Delete CDK stack
cdk destroy
```

## Success Criteria

Deployment is successful when:
- ✅ All phases completed without errors
- ✅ All verification checks pass
- ✅ Test pipeline runs successfully
- ✅ Monitoring is operational
- ✅ Team can access Jenkins

## Completion

- [ ] All checklist items completed
- [ ] Deployment documented
- [ ] Team trained
- [ ] Platform ready for production use

---

**Deployment Time**: ~90 minutes  
**Status**: Ready for deployment  
**Date**: _______________  
**Deployed By**: _______________
