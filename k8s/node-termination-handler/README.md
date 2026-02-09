# AWS Node Termination Handler for Jenkins EKS Cluster

This directory contains Kubernetes manifests for deploying the AWS Node Termination Handler to gracefully handle spot instance interruptions and scheduled maintenance events.

## Overview

The AWS Node Termination Handler monitors for:
- **Spot instance interruption notices** (2-minute warning)
- **Spot instance rebalance recommendations**
- **Scheduled maintenance events**
- **Instance termination via AWS APIs**

When a termination event is detected, the handler:
1. Cordons the node to prevent new pods from scheduling
2. Drains the node by evicting all pods gracefully
3. Respects pod disruption budgets and termination grace periods
4. Allows pods to complete their shutdown procedures

## Requirements

- EKS cluster with spot instance node groups
- kubectl configured to access the EKS cluster
- Spot instance nodes labeled with `node-lifecycle=spot`

## Configuration

The Node Termination Handler is configured with the following settings:

- **Spot interruption draining**: Enabled (Requirement 7.2)
- **Scheduled event draining**: Enabled (Requirement 7.7)
- **Pod termination grace period**: 120 seconds (Requirement 7.2)
- **Node termination grace period**: 120 seconds (Requirement 7.2)
- **Runs on spot nodes only**: Uses node affinity (Requirement 4.4)

## Deployment

### Deploy

Run the deployment script:
```bash
cd k8s/node-termination-handler
chmod +x deploy.sh
./deploy.sh
```

### Verify Deployment

Check the DaemonSet status:
```bash
kubectl get daemonset aws-node-termination-handler -n kube-system
kubectl get pods -n kube-system -l app=aws-node-termination-handler
```

View logs:
```bash
kubectl logs -n kube-system -l app=aws-node-termination-handler --tail=50 -f
```

Check which nodes are running the handler:
```bash
kubectl get pods -n kube-system -l app=aws-node-termination-handler -o wide
```

## Uninstall

To remove the Node Termination Handler:
```bash
chmod +x uninstall.sh
./uninstall.sh
```

## Testing

### Simulate Spot Interruption

You can test the handler by manually cordoning and draining a node:

1. Get a spot instance node:
```bash
kubectl get nodes -l node-lifecycle=spot
```

2. Cordon the node:
```bash
kubectl cordon <node-name>
```

3. Drain the node:
```bash
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data --grace-period=120
```

4. Watch pods being rescheduled:
```bash
kubectl get pods -A -o wide --watch
```

5. Uncordon the node when done:
```bash
kubectl uncordon <node-name>
```

## Monitoring

### View Handler Events

Check Kubernetes events for termination activities:
```bash
kubectl get events -n kube-system --sort-by='.lastTimestamp' | grep termination
```

### View Handler Logs

Monitor handler logs for termination events:
```bash
kubectl logs -n kube-system -l app=aws-node-termination-handler --tail=100 -f
```

### Prometheus Metrics

The handler exposes Prometheus metrics on port 9092:
- `aws_node_termination_handler_actions_node` - Node actions taken
- `aws_node_termination_handler_events_total` - Total events processed
- `aws_node_termination_handler_spot_itn_received_total` - Spot interruption notices received

## Troubleshooting

### Handler not running on spot nodes

1. Check node labels:
```bash
kubectl get nodes --show-labels | grep node-lifecycle
```

2. Verify DaemonSet affinity:
```bash
kubectl get daemonset aws-node-termination-handler -n kube-system -o yaml | grep -A 10 affinity
```

### Pods not draining gracefully

1. Check pod termination grace period:
```bash
kubectl get pod <pod-name> -o yaml | grep terminationGracePeriodSeconds
```

2. Check handler configuration:
```bash
kubectl get daemonset aws-node-termination-handler -n kube-system -o yaml | grep -A 5 POD_TERMINATION_GRACE_PERIOD
```

3. View handler logs during drain:
```bash
kubectl logs -n kube-system -l app=aws-node-termination-handler --tail=100
```

## References

- [AWS Node Termination Handler GitHub](https://github.com/aws/aws-node-termination-handler)
- [EKS Best Practices - Spot Instances](https://aws.github.io/aws-eks-best-practices/cost_optimization/cost_opt_compute/#use-spot-instances)
- [EC2 Spot Instance Interruptions](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-interruptions.html)
