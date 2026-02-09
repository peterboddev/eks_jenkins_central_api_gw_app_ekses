# CloudWatch Container Insights for Jenkins EKS Cluster

This directory contains Kubernetes manifests for deploying CloudWatch Container Insights to monitor the EKS cluster, collect logs, and provide observability.

## Overview

CloudWatch Container Insights provides:
- **Cluster-level metrics**: CPU, memory, disk, and network usage
- **Pod-level metrics**: Resource utilization per pod
- **Node-level metrics**: EC2 instance performance
- **Application logs**: Container logs from all pods
- **System logs**: Kubernetes control plane and node logs

## Requirements

- EKS cluster with worker nodes
- kubectl configured to access the EKS cluster
- IAM permissions for CloudWatch Logs and CloudWatch Metrics

## Components

### CloudWatch Agent
- Runs as a DaemonSet on all nodes
- Collects cluster and node metrics
- Sends metrics to CloudWatch

### Fluent Bit
- Runs as a DaemonSet on all nodes
- Collects container and system logs
- Sends logs to CloudWatch Logs

## Deployment

### Prerequisites

1. Get the cluster name:
```bash
export CLUSTER_NAME=$(aws eks list-clusters --query 'clusters[0]' --output text)
```

2. Set the AWS region:
```bash
export AWS_REGION=us-west-2
```

### Deploy

Run the deployment script:
```bash
cd k8s/monitoring
chmod +x deploy.sh
CLUSTER_NAME=$CLUSTER_NAME AWS_REGION=$AWS_REGION ./deploy.sh
```

### Verify Deployment

Check the DaemonSets:
```bash
kubectl get daemonset -n amazon-cloudwatch
```

Check the pods:
```bash
kubectl get pods -n amazon-cloudwatch
```

View CloudWatch agent logs:
```bash
kubectl logs -n amazon-cloudwatch -l name=cloudwatch-agent --tail=50
```

View Fluent Bit logs:
```bash
kubectl logs -n amazon-cloudwatch -l k8s-app=fluent-bit --tail=50
```

## Viewing Metrics and Logs

### CloudWatch Console

1. Open the CloudWatch Console:
   - https://console.aws.amazon.com/cloudwatch/

2. Navigate to Container Insights:
   - Click "Container Insights" in the left navigation
   - Select your cluster from the dropdown

3. View metrics:
   - **Performance monitoring**: CPU, memory, network, disk
   - **Resource list**: Pods, nodes, namespaces
   - **Alarms**: Configure alarms for critical metrics

### CloudWatch Logs

View logs in CloudWatch Logs Console:
- https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups

Log groups created:
- `/aws/containerinsights/<cluster-name>/application` - Application container logs
- `/aws/containerinsights/<cluster-name>/dataplane` - Kubernetes data plane logs (kubelet, kube-proxy, etc.)
- `/aws/containerinsights/<cluster-name>/host` - Host system logs

### CloudWatch Insights Queries

Example queries for CloudWatch Logs Insights:

**Find errors in Jenkins controller logs:**
```
fields @timestamp, @message
| filter kubernetes.namespace_name = "jenkins"
| filter kubernetes.pod_name like /jenkins-controller/
| filter @message like /ERROR|Exception|Failed/
| sort @timestamp desc
| limit 100
```

**Find Jenkins agent pod starts:**
```
fields @timestamp, kubernetes.pod_name, @message
| filter kubernetes.namespace_name = "jenkins"
| filter kubernetes.labels.jenkins = "agent"
| filter @message like /Started/
| sort @timestamp desc
| limit 50
```

**Monitor spot instance interruptions:**
```
fields @timestamp, kubernetes.host, @message
| filter @message like /spot.*interrupt|termination/
| sort @timestamp desc
| limit 20
```

## Troubleshooting

### CloudWatch agent not collecting metrics

1. Check agent logs:
```bash
kubectl logs -n amazon-cloudwatch -l name=cloudwatch-agent --tail=100
```

2. Verify IAM permissions:
```bash
kubectl describe serviceaccount cloudwatch-agent -n amazon-cloudwatch
```

3. Check agent configuration:
```bash
kubectl get configmap cwagentconfig -n amazon-cloudwatch -o yaml
```

### Fluent Bit not collecting logs

1. Check Fluent Bit logs:
```bash
kubectl logs -n amazon-cloudwatch -l k8s-app=fluent-bit --tail=100
```

2. Verify log groups exist:
```bash
aws logs describe-log-groups --log-group-name-prefix "/aws/containerinsights/$CLUSTER_NAME"
```

3. Check Fluent Bit configuration:
```bash
kubectl get configmap fluent-bit-config -n amazon-cloudwatch -o yaml
```

### High costs

Container Insights can generate significant CloudWatch costs. To reduce costs:

1. **Filter logs**: Modify Fluent Bit configuration to exclude verbose logs
2. **Adjust retention**: Set shorter retention periods for log groups
3. **Use metric filters**: Create metric filters instead of storing all logs
4. **Sample metrics**: Reduce metrics collection frequency

## Uninstall

To remove CloudWatch Container Insights:

```bash
kubectl delete namespace amazon-cloudwatch
```

## References

- [CloudWatch Container Insights Documentation](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html)
- [Container Insights for EKS](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/deploy-container-insights-EKS.html)
- [Fluent Bit for EKS](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-setup-logs-FluentBit.html)
