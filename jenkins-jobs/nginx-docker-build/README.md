# Nginx Docker Build Job for Jenkins

This Jenkins job builds a custom nginx Docker image and pushes it to Amazon ECR.

## Prerequisites

1. **ECR Repository Created**: ✅ `nginx-demo` repository created in us-west-2
2. **Jenkins Running**: ✅ Accessible at http://localhost:8080
3. **IAM Permissions**: ✅ Jenkins controller has ECR push permissions
4. **Docker in Jenkins Agent**: Required (will be configured)

## What This Job Does

1. Creates a custom nginx Docker image with:
   - Custom nginx configuration
   - Custom HTML page
   - Health check endpoint
2. Builds the Docker image
3. Authenticates with Amazon ECR
4. Pushes the image to ECR with two tags:
   - Build number (e.g., `1`, `2`, `3`)
   - `latest`

## ECR Repository Information

- **Repository Name**: `nginx-demo`
- **Repository URI**: `450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-demo`
- **Region**: `us-west-2`
- **Image Scanning**: Enabled (scan on push)

## Setup Instructions

### Option 1: Manual Setup (Recommended for First Time)

1. **Access Jenkins**:
   ```powershell
   # Ensure port-forward is running
   kubectl port-forward -n jenkins svc/jenkins 8080:8080
   ```
   Open: http://localhost:8080

2. **Create New Job**:
   - Click "New Item"
   - Enter name: `nginx-docker-build`
   - Select "Freestyle project"
   - Click "OK"

3. **Configure Job**:
   - **Description**: `Build nginx Docker image and push to Amazon ECR`
   
   - **General**:
     - Check "This project is parameterized"
     - Add String Parameter:
       - Name: `IMAGE_TAG`
       - Default Value: `${BUILD_NUMBER}`
       - Description: `Docker image tag`
   
   - **Build Environment**:
     - Check "Restrict where this project can be run"
     - Label Expression: `jenkins-agent`
   
   - **Build Steps**:
     - Add "Execute shell"
     - Copy the entire script from `job-config.xml` (the shell command section)
   
   - Click "Save"

4. **Build the Job**:
   - Click "Build Now"
   - Watch the console output
   - First build will trigger autoscaling (agent nodes will provision)

### Option 2: Import Job Configuration

```powershell
# Copy job XML to Jenkins
kubectl cp jenkins-jobs/nginx-docker-build/job-config.xml jenkins/jenkins-controller-0:/tmp/

# Import via Jenkins CLI (if configured)
# Or manually import through Jenkins UI: Manage Jenkins > Reload Configuration from Disk
```

## Job Configuration Details

### Environment Variables
- `AWS_REGION`: us-west-2
- `AWS_ACCOUNT_ID`: 450683699755
- `ECR_REPOSITORY`: nginx-demo
- `IMAGE_TAG`: Build number (parameterized)

### Build Steps
1. Create Dockerfile, nginx.conf, and index.html
2. Build Docker image locally
3. Authenticate with ECR using AWS CLI
4. Tag image for ECR
5. Push image to ECR (both versioned and latest tags)
6. Verify image in ECR
7. Cleanup local images

## Testing the Job

### First Build (Will Trigger Autoscaling)
```
1. Click "Build Now" in Jenkins
2. Job will be queued (no agents available)
3. Cluster Autoscaler detects pending pod
4. New spot instance provisioned (2-5 minutes)
5. Agent pod starts on new node
6. Build executes
7. Image pushed to ECR
```

### Monitor Autoscaling
```powershell
# Terminal 1: Watch nodes
kubectl get nodes -w

# Terminal 2: Watch pods
kubectl get pods -n jenkins -w

# Terminal 3: Watch autoscaler
kubectl logs -n kube-system -l app=cluster-autoscaler -f
```

## Verifying the Image in ECR

### Via AWS CLI
```powershell
# List images
aws ecr list-images --repository-name nginx-demo --region us-west-2

# Describe specific image
aws ecr describe-images \
    --repository-name nginx-demo \
    --image-ids imageTag=1 \
    --region us-west-2

# Get image details
aws ecr batch-get-image \
    --repository-name nginx-demo \
    --image-ids imageTag=latest \
    --region us-west-2
```

### Via AWS Console
https://console.aws.amazon.com/ecr/repositories/nginx-demo?region=us-west-2

## Running the Image Locally

```powershell
# Pull from ECR
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin 450683699755.dkr.ecr.us-west-2.amazonaws.com

docker pull 450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-demo:latest

# Run container
docker run -d -p 8080:80 --name nginx-demo 450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-demo:latest

# Test
curl http://localhost:8080
curl http://localhost:8080/health

# Cleanup
docker stop nginx-demo
docker rm nginx-demo
```

## Deploying to Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-demo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx-demo
  template:
    metadata:
      labels:
        app: nginx-demo
    spec:
      containers:
      - name: nginx
        image: 450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-demo:latest
        ports:
        - containerPort: 80
        livenessProbe:
          httpGet:
            path: /health
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-demo
spec:
  selector:
    app: nginx-demo
  ports:
  - port: 80
    targetPort: 80
  type: LoadBalancer
```

## Troubleshooting

### Build Fails: "Cannot connect to Docker daemon"
**Solution**: Ensure Docker is available in the Jenkins agent pod. The agent pod template needs Docker-in-Docker (DinD) or Docker socket mount.

### Build Fails: "Access Denied" to ECR
**Solution**: Verify Jenkins controller IAM role has ECR permissions:
```powershell
aws iam get-role-policy \
    --role-name jenkins-eks-controller-role \
    --policy-name JenkinsControllerPolicy \
    --region us-west-2
```

### Agent Pod Not Starting
**Solution**: Check autoscaler logs and node provisioning:
```powershell
kubectl logs -n kube-system -l app=cluster-autoscaler --tail=50
kubectl get nodes
kubectl describe pod -n jenkins -l jenkins=agent
```

### Image Push Slow
**Solution**: This is normal for first push. Subsequent pushes use layer caching and are much faster.

## Cost Considerations

- **ECR Storage**: $0.10 per GB-month
- **Data Transfer**: First 1 GB free, then $0.09 per GB
- **Image Scanning**: Free for first scan, $0.09 per image scan after
- **Typical Cost**: ~$0.01-0.05 per month for this demo

## Next Steps

1. ✅ Create Jenkins job
2. ✅ Run first build
3. ✅ Verify image in ECR
4. Deploy image to Kubernetes cluster
5. Set up CI/CD pipeline with Git integration
6. Add automated testing
7. Implement blue-green deployments

## Files in This Directory

- `Dockerfile`: Docker image definition
- `nginx.conf`: Custom nginx configuration
- `index.html`: Custom HTML page
- `job-config.xml`: Jenkins job configuration (XML format)
- `Jenkinsfile`: Pipeline as code (for Pipeline jobs)
- `README.md`: This file

## Additional Resources

- [Amazon ECR Documentation](https://docs.aws.amazon.com/ecr/)
- [Docker Documentation](https://docs.docker.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Jenkins Pipeline Documentation](https://www.jenkins.io/doc/book/pipeline/)
