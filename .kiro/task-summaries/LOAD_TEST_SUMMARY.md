# Jenkins EKS Load Test Summary

## Current Status

✅ **Jenkins Controller**: Running and accessible at http://localhost:8080
✅ **EFS Storage**: Working with persistent data
✅ **Kubernetes Integration**: Configured via JCasC
✅ **Agent Pod Template**: Configured to spawn on spot instances
⚠️ **Cluster Autoscaler**: Currently not working (configuration issue)

## Load Test Setup

I've created 5 load test job configurations in `jenkins-test-jobs/` directory:
- load-test-job-1.xml (CPU-intensive)
- load-test-job-2.xml (Memory/IO-intensive)
- load-test-job-3.xml (Parallel processing)
- load-test-job-4.xml (Computation)
- load-test-job-5.xml (Mixed workload)

## How to Test (Without Autoscaler)

Since the autoscaler isn't working yet, you can still test Jenkins agent pod creation:

### Step 1: Create a Simple Job in Jenkins UI

1. Go to http://localhost:8080
2. Complete initial setup if needed
3. Click "New Item"
4. Name: `load-test`
5. Type: "Freestyle project"
6. Configure:
   - Check "Execute concurrent builds if necessary"
   - Restrict where: `jenkins-agent`
   - Build step: Execute shell
   
```bash
#!/bin/bash
echo "=== Load Test Started ==="
echo "Node: $(hostname)"
echo "Pod: $HOSTNAME"
echo "Date: $(date)"

# CPU workload
for i in {1..300}; do
  if [ $((i % 30)) -eq 0 ]; then
    echo "Progress: $i/300"
  fi
  echo "scale=2000; 4*a(1)" | bc -l > /dev/null
  sleep 1
done

echo "=== Completed ==="
```

### Step 2: Trigger Multiple Builds

Click "Build Now" 5-10 times rapidly to queue multiple builds.

### Step 3: Monitor Agent Pods

```powershell
# Watch pods being created
.\kubectl.exe --kubeconfig=kubeconfig get pods -n jenkins -w

# Check agent pods specifically
.\kubectl.exe --kubeconfig=kubeconfig get pods -n jenkins -l jenkins=agent
```

## What You'll See

1. **Builds Queue**: Jenkins will queue the builds
2. **Agent Pods Created**: Kubernetes will create agent pods
3. **Pods Schedule**: Pods will schedule on existing spot instance nodes
4. **Builds Execute**: Jobs will run on the agent pods
5. **Pods Terminate**: After idle timeout (10 min), pods are deleted

## Current Cluster Capacity

- **Controller Node**: 1x t3.large (2 vCPU, 8GB RAM)
- **Agent Nodes**: 2x spot instances (m5/m5a large/xlarge)
- **Total Capacity**: Can run approximately 2-4 agent pods concurrently

## Manual Scaling (Alternative to Autoscaler)

If you want to test with more nodes, you can manually scale the ASG:

```powershell
# Get ASG name
aws autoscaling describe-auto-scaling-groups --region us-west-2 --query "AutoScalingGroups[?contains(Tags[?Key=='eks:nodegroup-name'].Value, 'agent')].AutoScalingGroupName" --output text

# Scale up (replace ASG_NAME)
aws autoscaling set-desired-capacity --auto-scaling-group-name <ASG_NAME> --desired-capacity 5 --region us-west-2

# Scale down
aws autoscaling set-desired-capacity --auto-scaling-group-name <ASG_NAME> --desired-capacity 2 --region us-west-2
```

## Troubleshooting Autoscaler

The autoscaler is crashing because it's just printing help and exiting. This suggests:
1. Command arguments aren't being parsed
2. Possible issue with the container image or entrypoint
3. May need to use a different autoscaler version or configuration method

To fix later, we can:
1. Try using Karpenter instead (modern alternative)
2. Use AWS-managed node groups with managed scaling
3. Debug the autoscaler configuration further

## Next Steps

1. Complete Jenkins initial setup
2. Create the load test job
3. Trigger multiple builds
4. Observe agent pods being created and scheduled
5. Monitor resource usage on existing nodes
6. (Optional) Manually scale ASG to test with more nodes

## Monitoring Commands

```powershell
# Watch all pods
.\kubectl.exe --kubeconfig=kubeconfig get pods -A -w

# Check node resource usage
.\kubectl.exe --kubeconfig=kubeconfig top nodes

# Check pod resource usage
.\kubectl.exe --kubeconfig=kubeconfig top pods -n jenkins

# View Jenkins logs
.\kubectl.exe --kubeconfig=kubeconfig logs -n jenkins jenkins-controller-0 -f

# Check ASG status
aws autoscaling describe-auto-scaling-groups --region us-west-2 --query "AutoScalingGroups[?contains(Tags[?Key=='eks:nodegroup-name'].Value, 'agent')].{Name:AutoScalingGroupName,Desired:DesiredCapacity,Current:Instances[].InstanceId|length(@),Min:MinSize,Max:MaxSize}"
```

## Success Criteria

Even without autoscaler, you can verify:
- ✅ Jenkins spawns agent pods dynamically
- ✅ Agent pods run on spot instance nodes
- ✅ Multiple builds run in parallel
- ✅ Pods are cleaned up after idle timeout
- ✅ Data persists on EFS across pod restarts
