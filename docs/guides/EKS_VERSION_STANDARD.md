# EKS Kubernetes Version Standard

## Current Standard Version

**Kubernetes Version**: 1.32

All EKS clusters in this project MUST use Kubernetes version 1.32.

## Clusters

### Jenkins Cluster
- **Cluster Name**: jenkins-eks-cluster
- **Current Version**: 1.32 ✅
- **Status**: Compliant with standard
- **File**: `lib/eks_jenkins-stack.ts`
- **Line**: `version: '1.32'`

### nginx API Cluster
- **Cluster Name**: nginx-api-cluster
- **Current Version**: 1.32 ✅
- **Status**: Compliant with standard
- **File**: `lib/eks_nginx_api-stack.ts`
- **Line**: `version: eks.KubernetesVersion.V1_32`

## Creating New Clusters

When creating new EKS clusters, always use Kubernetes version 1.32:

### Using CDK L1 Constructs (CfnCluster)
```typescript
const cluster = new cdk.aws_eks.CfnCluster(this, 'MyCluster', {
  name: 'my-cluster',
  version: '1.32',  // Always use 1.32
  // ... other properties
});
```

### Using CDK L2 Constructs (Cluster)
```typescript
const cluster = new eks.Cluster(this, 'MyCluster', {
  clusterName: 'my-cluster',
  version: eks.KubernetesVersion.V1_32,  // Always use V1_32
  // ... other properties
});
```

## Version Upgrade Process

EKS only supports upgrading one minor version at a time. When upgrading to a new Kubernetes version:

1. **Plan incremental upgrades**: If jumping multiple versions (e.g., 1.29 → 1.32), you must upgrade incrementally:
   - 1.29 → 1.30
   - 1.30 → 1.31
   - 1.31 → 1.32

2. **Update CDK stack code** with the target version

3. **Build and deploy**:
   ```bash
   npm run build
   npx cdk deploy <StackName> --require-approval never
   ```

4. **Verify the upgrade**:
   ```bash
   aws eks describe-cluster --name <cluster-name> --region us-west-2 --query 'cluster.version'
   ```

5. **Repeat for next version** if doing incremental upgrades

6. **Update add-ons** after control plane upgrade:
   - CoreDNS
   - kube-proxy
   - vpc-cni
   - AWS Load Balancer Controller
   - Karpenter (if applicable)
   - Cluster Autoscaler (if applicable)

7. **Update node groups** to match cluster version

8. **Update documentation** in access_details and other docs

## Version Compatibility

### Karpenter
- Karpenter version must be compatible with Kubernetes 1.32
- Check compatibility matrix: https://karpenter.sh/docs/upgrading/compatibility/

### AWS Load Balancer Controller
- ALB Controller version must support Kubernetes 1.32
- Check compatibility: https://kubernetes-sigs.github.io/aws-load-balancer-controller/

### Cluster Autoscaler
- Cluster Autoscaler version must match Kubernetes version
- Use version 1.32.x for Kubernetes 1.32

## CDK Context Configuration

The `cdk.context.json` file sets the default Kubernetes version:

```json
{
  "eks:default-kubernetes-version": "1.32",
  "eks:cluster-version": "1.32"
}
```

This ensures all new clusters default to version 1.32 unless explicitly overridden.

## Verification

To verify cluster versions:

```bash
# Check Jenkins cluster
aws eks describe-cluster --name jenkins-eks-cluster --region us-west-2 --query 'cluster.version'

# Check nginx API cluster
aws eks describe-cluster --name nginx-api-cluster --region us-west-2 --query 'cluster.version'
```

Expected output: `"1.32"`

## References

- [EKS Kubernetes Versions](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html)
- [EKS Version Support Policy](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions-standard.html)
- [CDK EKS Module](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_eks-readme.html)

## Last Updated

February 9, 2026

**Upgrade History**:
- **February 9, 2026**: Both clusters upgraded to 1.32
  - nginx-api-cluster: 1.29 → 1.30 → 1.31 → 1.32 (incremental upgrade required)
  - jenkins-eks-cluster: 1.31 → 1.32

**Note**: This standard should be reviewed and updated whenever AWS releases new Kubernetes versions or when upgrading clusters.
