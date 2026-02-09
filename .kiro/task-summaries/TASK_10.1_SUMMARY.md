# Task 10.1 Summary: Jenkins Agent Pod Template Configuration

## Overview

Successfully created the Jenkins agent pod template configuration using Jenkins Configuration as Code (JCasC). The configuration is implemented as a Kubernetes ConfigMap that is automatically loaded by Jenkins on startup.

## Implementation Details

### Files Created/Modified

1. **k8s/jenkins/agent-pod-template-configmap.yaml** (NEW)
   - ConfigMap containing JCasC configuration for agent pod template
   - Defines the Kubernetes cloud configuration for Jenkins
   - Specifies agent pod template with all required settings

2. **k8s/jenkins/statefulset.yaml** (MODIFIED)
   - Added volume mount for the agent configuration ConfigMap
   - Added `CASC_JENKINS_CONFIG` environment variable to enable JCasC
   - Mounts ConfigMap to `/var/jenkins_home/casc_configs` (read-only)

3. **k8s/jenkins/kustomization.yaml** (MODIFIED)
   - Added `agent-pod-template-configmap.yaml` to resources list

4. **k8s/jenkins/README.md** (MODIFIED)
   - Documented the agent pod template configuration
   - Added architecture component for agent pod template
   - Updated manifest files section
   - Added requirements mapping for 3.8 and 4.6

## Agent Pod Template Configuration

### Container Specification

- **Image**: `jenkins/inbound-agent:latest`
- **Image Pull Policy**: `IfNotPresent`

### Resource Allocation

As specified in the requirements:

- **CPU Request**: 1 core
- **CPU Limit**: 2 cores
- **Memory Request**: 2Gi
- **Memory Limit**: 4Gi

### Node Affinity (Requirement 4.6)

The agent pod template includes node affinity to **prefer** spot instance nodes:

```yaml
nodeAffinity:
  preferredDuringSchedulingIgnoredDuringExecution:
  - weight: 100
    preference:
      matchExpressions:
      - key: node-lifecycle
        operator: In
        values:
        - spot
```

This configuration gives a weight of 100 to nodes with the label `node-lifecycle=spot`, meaning the Kubernetes scheduler will strongly prefer to place agent pods on spot instances, but can fall back to other nodes if spot instances are unavailable.

### Pod Anti-Affinity (Requirement 3.8)

The agent pod template includes pod anti-affinity to **avoid** scheduling on the same node as the Jenkins controller:

```yaml
podAntiAffinity:
  requiredDuringSchedulingIgnoredDuringExecution:
  - labelSelector:
      matchExpressions:
      - key: app
        operator: In
        values:
        - jenkins-controller
    topologyKey: kubernetes.io/hostname
```

This is a **required** anti-affinity rule, meaning agent pods will never be scheduled on the same node as the controller pod. This ensures:
- Agents don't require direct access to the controller's persistent volume
- Controller and agents are isolated for better resource management
- Spot instance interruptions don't affect the controller

### Environment Variables

- **JENKINS_URL**: `http://jenkins:8080` - URL for agent to connect to controller
- **JENKINS_TUNNEL**: `jenkins:50000` - JNLP tunnel endpoint for agent communication

### Workspace Configuration

- **Volume Type**: `emptyDir` - Ephemeral storage for agent workspace
- **Mount Path**: `/home/jenkins/agent`
- **Restart Policy**: `Never` - Agent pods are ephemeral and don't restart

### Jenkins Configuration as Code (JCasC)

The agent pod template is configured using JCasC, which provides:

1. **Declarative Configuration**: Agent configuration is defined in YAML
2. **Version Control**: Configuration can be tracked in Git
3. **Automatic Loading**: Jenkins loads the configuration on startup
4. **No Manual Setup**: No need to configure agents through the UI

The JCasC configuration includes:

- **Cloud Name**: `kubernetes`
- **Server URL**: `https://kubernetes.default` (in-cluster Kubernetes API)
- **Namespace**: `jenkins`
- **Jenkins URL**: `http://jenkins:8080`
- **Jenkins Tunnel**: `jenkins:50000`
- **Container Capacity**: 10 concurrent agents
- **Idle Minutes**: 10 minutes before agent pod is terminated
- **Service Account**: `jenkins-controller` (inherits IRSA permissions)

## Requirements Satisfied

### Requirement 3.8
✅ **Jenkins Agent pods SHALL communicate with Jenkins Controller via Jenkins Remoting protocol and SHALL NOT require direct access to the controller's persistent volume**

- Agents connect via JNLP on port 50000 (Jenkins Remoting protocol)
- Pod anti-affinity ensures agents don't schedule on controller nodes
- Agents use `emptyDir` for workspace (no shared volume with controller)

### Requirement 4.6
✅ **Jenkins Agent pods SHALL have node affinity rules to prefer spot instance nodes**

- Node affinity configured with weight 100 for `node-lifecycle=spot` label
- Uses `preferredDuringSchedulingIgnoredDuringExecution` for flexibility
- Allows fallback to on-demand nodes if spot instances unavailable

## Deployment

The agent pod template configuration is deployed automatically with the Jenkins controller:

```bash
# Deploy all Jenkins resources including agent configuration
kubectl apply -k k8s/jenkins/

# Verify ConfigMap is created
kubectl get configmap -n jenkins jenkins-agent-pod-template

# Verify Jenkins controller has mounted the configuration
kubectl describe pod -n jenkins -l app=jenkins-controller | grep casc_configs
```

## Verification

After Jenkins starts, verify the agent configuration is loaded:

1. **Check JCasC logs**:
   ```bash
   kubectl logs -n jenkins -l app=jenkins-controller | grep -i "configuration as code"
   ```

2. **Access Jenkins UI** and navigate to:
   - Manage Jenkins → Manage Nodes and Clouds → Configure Clouds
   - Verify "kubernetes" cloud is configured
   - Verify "jenkins-agent" pod template exists

3. **Test agent provisioning**:
   - Create a simple pipeline job
   - Use label `jenkins-agent` in the pipeline
   - Verify agent pod is created on a spot instance node

## Integration with Kubernetes Plugin

The configuration assumes the Jenkins Kubernetes plugin is installed. The plugin:

- Dynamically provisions agent pods based on the template
- Connects agents to the controller via JNLP
- Terminates agent pods after jobs complete (idle timeout)
- Handles pod failures and retries

## Next Steps

1. **Install Jenkins Kubernetes Plugin**: Required for dynamic agent provisioning
2. **Configure Jenkins Pipelines**: Use `agent { label 'jenkins-agent' }` in Jenkinsfiles
3. **Monitor Agent Provisioning**: Check pod creation and node placement
4. **Test Spot Interruption Handling**: Verify agents are rescheduled gracefully

## Notes

- The agent pod template uses `emptyDir` for workspace, which is ephemeral
- For persistent workspace data, consider using S3 or EFS (configured separately)
- The configuration can be extended to include multiple agent templates with different resource profiles
- Additional agent images can be added for specific build tools (e.g., Docker, Maven, Node.js)

## References

- **Design Document**: Section 4 (Jenkins Agents) and Section 9 (Data Models - PodTemplate)
- **Requirements**: 3.8 (Agent communication), 4.6 (Node affinity)
- **Jenkins Configuration as Code**: https://github.com/jenkinsci/configuration-as-code-plugin
- **Jenkins Kubernetes Plugin**: https://plugins.jenkins.io/kubernetes/
