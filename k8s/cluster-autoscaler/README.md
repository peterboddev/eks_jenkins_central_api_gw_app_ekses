# Cluster Autoscaler for Jenkins EKS Cluster

This directory contains Kubernetes manifests for deploying the Cluster Autoscaler to automatically scale the EKS node groups based on pod resource requirements.

## Overview

The Cluster Autoscaler automatically adjusts the size of the Kubernetes cluster when:
- Pods fail to schedule due to insufficient resources (scales up)
- Nodes are underutilized for an extended period (scales down)

## Requirements

- EKS cluster with node groups tagged for auto-discovery
- IAM role for IRSA with Auto Scaling permissions
- kubectl configured to access the EKS cluster

## Configuration

The Cluster Autoscaler is configured with the following settings:

- **Auto-discovery**: Uses tags to discover node groups (`k8s.io/cluster-autoscaler/enabled` and `k8s.io/cluster-autoscaler/<cluster-name>`)
- **Scale down delay**: 10 minutes after node addition (Requirement 8.3)
- **Scale down utilization threshold**: 0.5 (50%) (Requirement 8.4)
- **IRSA**: Uses IAM Roles for Service Accounts for AWS API access (Requirement 8.1)

## Deployment

### Prerequisites

1. Get the cluster name:
```bash
export CLUSTER_NAME=$(aws eks list-clusters --query 'clusters[0]' --output text)
```

2. Get the Cluster Autoscaler IAM role ARN from CDK outputs:
```bash
export CLUSTER_AUTOSCALER_ROLE_ARN=$(aws cloudformation describe-stacks \
  --stack-name JenkinsEksStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ClusterAutoscalerRoleArn`].OutputValue' \
  --output text)
```

### Deploy

Run the deployment script:
```bash
cd k8s/cluster-autoscaler
chmod +x deploy.sh
CLUSTER_NAME=$CLUSTER_NAME CLUSTER_AUTOSCALER_ROLE_ARN=$CLUSTER_AUTOSCALER_ROLE_ARN ./deploy.sh
```

### Verify Deployment

Check the deployment status:
```bash
kubectl get deployment cluster-autoscaler -n kube-system
kubectl get pods -n kube-system -l app=cluster-autoscaler
```

View logs:
```bash
kubectl logs -n kube-system -l app=cluster-autoscaler --tail=50 -f
```

## Uninstall

To remove the Cluster Autoscaler:
```bash
chmod +x uninstall.sh
./uninstall.sh
```

## Troubleshooting

### Cluster Autoscaler not scaling up

1. Check if pods are in Pending state:
```bash
kubectl get pods --all-namespaces --field-selector=status.phase=Pending
```

2. Check Cluster Autoscaler logs:
```bash
kubectl logs -n kube-system -l app=cluster-autoscaler | grep -i "scale up"
```

3. Verify node group tags:
```bash
aws autoscaling describe-auto-scaling-groups \
  --query 'AutoScalingGroups[*].[AutoScalingGroupName,Tags]' \
  --output table
```

### Cluster Autoscaler not scaling down

1. Check node utilization:
```bash
kubectl top nodes
```

2. Check for pods preventing scale down:
```bash
kubectl logs -n kube-system -l app=cluster-autoscaler | grep -i "scale down"
```

3. Verify scale down is enabled:
```bash
kubectl get deployment cluster-autoscaler -n kube-system -o yaml | grep scale-down-enabled
```

## References

- [Cluster Autoscaler on AWS](https://github.com/kubernetes/autoscaler/blob/master/cluster-autoscaler/cloudprovider/aws/README.md)
- [EKS Best Practices - Cluster Autoscaler](https://aws.github.io/aws-eks-best-practices/cluster-autoscaling/)
