import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as backup from 'aws-cdk-lib/aws-backup';
import { Construct } from 'constructs';

/**
 * Jenkins Storage Stack Props
 */
export interface JenkinsStorageStackProps extends cdk.StackProps {
  /**
   * VPC for the EFS file system (imported from JenkinsNetworkStack)
   */
  vpc: ec2.IVpc;
  
  /**
   * Private subnet in AZ-A
   */
  privateSubnetAzA: ec2.ISubnet;
  
  /**
   * Private subnet in AZ-B
   */
  privateSubnetAzB: ec2.ISubnet;
}

/**
 * Jenkins Storage Stack
 * 
 * This stack provisions persistent storage for Jenkins:
 * - EFS file system for Jenkins home directory
 * - EFS mount targets in multiple AZs
 * - AWS Backup vault and plan for automated backups
 * 
 * This stack is separate from JenkinsEksStack to allow:
 * - Independent lifecycle management (delete EKS without losing data)
 * - Disaster recovery (EFS persists even if cluster is destroyed)
 * - Storage can be reused when recreating the cluster
 */
export class JenkinsStorageStack extends cdk.Stack {
  public readonly efsFileSystem: efs.IFileSystem;
  public readonly efsFileSystemId: string;

  constructor(scope: Construct, id: string, props: JenkinsStorageStackProps) {
    super(scope, id, props);

    // Create EFS file system for Jenkins persistent storage
    // The file system will be used to store Jenkins home directory (configs, jobs, plugins, build history)
    this.efsFileSystem = new efs.FileSystem(this, 'JenkinsEfsFileSystem', {
      // Deploy across multiple availability zones for high availability
      vpc: props.vpc,
      vpcSubnets: {
        subnets: [props.privateSubnetAzA, props.privateSubnetAzB],
      },
      
      // Enable encryption at rest using AWS managed key
      encrypted: true,
      
      // Use General Purpose performance mode for balanced performance
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
      
      // Use Bursting throughput mode (scales automatically with file system size)
      throughputMode: efs.ThroughputMode.BURSTING,
      
      // Enable lifecycle management to transition infrequently accessed files to IA storage class after 30 days
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_30_DAYS,
      
      // Enable automatic backups (will be configured separately with AWS Backup)
      enableAutomaticBackups: true,
      
      // IMPORTANT: Set to RETAIN for production to prevent data loss
      // When the stack is deleted, the EFS file system will be retained
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      
      fileSystemName: 'jenkins-eks-efs',
    });

    // Allow NFS connections from VPC CIDR
    // This is required for EKS nodes to mount the EFS file system
    this.efsFileSystem.connections.allowDefaultPortFrom(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      'Allow NFS from VPC'
    );

    this.efsFileSystemId = this.efsFileSystem.fileSystemId;

    // Add tags to EFS file system
    cdk.Tags.of(this.efsFileSystem).add('Name', 'jenkins-eks-efs');
    cdk.Tags.of(this.efsFileSystem).add('Purpose', 'Jenkins EKS Cluster Persistent Storage');
    cdk.Tags.of(this.efsFileSystem).add('ManagedBy', 'AWS CDK');

    // Output EFS file system information for reference
    new cdk.CfnOutput(this, 'EfsFileSystemIdOutput', {
      value: this.efsFileSystem.fileSystemId,
      description: 'EFS File System ID for Jenkins persistent storage',
      exportName: 'JenkinsStorageEfsFileSystemId',
    });

    new cdk.CfnOutput(this, 'EfsFileSystemArnOutput', {
      value: this.efsFileSystem.fileSystemArn,
      description: 'EFS File System ARN',
      exportName: 'JenkinsStorageEfsFileSystemArn',
    });

    new cdk.CfnOutput(this, 'EfsNfsServerOutput', {
      value: this.efsFileSystem.fileSystemId + '.efs.' + this.region + '.amazonaws.com',
      description: 'EFS NFS server address',
      exportName: 'JenkinsStorageEfsNfsServer',
    });

    // Create AWS Backup vault for storing EFS backups
    const backupVault = new backup.BackupVault(this, 'JenkinsEfsBackupVault', {
      backupVaultName: 'jenkins-eks-efs-backup-vault',
      // IMPORTANT: Set to RETAIN for production to prevent backup loss
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create AWS Backup plan for EFS with daily backups and 30-day retention
    const backupPlan = new backup.BackupPlan(this, 'JenkinsEfsBackupPlan', {
      backupPlanName: 'jenkins-eks-efs-daily-backup',
      backupVault: backupVault,
      
      // Configure daily backup schedule
      backupPlanRules: [
        new backup.BackupPlanRule({
          ruleName: 'DailyBackup',
          
          // Schedule daily backups at 2 AM UTC
          scheduleExpression: cdk.aws_events.Schedule.cron({
            hour: '2',
            minute: '0',
          }),
          
          // Start backup within 1 hour of scheduled time
          startWindow: cdk.Duration.hours(1),
          
          // Complete backup within 2 hours
          completionWindow: cdk.Duration.hours(2),
          
          // Set backup retention to 30 days
          deleteAfter: cdk.Duration.days(30),
        }),
      ],
    });

    // Add EFS file system to backup plan
    backupPlan.addSelection('JenkinsEfsBackupSelection', {
      resources: [
        backup.BackupResource.fromEfsFileSystem(this.efsFileSystem),
      ],
      
      // Allow AWS Backup to create the necessary IAM role automatically
      allowRestores: true,
    });

    // Output AWS Backup information for reference
    new cdk.CfnOutput(this, 'BackupVaultNameOutput', {
      value: backupVault.backupVaultName,
      description: 'AWS Backup Vault Name for EFS backups',
      exportName: 'JenkinsStorageBackupVaultName',
    });

    new cdk.CfnOutput(this, 'BackupVaultArnOutput', {
      value: backupVault.backupVaultArn,
      description: 'AWS Backup Vault ARN',
      exportName: 'JenkinsStorageBackupVaultArn',
    });

    new cdk.CfnOutput(this, 'BackupPlanIdOutput', {
      value: backupPlan.backupPlanId,
      description: 'AWS Backup Plan ID for EFS daily backups',
      exportName: 'JenkinsStorageBackupPlanId',
    });

    new cdk.CfnOutput(this, 'BackupPlanArnOutput', {
      value: backupPlan.backupPlanArn,
      description: 'AWS Backup Plan ARN',
      exportName: 'JenkinsStorageBackupPlanArn',
    });
  }
}
