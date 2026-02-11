import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { JenkinsEksStack } from '../lib/eks_jenkins-stack';

// Helper function to create test stack with mock VPC and EFS
function createTestStack(app: cdk.App): JenkinsEksStack {
  // Create a mock VPC for testing
  const mockVpc = ec2.Vpc.fromVpcAttributes(app, 'MockVpc', {
    vpcId: 'vpc-12345678',
    availabilityZones: ['us-west-2a', 'us-west-2b'],
    privateSubnetIds: ['subnet-11111111', 'subnet-22222222'],
  });

  // Create mock subnets
  const mockSubnetAzA = ec2.Subnet.fromSubnetAttributes(app, 'MockSubnetAzA', {
    subnetId: 'subnet-11111111',
    availabilityZone: 'us-west-2a',
  });

  const mockSubnetAzB = ec2.Subnet.fromSubnetAttributes(app, 'MockSubnetAzB', {
    subnetId: 'subnet-22222222',
    availabilityZone: 'us-west-2b',
  });

  // Create mock EFS file system
  const mockEfs = efs.FileSystem.fromFileSystemAttributes(app, 'MockEfs', {
    fileSystemId: 'fs-12345678',
    securityGroup: ec2.SecurityGroup.fromSecurityGroupId(app, 'MockEfsSg', 'sg-12345678'),
  });

  return new JenkinsEksStack(app, 'TestStack', {
    env: { region: 'us-west-2' },
    vpc: mockVpc,
    privateSubnetAzA: mockSubnetAzA,
    privateSubnetAzB: mockSubnetAzB,
    efsFileSystem: mockEfs,
  });
}

describe('JenkinsEksStack', () => {
  test('Stack is created successfully', () => {
    const app = new cdk.App();
    
    // WHEN
    const stack = createTestStack(app);
    
    // THEN
    const template = Template.fromStack(stack);
    
    // Verify stack can be synthesized without errors
    expect(template).toBeDefined();
  });

  describe('Task 3.1: EKS Cluster IAM Role', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const stack = createTestStack(app);
      template = Template.fromStack(stack);
    });

    test('EKS cluster IAM role is created', () => {
      // Verify IAM role exists
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'jenkins-eks-cluster-role',
        Description: 'IAM role for Jenkins EKS cluster to manage cluster resources',
      });
    });

    test('EKS cluster IAM role has correct trust relationship for EKS service', () => {
      // Verify trust policy allows EKS service to assume the role
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Principal: {
                Service: 'eks.amazonaws.com',
              },
              Action: 'sts:AssumeRole',
            }),
          ]),
        },
      });
    });

    test('EKS cluster IAM role has AmazonEKSClusterPolicy attached', () => {
      // Verify the managed policy is attached
      template.hasResourceProperties('AWS::IAM::Role', {
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([
                Match.stringLikeRegexp('arn:'),
                Match.stringLikeRegexp(':iam::aws:policy/AmazonEKSClusterPolicy'),
              ]),
            ]),
          }),
        ]),
      });
    });

    test('EKS cluster role ARN is exported as output', () => {
      // Verify CloudFormation output exists
      template.hasOutput('EksClusterRoleArnOutput', {
        Description: 'IAM Role ARN for EKS Cluster',
        Export: {
          Name: 'JenkinsEksClusterRoleArn',
        },
      });
    });
  });
});

  describe('Task 6.1: OIDC Provider for EKS Cluster', () => {
    let template: Template;

    beforeAll(() => {
      const app = new cdk.App();
      const stack = createTestStack(app);
      template = Template.fromStack(stack);
    });

    test('OIDC provider is created for EKS cluster', () => {
      // Verify OIDC provider resource exists
      // Requirement 5.3: Service account associated with IAM role using IRSA
      template.hasResourceProperties('Custom::AWSCDKOpenIdConnectProvider', {
        ClientIDList: ['sts.amazonaws.com'],
        ThumbprintList: ['9e99a48a9960b14926bb7f3b02e22da2b0ab7280'],
      });
    });

    test('OIDC provider uses EKS cluster OIDC issuer URL', () => {
      // Verify OIDC provider URL references the EKS cluster's OIDC issuer
      // The URL should be the cluster's attrOpenIdConnectIssuerUrl
      template.hasResourceProperties('Custom::AWSCDKOpenIdConnectProvider', {
        Url: Match.objectLike({
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('JenkinsEksCluster'),
            'OpenIdConnectIssuerUrl',
          ]),
        }),
      });
    });

    test('OIDC provider has correct client ID for STS', () => {
      // Verify the client ID is 'sts.amazonaws.com' which is required for IRSA
      // Requirement 5.3: Enable IRSA for service accounts to assume IAM roles
      template.hasResourceProperties('Custom::AWSCDKOpenIdConnectProvider', {
        ClientIDList: Match.arrayWith(['sts.amazonaws.com']),
      });
    });

    test('OIDC provider has correct thumbprint for EKS', () => {
      // Verify the thumbprint is the well-known value for EKS OIDC providers
      // This is a constant value maintained by AWS for all EKS clusters
      template.hasResourceProperties('Custom::AWSCDKOpenIdConnectProvider', {
        ThumbprintList: Match.arrayWith(['9e99a48a9960b14926bb7f3b02e22da2b0ab7280']),
      });
    });

    test('OIDC provider ARN is exported as output', () => {
      // Verify CloudFormation output exists for OIDC provider ARN
      // This ARN will be used in IAM role trust policies for IRSA
      template.hasOutput('OidcProviderArnOutput', {
        Description: 'OIDC Provider ARN for EKS cluster (enables IRSA)',
        Export: {
          Name: 'JenkinsEksOidcProviderArn',
        },
      });
    });

    test('OIDC provider issuer URL is exported as output', () => {
      // Verify CloudFormation output exists for OIDC issuer URL
      template.hasOutput('OidcProviderIssuerOutput', {
        Description: 'OIDC Provider Issuer URL for EKS cluster',
        Export: {
          Name: 'JenkinsEksOidcProviderIssuer',
        },
      });
    });
  });
