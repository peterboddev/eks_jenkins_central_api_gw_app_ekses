# Jenkins Automated Deployment - Design

## 1. Architecture Overview

The solution uses CDK's built-in Kubernetes integration (`cluster.addManifest()`) to apply manifests during deployment. This leverages CDK's kubectl provider which runs in the cluster's provisioning role, eliminating the need for custom Lambda functions.

```
CDK Deploy
    ↓
CloudFormation Stack
    ↓
CDK Kubectl Provider (built-in)
    ↓
EKS API Server (private endpoint)
    ↓
Jenkins Pods Created & Configured
```

## 2. Component Design

### 2.1 CDK EKS Cluster Integration

**Purpose**: Use CDK's built-in kubectl provider to apply manifests

**Implementation**:
- Import EKS cluster as `eks.Cluster` (not `CfnCluster`)
- Use `cluster.addManifest()` for each Kubernetes resource
- CDK automatically handles kubectl authentication via cluster provisioning role
- Manifests applied during CloudFormation stack deployment

**Benefits**:
- No custom Lambda code to maintain
- No S3 bucket for manifest storage
- No VPC configuration for Lambda
- Native CloudFormation integration
- Automatic rollback on failure

### 2.2 Manifest Application Methods

**Option A: Individual Manifests** (Recommended for this project)
```typescript
// Apply each manifest individually
cluster.addManifest('JenkinsNamespace', namespaceManifest);
cluster.addManifest('JenkinsPlugins', pluginsConfigMap);
cluster.addManifest('JenkinsCasc', cascConfigMap);
// ... etc
```

**Option B: Kustomize Output**
```typescript
// Render kustomize output and apply
const kustomizeOutput = execSync('kubectl kustomize k8s/jenkins').toString();
const manifests = yaml.loadAll(kustomizeOutput);
manifests.forEach((manifest, i) => {
  cluster.addManifest(`JenkinsManifest${i}`, manifest);
});
```

**Option C: Helm Chart** (Alternative approach)
```typescript
// Install Jenkins via Helm with JCasC values
cluster.addHelmChart('Jenkins', {
  chart: 'jenkins',
  repository: 'https://charts.jenkins.io',
  namespace: 'jenkins',
  values: {
    controller: {
      JCasC: {
        configScripts: { /* JCasC YAML */ }
      }
    }
  }
});
```

### 2.3 EKS Cluster Import Strategy

**Current State**: Stack uses `CfnCluster` (L1 construct)

**Required Change**: Import as `eks.Cluster` (L2 construct) to access `addManifest()`

**Implementation**:
```typescript
// Import existing CfnCluster as L2 Cluster
const cluster = eks.Cluster.fromClusterAttributes(this, 'ImportedCluster', {
  clusterName: eksCluster.name!,
  kubectlRoleArn: this.eksClusterRole.roleArn,
  vpc: this.vpc,
});
```

### 2.4 Manifest Loading

**Source**: YAML files in `k8s/jenkins/` directory

**Loading Method**:
```typescript
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

// Load YAML file
const manifestPath = path.join(__dirname, '../k8s/jenkins/namespace.yaml');
const manifestContent = fs.readFileSync(manifestPath, 'utf8');
const manifest = yaml.load(manifestContent);

// Apply to cluster
cluster.addManifest('JenkinsNamespace', manifest);
```

## 3. Manifest Application Order

Manifests are applied using CDK dependencies to ensure correct order:

```typescript
// 1. Namespace
const namespace = cluster.addManifest('JenkinsNamespace', namespaceYaml);

// 2. ConfigMaps (depend on namespace)
const pluginsConfigMap = cluster.addManifest('JenkinsPlugins', pluginsYaml);
pluginsConfigMap.node.addDependency(namespace);

const cascConfigMap = cluster.addManifest('JenkinsCasc', cascYaml);
cascConfigMap.node.addDependency(namespace);

// 3. Secrets sync job (depends on namespace)
const secretsJob = cluster.addManifest('JenkinsSecretsSync', secretsYaml);
secretsJob.node.addDependency(namespace);

// 4. PVC (depends on namespace)
const pvc = cluster.addManifest('JenkinsPvc', pvcYaml);
pvc.node.addDependency(namespace);

// 5. ServiceAccount and RBAC (depend on namespace)
const sa = cluster.addManifest('JenkinsSA', saYaml);
sa.node.addDependency(namespace);

const rbac = cluster.addManifest('JenkinsRbac', rbacYaml);
rbac.node.addDependency(sa);

// 6. StatefulSet (depends on ConfigMaps, PVC, SA)
const statefulSet = cluster.addManifest('JenkinsController', statefulSetYaml);
statefulSet.node.addDependency(pluginsConfigMap);
statefulSet.node.addDependency(cascConfigMap);
statefulSet.node.addDependency(pvc);
statefulSet.node.addDependency(sa);

// 7. Service (depends on StatefulSet)
const service = cluster.addManifest('JenkinsService', serviceYaml);
service.node.addDependency(statefulSet);

// 8. Ingress (depends on Service)
const ingress = cluster.addManifest('JenkinsIngress', ingressYaml);
ingress.node.addDependency(service);
```

## 4. Error Handling

### 4.1 CDK Synthesis Errors

**Scenario**: YAML parsing fails or manifest is invalid  
**Handling**:
- CDK synth fails with clear error message
- User fixes YAML and re-runs synth
- No CloudFormation deployment occurs

### 4.2 CloudFormation Deployment Errors

**Scenario**: Manifest application fails (invalid resource, API error)  
**Handling**:
- CloudFormation receives FAILED signal from kubectl provider
- Stack automatically rolls back to previous state
- User can inspect CloudFormation events for details
- kubectl provider logs available in CloudWatch

### 4.3 EKS API Errors

**Scenario**: Cannot reach EKS API (network, auth)  
**Handling**:
- CDK kubectl provider retries automatically
- If all retries fail, CloudFormation receives FAILED signal
- Stack rolls back

### 4.4 Dependency Errors

**Scenario**: Resource depends on non-existent resource  
**Handling**:
- CDK validates dependencies during synth
- CloudFormation applies resources in correct order
- If dependency fails, dependent resources are not created

## 5. Security Considerations

### 5.1 IAM Permissions

- CDK kubectl provider uses cluster provisioning role
- No additional IAM roles needed
- Cluster role already has necessary EKS permissions
- No write permissions to external services

### 5.2 Network Security

- kubectl provider runs in cluster's VPC
- EKS API accessible via private endpoint only
- No public exposure
- No NAT Gateway required for kubectl provider

### 5.3 Secrets Management

- Admin password stored in Secrets Manager
- GitHub webhook secret stored in Secrets Manager
- Secrets synced to K8s by secrets-sync-job
- Never logged or exposed in CDK code

## 6. Idempotency

All operations are idempotent:
- CDK kubectl provider uses `kubectl apply` (creates or updates)
- ConfigMaps can be updated without pod restart (JCasC auto-reload)
- StatefulSet updates trigger rolling restart
- Safe to re-run `cdk deploy` on stack update
- CloudFormation tracks resource state

## 7. Testing Strategy

### 7.1 Unit Tests

- Test kubeconfig generation
- Test manifest download from S3
- Test kubectl command construction
- Test error handling

### 7.2 Integration Tests

- Deploy stack to test environment
- Verify Jenkins pods are running
- Verify seed job exists
- Verify pipeline jobs are created
- Verify webhook configuration

### 7.3 Failure Tests

- Test Lambda timeout handling
- Test kubectl failure handling
- Test S3 access denied
- Test EKS API unreachable

## 8. Monitoring

### 8.1 CloudWatch Logs

- CDK kubectl provider execution logs
- kubectl output (stdout/stderr)
- Error traces

### 8.2 CloudFormation Events

- Resource creation/update status
- Failure reasons
- Rollback events

### 8.3 EKS Cluster Logs

- API server logs
- Audit logs
- Controller manager logs

## 9. Rollback Strategy

### 9.1 Stack Rollback

- CloudFormation automatically rolls back on failure
- Previous manifest versions are restored
- kubectl provider handles cleanup

### 9.2 Manual Rollback

- User can manually delete Jenkins namespace
- User can manually apply previous manifests
- User can update stack with previous CDK code

## 10. Alternative Approaches Considered

### 10.1 Lambda Custom Resource (Rejected)

**Pros**: Full control over manifest application logic

**Cons**:
- Additional Lambda code to maintain
- Requires S3 bucket for manifest storage
- Requires VPC configuration for Lambda
- Requires kubectl layer packaging
- More complex error handling
- Higher operational overhead

**Decision**: Rejected in favor of CDK native integration

### 10.2 Helm Chart (Alternative)

**Pros**: 
- Industry standard for Jenkins deployment
- Built-in JCasC support
- Easier upgrades

**Cons**:
- Less control over individual resources
- Requires Helm repository configuration
- May include unnecessary components

**Decision**: Valid alternative, but raw manifests provide more control for this project

### 10.3 GitOps (Argo CD / Flux) (Future Enhancement)

**Pros**:
- Continuous reconciliation
- Git as source of truth
- Automatic drift detection

**Cons**:
- Additional infrastructure to manage
- More complex initial setup
- Overkill for single-cluster deployment

**Decision**: Consider for future multi-cluster deployments
