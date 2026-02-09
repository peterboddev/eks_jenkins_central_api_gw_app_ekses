# Next Steps - Jenkins EKS Cluster Deployment

## Current Status

✅ **Infrastructure Deployed Successfully**
- EKS cluster is ACTIVE
- Both node groups are ACTIVE
- All AWS resources created
- kubeconfig updated

❌ **kubectl Not Installed**
- Required for Kubernetes deployments
- Must be installed before proceeding

## Step 1: Install kubectl

### Windows Installation (Choose One Method)

#### Method 1: Chocolatey (Recommended)
```powershell
choco install kubernetes-cli
```

#### Method 2: Scoop
```powershell
scoop install kubectl
```

#### Method 3: Manual Installation
1. Download kubectl from: https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/
2. Add to PATH
3. Verify: `kubectl version --client`

## Step 2: Verify Cluster Access

After installing kubectl:

```bash
# Verify kubectl is installed
kubectl version --client

# Verify cluster access
kubectl get nodes

# Expected output: 3 nodes (1 controller, 2 agents)
# NAME                                         STATUS   ROLE    AGE   VERSION
# ip-10-0-1-xxx.us-west-2.compute.internal    Ready    <none>  Xm    v1.31.x
# ip-10-0-2-xxx.us-west-2.compute.internal    Ready    <none>  Xm    v1.31.x
# ip-10-0-1-yyy.us-west-2.compute.internal    Ready    <none>  Xm    v1.31.x

# Check namespaces
kubectl get namespaces
```

## Step 3: Deploy Kubernetes Components (In Order)

### 3.1 Deploy EFS CSI Driver

**Purpose**: Enables dynamic provisioning of EFS volumes for Jenkins persistent storage

```bash
cd k8s/efs-csi-driver
bash deploy.sh
```

**What it does**:
- Creates kube-system namespace resources
- Deploys EFS CSI controller (manages volume lifecycle)
- Deploys EFS CSI node DaemonSet (mounts volumes on nodes)
- Creates storage class `efs-sc` with EFS file system ID
- Configures IRSA for EFS permissions

**Verification**:
```bash
# Check CSI driver pods
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-efs-csi-driver

# Check storage class
kubectl get storageclass efs-sc
```

### 3.2 Deploy Cluster Autoscaler

**Purpose**: Automatically scales node groups based on pod resource requests

```bash
cd k8s/cluster-autoscaler
bash deploy.sh
```

**What it does**:
- Creates cluster-autoscaler namespace
- Deploys Cluster Autoscaler with IRSA
- Configures auto-discovery using cluster tags
- Sets scaling policies (min 2, max 10 for agents)

**Verification**:
```bash
# Check Cluster Autoscaler pod
kubectl get pods -n cluster-autoscaler

# Check logs
kubectl logs -n cluster-autoscaler deployment/cluster-autoscaler
```

### 3.3 Deploy Node Termination Handler

**Purpose**: Gracefully handles spot instance interruptions

```bash
cd k8s/node-termination-handler
bash deploy.sh
```

**What it does**:
- Creates node-termination-handler namespace
- Deploys DaemonSet on all nodes
- Monitors for spot interruption notices
- Drains nodes gracefully before termination

**Verification**:
```bash
# Check Node Termination Handler pods (should be 3, one per node)
kubectl get pods -n node-termination-handler

# Check logs
kubectl logs -n node-termination-handler daemonset/aws-node-termination-handler
```

### 3.4 Deploy Jenkins

**Purpose**: Deploys Jenkins controller with persistent storage and agent configuration

```bash
cd k8s/jenkins
bash deploy.sh
```

**What it does**:
- Creates jenkins namespace
- Creates service account with IRSA for AWS permissions
- Deploys Jenkins controller as StatefulSet with EFS PVC
- Creates service for Jenkins UI (port 8080) and JNLP (port 50000)
- Configures agent pod templates for dynamic agent provisioning

**Verification**:
```bash
# Check Jenkins pod
kubectl get pods -n jenkins

# Check PVC (should be Bound to EFS)
kubectl get pvc -n jenkins

# Check service
kubectl get svc -n jenkins
```

### 3.5 Deploy CloudWatch Container Insights (Optional)

**Purpose**: Enables detailed monitoring and logging for EKS cluster

```bash
cd k8s/monitoring
bash deploy.sh
```

**What it does**:
- Deploys CloudWatch agent for metrics
- Deploys Fluent Bit for log aggregation
- Sends metrics and logs to CloudWatch

**Verification**:
```bash
# Check CloudWatch agent
kubectl get pods -n amazon-cloudwatch

# Check Fluent Bit
kubectl get pods -n amazon-cloudwatch -l k8s-app=fluent-bit
```

## Step 4: Access Jenkins

### 4.1 Wait for Jenkins to be Ready

```bash
# Watch Jenkins pod status
kubectl get pods -n jenkins -w

# Wait for pod to be Running (may take 2-3 minutes)
# NAME                   READY   STATUS    RESTARTS   AGE
# jenkins-controller-0   1/1     Running   0          3m
```

### 4.2 Get Initial Admin Password

```bash
kubectl exec -n jenkins jenkins-controller-0 -- cat /var/jenkins_home/secrets/initialAdminPassword
```

### 4.3 Port Forward to Access Jenkins UI

```bash
# Forward port 8080 to localhost
kubectl port-forward -n jenkins svc/jenkins-controller 8080:8080
```

### 4.4 Access Jenkins

1. Open browser: http://localhost:8080
2. Enter the initial admin password from step 4.2
3. Install suggested plugins
4. Create admin user
5. Configure Jenkins URL

## Step 5: Configure Jenkins

### 5.1 Install Required Plugins

Navigate to: Manage Jenkins → Manage Plugins → Available

Install:
- Kubernetes Plugin (for dynamic agent provisioning)
- Pipeline Plugin (for Jenkins pipelines)
- Git Plugin (for source control)
- AWS SDK Plugin (for AWS integrations)

### 5.2 Configure Kubernetes Cloud

Navigate to: Manage Jenkins → Manage Nodes and Clouds → Configure Clouds

1. Add a new cloud → Kubernetes
2. Configure:
   - **Kubernetes URL**: https://kubernetes.default.svc.cluster.local
   - **Kubernetes Namespace**: jenkins
   - **Jenkins URL**: http://jenkins-controller.jenkins.svc.cluster.local:8080
   - **Jenkins Tunnel**: jenkins-controller.jenkins.svc.cluster.local:50000

3. Add Pod Template:
   - **Name**: jenkins-agent
   - **Namespace**: jenkins
   - **Labels**: jenkins-agent
   - **Node Selector**: workload-type=jenkins-agent
   - **Container Template**:
     - Name: jnlp
     - Docker Image: jenkins/inbound-agent:latest
     - Working Directory: /home/jenkins/agent

### 5.3 Test Agent Provisioning

Create a test pipeline:

```groovy
pipeline {
    agent {
        label 'jenkins-agent'
    }
    stages {
        stage('Test') {
            steps {
                sh 'echo "Hello from Jenkins agent on EKS!"'
                sh 'kubectl version --client'
            }
        }
    }
}
```

Run the pipeline and verify:
- Agent pod is created on spot instance node
- Pipeline executes successfully
- Agent pod is deleted after completion

## Step 6: Verify Complete System

### 6.1 Check All Components

```bash
# Check all pods across namespaces
kubectl get pods --all-namespaces

# Check node resource usage
kubectl top nodes

# Check pod resource usage
kubectl top pods --all-namespaces
```

### 6.2 Verify Cluster Autoscaler

```bash
# Create a deployment that requires more resources
kubectl create deployment test-scale --image=nginx --replicas=20

# Watch nodes scale up
kubectl get nodes -w

# Clean up
kubectl delete deployment test-scale
```

### 6.3 Verify EFS Persistence

```bash
# Create a test file in Jenkins
kubectl exec -n jenkins jenkins-controller-0 -- touch /var/jenkins_home/test-persistence.txt

# Delete the pod
kubectl delete pod -n jenkins jenkins-controller-0

# Wait for pod to restart
kubectl wait --for=condition=ready pod -n jenkins jenkins-controller-0 --timeout=300s

# Verify file still exists
kubectl exec -n jenkins jenkins-controller-0 -- ls -la /var/jenkins_home/test-persistence.txt
```

## Step 7: Production Readiness

### 7.1 Configure Backup Verification

```bash
# Check AWS Backup plan
aws backup list-backup-plans --region us-west-2

# Check backup jobs
aws backup list-backup-jobs --region us-west-2
```

### 7.2 Configure CloudWatch Alarms

```bash
# List alarms
aws cloudwatch describe-alarms --region us-west-2 --alarm-name-prefix jenkins-eks

# Subscribe to SNS topic for notifications
aws sns subscribe \
  --topic-arn arn:aws:sns:us-west-2:450683699755:jenkins-eks-alarms \
  --protocol email \
  --notification-endpoint your-email@example.com
```

### 7.3 Configure Access Control

1. **IAM Roles**: Review and restrict IAM permissions as needed
2. **Kubernetes RBAC**: Configure role-based access control
3. **Network Policies**: Implement network policies for pod-to-pod communication
4. **Security Groups**: Review and tighten security group rules

### 7.4 Configure Monitoring

1. **CloudWatch Dashboards**: Create custom dashboards
2. **Log Insights**: Set up queries for common issues
3. **Metrics**: Monitor key metrics (CPU, memory, disk, network)

## Troubleshooting

### kubectl not connecting

```bash
# Re-update kubeconfig
aws eks update-kubeconfig --region us-west-2 --name jenkins-eks-cluster

# Verify AWS credentials
aws sts get-caller-identity

# Check cluster status
aws eks describe-cluster --name jenkins-eks-cluster --region us-west-2
```

### Pods not starting

```bash
# Check pod events
kubectl describe pod <pod-name> -n <namespace>

# Check pod logs
kubectl logs <pod-name> -n <namespace>

# Check node conditions
kubectl describe node <node-name>
```

### EFS mount issues

```bash
# Check EFS CSI driver
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-efs-csi-driver

# Check EFS mount targets
aws efs describe-mount-targets --file-system-id fs-0351ee5e62a31c784 --region us-west-2

# Check security groups
aws ec2 describe-security-groups --region us-west-2 --filters "Name=group-name,Values=*efs*"
```

### Spot instance interruptions

```bash
# Check Node Termination Handler logs
kubectl logs -n node-termination-handler daemonset/aws-node-termination-handler

# Check for spot interruption events
kubectl get events --all-namespaces --field-selector reason=SpotInterruption
```

## Cost Optimization Tips

1. **Scale down when not in use**: Configure Cluster Autoscaler to scale to 0 agents
2. **Use spot instances**: Already configured for agents (up to 90% savings)
3. **Monitor unused resources**: Review CloudWatch metrics regularly
4. **Clean up old artifacts**: Configure S3 lifecycle policies (already done)
5. **Use EFS IA storage**: Already configured (transition after 30 days)

## Documentation

- [DEPLOYMENT_SUCCESS.md](DEPLOYMENT_SUCCESS.md) - Deployment summary
- [README.md](README.md) - Project overview
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Detailed deployment guide
- [k8s/README.md](k8s/README.md) - Kubernetes manifests documentation

## Support Resources

- **AWS EKS Documentation**: https://docs.aws.amazon.com/eks/
- **Kubernetes Documentation**: https://kubernetes.io/docs/
- **Jenkins Documentation**: https://www.jenkins.io/doc/
- **EFS CSI Driver**: https://github.com/kubernetes-sigs/aws-efs-csi-driver
- **Cluster Autoscaler**: https://github.com/kubernetes/autoscaler/tree/master/cluster-autoscaler

---

**Ready to proceed!** Install kubectl and follow the steps above to complete the deployment.
