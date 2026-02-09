# ALB Setup Complete

## Summary
Successfully created Application Load Balancer (ALB) to replace Classic ELB for Jenkins access.

## ALB Details
- **ALB Name**: jenkins-alb
- **DNS Name**: jenkins-alb-2054832393.us-west-2.elb.amazonaws.com
- **Port**: 80 (HTTP)
- **Status**: Active
- **Subnets**: 
  - subnet-058e81b188acbfd25 (us-west-2a, public)
  - subnet-0f4c8c1cf98451d1f (us-west-2b, public)
- **Security Group**: sg-03d827527aac829ee (allows port 80 and 8080 from 0.0.0.0/0)

## Target Group Details
- **Name**: jenkins-tg
- **Protocol**: HTTP
- **Port**: 32371 (NodePort)
- **Health Check Path**: /login
- **Health Check Interval**: 30 seconds
- **Target**: i-062a4e7ba6bf45d3a (Jenkins controller node)
- **Target Health**: Healthy ✅

## Jenkins Service Configuration
- **Type**: NodePort
- **ClusterIP**: 172.20.24.113
- **Port**: 8080
- **NodePort**: 32371
- **Endpoints**: 10.0.1.132:8080

## Access Jenkins
```
http://jenkins-alb-2054832393.us-west-2.elb.amazonaws.com/
```

**Credentials:**
- Username: `admin`
- Password: `g3YVie94Ei61bVdGVHawnV`

## Configuration Updates
1. Updated `jenkins-helm-values.yaml`:
   - Set `serviceType: NodePort`
   - Set `nodePort: 32371`
   - Configured `jenkinsUrl` to ALB DNS
   - Added JCasC configuration for Jenkins URL

2. Security group sg-03d827527aac829ee:
   - Added ingress rule for port 80 (HTTP) from 0.0.0.0/0
   - Existing rule for port 8080 from 0.0.0.0/0
   - Allows traffic to NodePort range 30000-32767 to node security group

## Next Steps

### 1. Create nginx-docker-build Job
The job configuration is ready at `jenkins-jobs/nginx-docker-build/job-config.xml`.

**Option A: Create via Jenkins UI (Recommended)**
1. Access Jenkins at http://jenkins-alb-2054832393.us-west-2.elb.amazonaws.com/
2. Click "New Item"
3. Enter name: `nginx-docker-build`
4. Select "Freestyle project"
5. Configure:
   - Restrict where this project can be run: `jenkins-agent`
   - Add parameter: `IMAGE_TAG` (String, default: `${BUILD_NUMBER}`)
   - Add build step: Execute shell
   - Copy content from `jenkins-jobs/nginx-docker-build/job-config.xml` (the shell command section)
6. Save

**Option B: Use Jenkins CLI**
```powershell
# Download Jenkins CLI
Invoke-WebRequest -Uri "http://jenkins-alb-2054832393.us-west-2.elb.amazonaws.com/jnlpJars/jenkins-cli.jar" -OutFile "jenkins-cli.jar"

# Create job (requires Java)
Get-Content jenkins-jobs/nginx-docker-build/job-config.xml | java -jar jenkins-cli.jar -s http://jenkins-alb-2054832393.us-west-2.elb.amazonaws.com/ -auth admin:g3YVie94Ei61bVdGVHawnV create-job nginx-docker-build
```

### 2. Trigger Build
Once the job is created, trigger it using:
```powershell
.\trigger-nginx-build.ps1
```

Or manually via Jenkins UI:
1. Go to http://jenkins-alb-2054832393.us-west-2.elb.amazonaws.com/job/nginx-docker-build/
2. Click "Build with Parameters"
3. Enter IMAGE_TAG (or use default)
4. Click "Build"

### 3. Verify Autoscaling
When the build runs:
1. Jenkins will provision a new agent pod with Docker-in-Docker
2. The agent pod will be scheduled on a new node (if no agent nodes exist)
3. Cluster Autoscaler will provision a new EC2 instance from the agent node group
4. The build will execute on the new agent
5. After completion, the agent pod will be terminated
6. After 10 minutes of inactivity, the node will be scaled down

Monitor autoscaling:
```powershell
# Watch nodes
.\kubectl get nodes -w

# Watch pods
.\kubectl get pods -n jenkins -w

# Check Cluster Autoscaler logs
.\kubectl logs -n kube-system -l app=cluster-autoscaler --tail=50 -f
```

## Troubleshooting

### CSRF Token Issues
If you encounter "No valid crumb was included in the request" errors when using the API:
1. The Jenkins URL configuration has been updated in JCasC
2. Access Jenkins via the ALB URL (not localhost or port-forward)
3. For API calls, always get a fresh crumb before each request

### Target Health Check Failures
If the target becomes unhealthy:
1. Verify Jenkins service is NodePort: `.\kubectl get svc jenkins -n jenkins`
2. Check Jenkins pod is running: `.\kubectl get pods -n jenkins`
3. Test Jenkins internally: `.\kubectl exec jenkins-0 -n jenkins -c jenkins -- curl -s http://localhost:8080/login`
4. Check target health: `aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:us-west-2:450683699755:targetgroup/jenkins-tg/03c801b1c0e562b0 --region us-west-2`

### Service Reverts to ClusterIP
If Helm upgrade reverts the service to ClusterIP:
1. The `jenkins-helm-values.yaml` has been updated with `serviceType: NodePort`
2. Future Helm upgrades will maintain NodePort configuration
3. If needed, manually patch: `.\kubectl patch svc jenkins -n jenkins -p '{\"spec\":{\"type\":\"NodePort\",\"ports\":[{\"name\":\"http\",\"port\":8080,\"targetPort\":8080,\"nodePort\":32371}]}}'`

## Files Created/Updated
- `jenkins-helm-values.yaml` - Updated with NodePort and Jenkins URL configuration
- `create-jenkins-job.ps1` - Script to create job via API (CSRF issues)
- `create-jenkins-job-v2.ps1` - Alternative script with session handling (CSRF issues)
- `trigger-nginx-build.ps1` - Script to trigger build once job is created
- `ALB_SETUP_COMPLETE.md` - This document

## AWS Resources Created
- Application Load Balancer: `jenkins-alb` (arn:aws:elasticloadbalancing:us-west-2:450683699755:loadbalancer/app/jenkins-alb/f51aa5a65655deda)
- Target Group: `jenkins-tg` (arn:aws:elasticloadbalancing:us-west-2:450683699755:targetgroup/jenkins-tg/03c801b1c0e562b0)
- Listener: Port 80 HTTP (arn:aws:elasticloadbalancing:us-west-2:450683699755:listener/app/jenkins-alb/f51aa5a65655deda/e8e5c3ea39ba1a71)
- Security Group Rule: sg-03d827527aac829ee ingress port 80 from 0.0.0.0/0

## Cost Considerations
- ALB: ~$16-20/month (base) + data processing charges
- Target Group: No additional charge
- Data transfer: Standard AWS data transfer rates apply

## Cleanup (if needed)
To remove the ALB:
```powershell
# Delete listener
aws elbv2 delete-listener --listener-arn arn:aws:elasticloadbalancing:us-west-2:450683699755:listener/app/jenkins-alb/f51aa5a65655deda/e8e5c3ea39ba1a71 --region us-west-2

# Deregister targets
aws elbv2 deregister-targets --target-group-arn arn:aws:elasticloadbalancing:us-west-2:450683699755:targetgroup/jenkins-tg/03c801b1c0e562b0 --targets Id=i-062a4e7ba6bf45d3a --region us-west-2

# Delete target group
aws elbv2 delete-target-group --target-group-arn arn:aws:elasticloadbalancing:us-west-2:450683699755:targetgroup/jenkins-tg/03c801b1c0e562b0 --region us-west-2

# Delete load balancer
aws elbv2 delete-load-balancer --load-balancer-arn arn:aws:elasticloadbalancing:us-west-2:450683699755:loadbalancer/app/jenkins-alb/f51aa5a65655deda --region us-west-2
```
