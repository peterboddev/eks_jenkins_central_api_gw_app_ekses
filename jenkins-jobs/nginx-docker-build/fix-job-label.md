# Fix Job to Run on Agent Nodes

## Problem
The job is running on the Jenkins controller instead of agent nodes because it's not configured with the correct label.

## Solution

### Option 1: Via Jenkins UI (Recommended)

1. Go to Jenkins: http://localhost:8080
2. Click on the job: **nginx-docker-build**
3. Click **Configure** (left sidebar)
4. Scroll down to **General** section
5. Check the box: **☑ Restrict where this project can be run**
6. In the **Label Expression** field, enter: `jenkins-agent`
7. Click **Save**

### Option 2: Update Job XML

The job configuration needs this section added:

```xml
<assignedNode>jenkins-agent</assignedNode>
<canRoam>false</canRoam>
```

This should be added right after the `<description>` tag in the job XML.

## Verification

After making the change:

1. Run the job again
2. You should see in the console output:
   - Job will be **queued** (waiting for agent)
   - Cluster Autoscaler will provision a spot instance (2-5 minutes)
   - Agent pod will start with Docker capability
   - Workspace path will be: `/home/jenkins/agent/workspace/nginx-docker-build`
   - Docker commands will work

## What Happens Next

1. **Job queues**: No agents available yet
2. **Kubernetes plugin**: Creates agent pod request
3. **Cluster Autoscaler**: Detects pending pod, provisions spot instance node
4. **Agent pod starts**: On the new spot instance with Docker-in-Docker
5. **Job executes**: Builds and pushes nginx image to ECR
6. **Agent terminates**: After job completes
7. **Node scales down**: After ~10 minutes of idle time

## Current Status

- ❌ Job running on controller: `/var/jenkins_home/workspace/`
- ❌ Docker not available on controller
- ✅ Agent pod template configured with Docker
- ✅ Cluster Autoscaler ready to provision nodes

## Next Step

**Configure the job to use the `jenkins-agent` label** using Option 1 above.
