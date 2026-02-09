# Agent Pod Template Configuration Updated

## What Changed

The Jenkins agent pod template has been updated to include Docker-in-Docker (DinD) capability:

1. **Added Docker sidecar container**: A `docker:24-dind` container runs alongside the Jenkins agent
2. **Configured Docker host**: The JNLP agent connects to Docker via `tcp://localhost:2375`
3. **Resource optimization**: Reduced JNLP agent resources to make room for Docker container
4. **Privileged mode**: Docker container runs in privileged mode (required for DinD)

## Configuration Applied

- ConfigMap updated: `jenkins-agent-pod-template`
- Jenkins controller restarted to reload configuration
- Port-forward still active on http://localhost:8080

## Next Steps

1. **Go to Jenkins UI**: http://localhost:8080
2. **Verify agent configuration**:
   - Go to: Manage Jenkins → Nodes → Configure Clouds → Kubernetes
   - Check that the "jenkins-agent" pod template shows the Docker container
3. **Run your nginx-docker-build job**:
   - The job should now queue and trigger autoscaling
   - An agent pod will be created with Docker capability
   - The build will execute on the agent node (not controller)
   - You should see the workspace path as `/home/jenkins/agent/workspace/`

## Expected Behavior

When you run the job:
1. Job queues (no agents available)
2. Kubernetes plugin creates agent pod with Docker
3. Cluster Autoscaler provisions a spot instance node (2-5 minutes)
4. Agent pod starts on the new node
5. Job executes with Docker available
6. After completion, agent pod terminates
7. After ~10 minutes of idle time, node scales down to zero

## Troubleshooting

If the job still runs on controller:
- Check that "Restrict where this project can be run" is set to `jenkins-agent`
- Verify the label matches in: Manage Jenkins → Nodes → Configure Clouds → Kubernetes → Pod Templates
- Check Jenkins logs: `kubectl logs -n jenkins jenkins-controller-0 -f`
