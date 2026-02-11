# Jenkins Automated Deployment - Tasks

## 1. Prepare CDK Stack for Kubernetes Integration
- [ ] 1.1 Add js-yaml dependency to package.json
- [ ] 1.2 Import EKS cluster as L2 construct (eks.Cluster.fromClusterAttributes)
- [ ] 1.3 Verify cluster provisioning role has kubectl permissions

## 2. Load Kubernetes Manifests
- [ ] 2.1 Create helper function to load YAML files
- [ ] 2.2 Load namespace.yaml
- [ ] 2.3 Load plugins-configmap.yaml
- [ ] 2.4 Load jcasc-main-configmap.yaml
- [ ] 2.5 Load agent-pod-template-configmap.yaml
- [ ] 2.6 Load secrets-sync-job.yaml
- [ ] 2.7 Load pvc.yaml
- [ ] 2.8 Load serviceaccount.yaml
- [ ] 2.9 Load rbac.yaml
- [ ] 2.10 Load statefulset.yaml
- [ ] 2.11 Load service.yaml
- [ ] 2.12 Load ingress.yaml

## 3. Apply Manifests with CDK
- [ ] 3.1 Apply namespace manifest
- [ ] 3.2 Apply plugins ConfigMap (depends on namespace)
- [ ] 3.3 Apply JCasC ConfigMap (depends on namespace)
- [ ] 3.4 Apply agent pod template ConfigMap (depends on namespace)
- [ ] 3.5 Apply secrets sync job (depends on namespace)
- [ ] 3.6 Apply PVC (depends on namespace)
- [ ] 3.7 Apply ServiceAccount (depends on namespace)
- [ ] 3.8 Apply RBAC (depends on ServiceAccount)
- [ ] 3.9 Apply StatefulSet (depends on ConfigMaps, PVC, SA)
- [ ] 3.10 Apply Service (depends on StatefulSet)
- [ ] 3.11 Apply Ingress (depends on Service)

## 4. Configure Dependencies
- [ ] 4.1 Add dependency: ConfigMaps → namespace
- [ ] 4.2 Add dependency: secrets-sync-job → namespace
- [ ] 4.3 Add dependency: PVC → namespace
- [ ] 4.4 Add dependency: ServiceAccount → namespace
- [ ] 4.5 Add dependency: RBAC → ServiceAccount
- [ ] 4.6 Add dependency: StatefulSet → ConfigMaps
- [ ] 4.7 Add dependency: StatefulSet → PVC
- [ ] 4.8 Add dependency: StatefulSet → ServiceAccount
- [ ] 4.9 Add dependency: Service → StatefulSet
- [ ] 4.10 Add dependency: Ingress → Service

## 5. Test Deployment
- [ ] 5.1 Run cdk synth to verify synthesis
- [ ] 5.2 Run cdk deploy to test deployment
- [ ] 5.3 Verify manifests are applied to EKS cluster
- [ ] 5.4 Verify Jenkins pods are running
- [ ] 5.5 Verify seed job exists in Jenkins UI
- [ ] 5.6 Verify pipeline jobs are created

## 6. Clean Up Lambda Code (No Longer Needed)
- [ ] 6.1 Remove Lambda function code from CDK stack
- [ ] 6.2 Remove S3 bucket for manifests
- [ ] 6.3 Remove kubectl layer creation
- [ ] 6.4 Remove Lambda IAM role
- [ ] 6.5 Remove Custom Resource provider

## 7. Update Documentation
- [ ] 7.1 Update deployment guide with CDK-native workflow
- [ ] 7.2 Document troubleshooting steps
- [ ] 7.3 Document rollback procedures
- [ ] 7.4 Remove Lambda-specific documentation
