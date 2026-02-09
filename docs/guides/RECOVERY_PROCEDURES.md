# Jenkins EKS Cluster - Recovery Procedures

## Table of Contents
1. [Backup Strategy](#backup-strategy)
2. [EFS Backup and Restore](#efs-backup-and-restore)
3. [Disaster Recovery Scenarios](#disaster-recovery-scenarios)
4. [Recovery Testing](#recovery-testing)
5. [Emergency Contacts](#emergency-contacts)

## Backup Strategy

### Automated Backups

#### EFS Backups (AWS Backup)
- **Schedule**: Daily at 2:00 AM UTC
- **Retention**: 30 days
- **Backup Vault**: `jenkins-eks-efs-backup-vault`
- **Recovery Point Objective (RPO)**: 24 hours
- **Recovery Time Objective (RTO)**: 2-4 hours

#### S3 Versioning
- **Enabled**: Yes
- **Lifecycle**: Transition to Intelligent-Tiering after 30 days
- **Retention**: 90 days
- **Bucket**: `jenkins-ACCOUNT-ID-us-west-2-artifacts`

### Manual Backup Procedures

#### Create On-Demand EFS Backup
```powershell
# Get EFS file system ID
$efsId = aws efs describe-file-systems `
    --region us-west-2 `
    --query 'FileSystems[?Name==`jenkins-eks-efs`].FileSystemId' `
    --output text

# Create backup
aws backup start-backup-job `
    --backup-vault-name jenkins-eks-efs-backup-vault `
    --resource-arn "arn:aws:elasticfilesystem:us-west-2:ACCOUNT-ID:file-system/$efsId" `
    --iam-role-arn "arn:aws:iam::ACCOUNT-ID:role/service-role/AWSBackupDefaultServiceRole" `
    --region us-west-2

# Monitor backup job
aws backup list-backup-jobs `
    --by-resource-arn "arn:aws:elasticfilesystem:us-west-2:ACCOUNT-ID:file-system/$efsId" `
    --region us-west-2
```

#### Export Jenkins Configuration
```powershell
# Create temporary pod with EFS mount
kubectl run backup-pod `
    --image=busybox `
    --restart=Never `
    --overrides='{
      "spec": {
        "containers": [{
          "name": "backup",
          "image": "busybox",
          "command": ["sleep", "3600"],
          "volumeMounts": [{
            "name": "jenkins-home",
            "mountPath": "/backup"
          }]
        }],
        "volumes": [{
          "name": "jenkins-home",
          "persistentVolumeClaim": {
            "claimName": "jenkins-home-jenkins-controller-0"
          }
        }]
      }
    }' `
    -n jenkins

# Copy Jenkins home to local
kubectl cp jenkins/backup-pod:/backup ./jenkins-backup-$(Get-Date -Format 'yyyy-MM-dd')

# Cleanup
kubectl delete pod backup-pod -n jenkins
```

## EFS Backup and Restore

### List Available Backups
```powershell
# List recovery points
aws backup list-recovery-points-by-backup-vault `
    --backup-vault-name jenkins-eks-efs-backup-vault `
    --region us-west-2 `
    --query 'RecoveryPoints[*].[RecoveryPointArn,CreationDate,Status]' `
    --output table
```

### Restore from EFS Backup

#### Option 1: Restore to New EFS File System
```powershell
# Get recovery point ARN
$recoveryPointArn = aws backup list-recovery-points-by-backup-vault `
    --backup-vault-name jenkins-eks-efs-backup-vault `
    --region us-west-2 `
    --query 'RecoveryPoints[0].RecoveryPointArn' `
    --output text

# Start restore job
aws backup start-restore-job `
    --recovery-point-arn $recoveryPointArn `
    --iam-role-arn "arn:aws:iam::ACCOUNT-ID:role/service-role/AWSBackupDefaultServiceRole" `
    --metadata '{
      "file-system-id": "fs-NEW-ID",
      "Encrypted": "true",
      "PerformanceMode": "generalPurpose",
      "newFileSystem": "true"
    }' `
    --region us-west-2

# Monitor restore job
aws backup describe-restore-job `
    --restore-job-id RESTORE-JOB-ID `
    --region us-west-2
```

#### Option 2: Restore to Existing EFS (In-Place)
```powershell
# Scale down Jenkins controller
kubectl scale statefulset jenkins-controller --replicas=0 -n jenkins

# Wait for pod termination
kubectl wait --for=delete pod/jenkins-controller-0 -n jenkins --timeout=300s

# Restore from backup (overwrites existing data)
aws backup start-restore-job `
    --recovery-point-arn $recoveryPointArn `
    --iam-role-arn "arn:aws:iam::ACCOUNT-ID:role/service-role/AWSBackupDefaultServiceRole" `
    --metadata '{
      "file-system-id": "EXISTING-FS-ID",
      "newFileSystem": "false"
    }' `
    --region us-west-2

# Wait for restore completion (check status)
aws backup describe-restore-job `
    --restore-job-id RESTORE-JOB-ID `
    --region us-west-2 `
    --query 'Status'

# Scale up Jenkins controller
kubectl scale statefulset jenkins-controller --replicas=1 -n jenkins

# Verify Jenkins is running
kubectl get pods -n jenkins
kubectl logs jenkins-controller-0 -n jenkins --tail=50
```

### Update EFS File System ID
If restored to a new EFS file system:
```powershell
# Update storage class with new EFS ID
kubectl edit storageclass efs-sc

# Update the fileSystemId parameter
# Save and exit

# Delete and recreate PVC
kubectl delete pvc jenkins-home-jenkins-controller-0 -n jenkins
kubectl apply -f k8s/jenkins/statefulset.yaml
```

## Disaster Recovery Scenarios

### Scenario 1: Jenkins Controller Pod Failure

**Symptoms:**
- Jenkins pod in CrashLoopBackOff or Error state
- Jenkins UI not accessible

**Recovery Steps:**
```powershell
# Check pod status
kubectl get pods -n jenkins
kubectl describe pod jenkins-controller-0 -n jenkins

# Check logs
kubectl logs jenkins-controller-0 -n jenkins --previous

# Delete pod (StatefulSet will recreate)
kubectl delete pod jenkins-controller-0 -n jenkins

# Monitor recreation
kubectl get pods -n jenkins -w

# Verify data persistence
kubectl exec -n jenkins jenkins-controller-0 -- ls -la /var/jenkins_home
```

**Expected Recovery Time:** 2-5 minutes

### Scenario 2: EFS File System Corruption

**Symptoms:**
- Jenkins unable to read/write files
- I/O errors in logs
- PVC mount failures

**Recovery Steps:**
```powershell
# 1. Scale down Jenkins
kubectl scale statefulset jenkins-controller --replicas=0 -n jenkins

# 2. Restore from latest backup (see EFS Restore section above)

# 3. Verify EFS mount targets
aws efs describe-mount-targets `
    --file-system-id FS-ID `
    --region us-west-2

# 4. Scale up Jenkins
kubectl scale statefulset jenkins-controller --replicas=1 -n jenkins

# 5. Verify recovery
kubectl logs jenkins-controller-0 -n jenkins -f
```

**Expected Recovery Time:** 2-4 hours (depending on backup size)

### Scenario 3: Complete Cluster Failure

**Symptoms:**
- EKS cluster unreachable
- All nodes down
- Control plane unavailable

**Recovery Steps:**

#### Option A: Rebuild Cluster (Recommended)
```powershell
# 1. Deploy new cluster
cdk deploy

# 2. Configure kubectl
aws eks update-kubeconfig `
    --name jenkins-eks-cluster `
    --region us-west-2

# 3. Deploy Kubernetes components
cd k8s/efs-csi-driver && .\deploy.sh
cd k8s/cluster-autoscaler && .\deploy.sh
cd k8s/node-termination-handler && .\deploy.sh

# 4. Restore Jenkins from backup
# Update storage class with restored EFS ID
kubectl apply -f k8s/jenkins/

# 5. Verify Jenkins data
kubectl exec -n jenkins jenkins-controller-0 -- ls -la /var/jenkins_home
```

#### Option B: Restore from Complete Backup
```powershell
# 1. Restore EFS from backup (see above)

# 2. Deploy infrastructure
cdk deploy

# 3. Deploy Kubernetes components
# (same as Option A steps 2-5)
```

**Expected Recovery Time:** 4-6 hours

### Scenario 4: Availability Zone Failure

**Symptoms:**
- Nodes in one AZ unavailable
- Pods stuck in Pending state
- Reduced cluster capacity

**Recovery Steps:**
```powershell
# 1. Verify cluster status
kubectl get nodes
kubectl get pods --all-namespaces -o wide

# 2. Check node health
kubectl describe nodes

# 3. Cluster Autoscaler will automatically provision new nodes in healthy AZ

# 4. Monitor autoscaler
kubectl logs -n kube-system -l app=cluster-autoscaler -f

# 5. Verify pod rescheduling
kubectl get pods -n jenkins -o wide
```

**Expected Recovery Time:** 5-10 minutes (automatic)

### Scenario 5: Spot Instance Mass Interruption

**Symptoms:**
- Multiple agent nodes terminating simultaneously
- Jenkins jobs failing
- Build queue growing

**Recovery Steps:**
```powershell
# 1. Check spot interruptions
kubectl logs -n kube-system -l app=aws-node-termination-handler

# 2. Monitor autoscaler response
kubectl logs -n kube-system -l app=cluster-autoscaler -f

# 3. Check node provisioning
kubectl get nodes -w

# 4. Verify job recovery
# Jobs should automatically reschedule on new nodes

# 5. If autoscaler not responding, manually scale
aws eks update-nodegroup-config `
    --cluster-name jenkins-eks-cluster `
    --nodegroup-name jenkins-agent-nodegroup `
    --scaling-config desiredSize=5 `
    --region us-west-2
```

**Expected Recovery Time:** 5-10 minutes

### Scenario 6: S3 Bucket Data Loss

**Symptoms:**
- Build artifacts missing
- Job workspace data unavailable

**Recovery Steps:**
```powershell
# 1. Check S3 versioning
aws s3api list-object-versions `
    --bucket jenkins-ACCOUNT-ID-us-west-2-artifacts `
    --prefix "path/to/artifact"

# 2. Restore specific version
aws s3api get-object `
    --bucket jenkins-ACCOUNT-ID-us-west-2-artifacts `
    --key "path/to/artifact" `
    --version-id VERSION-ID `
    ./restored-artifact

# 3. Upload restored artifact
aws s3 cp ./restored-artifact `
    s3://jenkins-ACCOUNT-ID-us-west-2-artifacts/path/to/artifact
```

**Expected Recovery Time:** Minutes to hours (depending on data size)

## Recovery Testing

### Monthly Recovery Drill
Perform these tests monthly to ensure recovery procedures work:

#### Test 1: Pod Recovery
```powershell
# Delete Jenkins pod
kubectl delete pod jenkins-controller-0 -n jenkins

# Verify automatic recreation
kubectl get pods -n jenkins -w

# Verify data persistence
kubectl exec -n jenkins jenkins-controller-0 -- ls /var/jenkins_home/jobs
```

#### Test 2: EFS Restore (Non-Production)
```powershell
# Create test backup
# Restore to new EFS
# Mount and verify data
# Cleanup test resources
```

#### Test 3: Cluster Rebuild (Non-Production)
```powershell
# Deploy test cluster
# Restore from production backup
# Verify Jenkins functionality
# Cleanup test cluster
```

### Recovery Metrics to Track
- **RPO Actual**: Time between last backup and failure
- **RTO Actual**: Time from failure detection to full recovery
- **Data Loss**: Amount of data lost (should be zero with proper backups)
- **Recovery Success Rate**: Percentage of successful recoveries

## Emergency Contacts

### AWS Support
- **Support Level**: [Business/Enterprise]
- **Case Priority**: Critical (Production system down)
- **Phone**: 1-866-243-8852
- **Console**: https://console.aws.amazon.com/support/

### Internal Contacts
- **DevOps Team Lead**: [Name] - [Email] - [Phone]
- **Infrastructure Team**: [Email] - [Slack Channel]
- **On-Call Engineer**: [PagerDuty/Phone]

### Escalation Path
1. On-Call Engineer (0-15 minutes)
2. DevOps Team Lead (15-30 minutes)
3. Infrastructure Manager (30-60 minutes)
4. AWS Support (if needed)

## Post-Recovery Checklist

After any recovery:
- [ ] Document incident timeline
- [ ] Verify all services operational
- [ ] Check data integrity
- [ ] Review logs for root cause
- [ ] Update runbooks if needed
- [ ] Conduct post-mortem meeting
- [ ] Implement preventive measures
- [ ] Test backup/restore procedures
- [ ] Update recovery documentation

## Additional Resources
- [AWS Backup Documentation](https://docs.aws.amazon.com/aws-backup/)
- [EFS Backup and Restore](https://docs.aws.amazon.com/efs/latest/ug/awsbackup.html)
- [EKS Disaster Recovery](https://docs.aws.amazon.com/eks/latest/userguide/disaster-recovery-resiliency.html)
- [Jenkins Backup and Restore](https://www.jenkins.io/doc/book/system-administration/backing-up/)
