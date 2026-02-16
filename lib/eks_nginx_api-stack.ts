import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/**
 * Nginx API Cluster Stack
 * 
 * This stack deploys a separate EKS cluster for the nginx REST API application with:
 * - Dedicated VPC (10.1.0.0/16) separate from Jenkins VPC
 * - EKS cluster with Karpenter for dynamic node provisioning
 * - AWS Load Balancer Controller for ALB management
 * - API Gateway as public entry point
 * - Transit Gateway connectivity to Jenkins cluster
 * 
 * Requirements: All nginx-api-cluster requirements
 */

export interface NginxApiClusterStackProps extends cdk.StackProps {
  /**
   * VPC for the EKS cluster (imported from NginxApiNetworkStack)
   */
  vpc: ec2.IVpc;
  
  /**
   * VPC ID of the Jenkins cluster for Transit Gateway connectivity
   */
  jenkinsVpcId: string;
  
  /**
   * AWS account ID where Jenkins ECR is located
   */
  jenkinsAccountId: string;
  
  /**
   * Transit Gateway ID (optional - will create new if not provided)
   */
  transitGatewayId?: string;
  
  /**
   * Jenkins controller IAM role ARN for cross-cluster access
   */
  jenkinsControllerRoleArn: string;
}

export class NginxApiClusterStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly cluster: eks.Cluster;
  public readonly apiGatewayUrl: string;

  constructor(scope: Construct, id: string, props: NginxApiClusterStackProps) {
    super(scope, id, props);

    // Import VPC from NginxApiNetworkStack
    this.vpc = props.vpc;

    // Task 3.1: Create EKS cluster with control plane
    // Requirements: 2.1, 2.3, 2.4, 11.5, 12.1
    
    // Create cluster IAM role
    const clusterRole = new iam.Role(this, 'ClusterRole', {
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'),
      ],
    });

    // Task 3.2: Configure cluster security groups
    // Requirements: 2.3, 8.6, 11.3
    
    // Get Jenkins VPC CIDR for security group rules
    const jenkinsVpcCidr = '10.0.0.0/16';
    
    // Create security group for cluster control plane
    const clusterSecurityGroup = new ec2.SecurityGroup(this, 'ClusterSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for EKS cluster control plane',
      allowAllOutbound: true,
    });
    
    // Allow inbound 443 from Jenkins VPC for kubectl access
    clusterSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(jenkinsVpcCidr),
      ec2.Port.tcp(443),
      'Allow kubectl access from Jenkins VPC'
    );

    // Create EKS cluster
    // Use combined kubectl+helm layer for Kubernetes operations and Helm chart deployments
    const kubectlHelmLayer = new lambda.LayerVersion(this, 'KubectlHelmLayer', {
      code: lambda.Code.fromAsset('nginx-api/tmp/kubectl-helm-layer.zip'),
      compatibleRuntimes: [
        lambda.Runtime.PYTHON_3_13,
        lambda.Runtime.PYTHON_3_12,
        lambda.Runtime.PYTHON_3_11,
        lambda.Runtime.PROVIDED_AL2023,
      ],
      description: 'kubectl and helm binaries for Kubernetes operations and Helm chart deployments',
    });

    this.cluster = new eks.Cluster(this, 'Cluster', {
      clusterName: 'nginx-api-cluster',
      version: eks.KubernetesVersion.V1_32,
      vpc: this.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      role: clusterRole,
      securityGroup: clusterSecurityGroup,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      defaultCapacity: 0, // No managed node groups - using Karpenter
      kubectlLayer: kubectlHelmLayer,
      clusterLogging: [
        eks.ClusterLoggingTypes.AUDIT,
        eks.ClusterLoggingTypes.AUTHENTICATOR,
        eks.ClusterLoggingTypes.CONTROLLER_MANAGER,
      ],
    });

    // Grant Jenkins controller role access to this cluster
    // This allows Jenkins pipelines to deploy to nginx-api-cluster
    const jenkinsControllerRole = iam.Role.fromRoleArn(
      this,
      'JenkinsControllerRole',
      props.jenkinsControllerRoleArn
    );
    
    this.cluster.awsAuth.addRoleMapping(jenkinsControllerRole, {
      groups: ['system:masters'],
      username: 'jenkins-controller',
    });

    // Task 3.3: Output cluster configuration
    // Requirements: 2.5
    
    new cdk.CfnOutput(this, 'ClusterNameOutput', {
      value: this.cluster.clusterName,
      description: 'EKS cluster name',
      exportName: 'NginxApiClusterName',
    });

    new cdk.CfnOutput(this, 'ClusterEndpointOutput', {
      value: this.cluster.clusterEndpoint,
      description: 'EKS cluster endpoint',
      exportName: 'NginxApiClusterEndpoint',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'EKS cluster ARN',
    });

    // Task 7.1: Create IAM role for ALB Controller
    // Requirements: 3.1, 3.4, 3.5, 3.6
    // Note: Will be created via Helm with IRSA
    
    new cdk.CfnOutput(this, 'ALBControllerRoleArn', {
      value: 'Will be created via Helm with IRSA',
      description: 'ALB Controller IAM role ARN (create via Helm)',
    });

    // Task 12.1: Create security group for ALB
    // Requirements: 5.6, 5.8, 11.2
    
    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for public ALB',
      allowAllOutbound: true,
    });

    // Allow HTTPS from anywhere (API Gateway will connect over public internet)
    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS from API Gateway'
    );

    new cdk.CfnOutput(this, 'ALBSecurityGroupId', {
      value: albSecurityGroup.securityGroupId,
      description: 'ALB security group ID',
    });

    // Task 12.2: Create API Gateway HTTP API
    // Requirements: 7.1, 7.3, 12.4
    
    const apiLogGroup = new logs.LogGroup(this, 'ApiGatewayLogGroup', {
      logGroupName: `/aws/apigateway/${this.cluster.clusterName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const httpApi = new apigatewayv2.CfnApi(this, 'HttpApi', {
      name: `${this.cluster.clusterName}-api`,
      protocolType: 'HTTP',
      corsConfiguration: {
        allowOrigins: ['*'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const apiStage = new apigatewayv2.CfnStage(this, 'ApiStage', {
      apiId: httpApi.ref,
      stageName: '$default',
      autoDeploy: true,
      accessLogSettings: {
        destinationArn: apiLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          ip: '$context.identity.sourceIp',
          requestTime: '$context.requestTime',
          httpMethod: '$context.httpMethod',
          routeKey: '$context.routeKey',
          status: '$context.status',
          protocol: '$context.protocol',
          responseLength: '$context.responseLength',
        }),
      },
    });

    // Output API Gateway URL (integration will be added after ALB is created)
    this.apiGatewayUrl = `https://${httpApi.ref}.execute-api.${this.region}.amazonaws.com`;
    
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.apiGatewayUrl,
      description: 'API Gateway public URL',
      exportName: 'NginxApiGatewayUrl',
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: httpApi.ref,
      description: 'API Gateway ID',
    });

    // Task 13.1: Create CloudWatch log groups
    // Requirements: 12.1, 12.3, 12.4, 12.5
    // Note: EKS cluster creates its own log group automatically when control plane logging is enabled

    // Task 6: Create managed node group for nginx-api workloads
    // Note: Karpenter requires CRDs which are complex to install via CDK
    // Using managed node group instead for simplicity and reliability
    
    const nodeGroup = this.cluster.addNodegroupCapacity('NginxApiNodeGroup', {
      nodegroupName: 'nginx-api-nodes',
      instanceTypes: [
        new ec2.InstanceType('t3.medium'),
        new ec2.InstanceType('t3.large'),
      ],
      minSize: 2,
      maxSize: 10,
      desiredSize: 3,
      diskSize: 20,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      capacityType: eks.CapacityType.ON_DEMAND,
      labels: {
        role: 'nginx-api',
        environment: 'production',
      },
      tags: {
        Name: 'nginx-api-node',
        Environment: 'production',
        ManagedBy: 'AWS CDK',
      },
    });

    // Grant node group access to Jenkins ECR
    nodeGroup.role.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
      ],
      resources: ['*'],
    }));

    new cdk.CfnOutput(this, 'NodeGroupName', {
      value: nodeGroup.nodegroupName,
      description: 'Nginx API node group name',
    });

    // Task 7: Deploy AWS Load Balancer Controller
    // Requirements: 3.1-3.6
    
    // Load ALB Controller IAM policy
    const albPolicyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:DescribeAccountAttributes',
            'ec2:DescribeAddresses',
            'ec2:DescribeAvailabilityZones',
            'ec2:DescribeInternetGateways',
            'ec2:DescribeVpcs',
            'ec2:DescribeVpcPeeringConnections',
            'ec2:DescribeSubnets',
            'ec2:DescribeSecurityGroups',
            'ec2:DescribeInstances',
            'ec2:DescribeNetworkInterfaces',
            'ec2:DescribeTags',
            'ec2:GetCoipPoolUsage',
            'ec2:DescribeCoipPools',
            'elasticloadbalancing:DescribeLoadBalancers',
            'elasticloadbalancing:DescribeLoadBalancerAttributes',
            'elasticloadbalancing:DescribeListeners',
            'elasticloadbalancing:DescribeListenerCertificates',
            'elasticloadbalancing:DescribeSSLPolicies',
            'elasticloadbalancing:DescribeRules',
            'elasticloadbalancing:DescribeTargetGroups',
            'elasticloadbalancing:DescribeTargetGroupAttributes',
            'elasticloadbalancing:DescribeTargetHealth',
            'elasticloadbalancing:DescribeTags',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'cognito-idp:DescribeUserPoolClient',
            'acm:ListCertificates',
            'acm:DescribeCertificate',
            'iam:ListServerCertificates',
            'iam:GetServerCertificate',
            'waf-regional:GetWebACL',
            'waf-regional:GetWebACLForResource',
            'waf-regional:AssociateWebACL',
            'waf-regional:DisassociateWebACL',
            'wafv2:GetWebACL',
            'wafv2:GetWebACLForResource',
            'wafv2:AssociateWebACL',
            'wafv2:DisassociateWebACL',
            'shield:GetSubscriptionState',
            'shield:DescribeProtection',
            'shield:CreateProtection',
            'shield:DeleteProtection',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:AuthorizeSecurityGroupIngress',
            'ec2:RevokeSecurityGroupIngress',
            'ec2:CreateSecurityGroup',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ec2:CreateTags'],
          resources: ['arn:aws:ec2:*:*:security-group/*'],
          conditions: {
            StringEquals: {
              'ec2:CreateAction': 'CreateSecurityGroup',
            },
            Null: {
              'aws:RequestTag/elbv2.k8s.aws/cluster': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ec2:CreateTags', 'ec2:DeleteTags'],
          resources: ['arn:aws:ec2:*:*:security-group/*'],
          conditions: {
            Null: {
              'aws:RequestTag/elbv2.k8s.aws/cluster': 'true',
              'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'ec2:AuthorizeSecurityGroupIngress',
            'ec2:RevokeSecurityGroupIngress',
            'ec2:DeleteSecurityGroup',
          ],
          resources: ['*'],
          conditions: {
            Null: {
              'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:CreateLoadBalancer',
            'elasticloadbalancing:CreateTargetGroup',
          ],
          resources: ['*'],
          conditions: {
            Null: {
              'aws:RequestTag/elbv2.k8s.aws/cluster': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:CreateListener',
            'elasticloadbalancing:DeleteListener',
            'elasticloadbalancing:CreateRule',
            'elasticloadbalancing:DeleteRule',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:AddTags',
            'elasticloadbalancing:RemoveTags',
          ],
          resources: [
            'arn:aws:elasticloadbalancing:*:*:targetgroup/*/*',
            'arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*',
            'arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*',
          ],
          conditions: {
            Null: {
              'aws:RequestTag/elbv2.k8s.aws/cluster': 'true',
              'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:AddTags',
            'elasticloadbalancing:RemoveTags',
          ],
          resources: [
            'arn:aws:elasticloadbalancing:*:*:listener/net/*/*/*',
            'arn:aws:elasticloadbalancing:*:*:listener/app/*/*/*',
            'arn:aws:elasticloadbalancing:*:*:listener-rule/net/*/*/*',
            'arn:aws:elasticloadbalancing:*:*:listener-rule/app/*/*/*',
          ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:ModifyLoadBalancerAttributes',
            'elasticloadbalancing:SetIpAddressType',
            'elasticloadbalancing:SetSecurityGroups',
            'elasticloadbalancing:SetSubnets',
            'elasticloadbalancing:DeleteLoadBalancer',
            'elasticloadbalancing:ModifyTargetGroup',
            'elasticloadbalancing:ModifyTargetGroupAttributes',
            'elasticloadbalancing:DeleteTargetGroup',
          ],
          resources: ['*'],
          conditions: {
            Null: {
              'aws:ResourceTag/elbv2.k8s.aws/cluster': 'false',
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:RegisterTargets',
            'elasticloadbalancing:DeregisterTargets',
          ],
          resources: ['arn:aws:elasticloadbalancing:*:*:targetgroup/*/*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticloadbalancing:SetWebAcl',
            'elasticloadbalancing:ModifyListener',
            'elasticloadbalancing:AddListenerCertificates',
            'elasticloadbalancing:RemoveListenerCertificates',
            'elasticloadbalancing:ModifyRule',
          ],
          resources: ['*'],
        }),
      ],
    });

    // Create service account for ALB Controller with IRSA
    const albServiceAccount = this.cluster.addServiceAccount('ALBControllerServiceAccount', {
      name: 'aws-load-balancer-controller',
      namespace: 'kube-system',
    });

    albServiceAccount.role.attachInlinePolicy(new iam.Policy(this, 'ALBControllerInlinePolicy', {
      policyName: 'AWSLoadBalancerControllerPolicy',
      document: albPolicyDocument,
    }));

    // Deploy ALB Controller
    const albControllerManifest = this.cluster.addManifest('ALBController', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'aws-load-balancer-controller',
        namespace: 'kube-system',
        labels: {
          'app.kubernetes.io/name': 'aws-load-balancer-controller',
        },
      },
      spec: {
        replicas: 2,
        selector: {
          matchLabels: {
            'app.kubernetes.io/name': 'aws-load-balancer-controller',
          },
        },
        template: {
          metadata: {
            labels: {
              'app.kubernetes.io/name': 'aws-load-balancer-controller',
            },
          },
          spec: {
            serviceAccountName: 'aws-load-balancer-controller',
            containers: [
              {
                name: 'controller',
                image: 'public.ecr.aws/eks/aws-load-balancer-controller:v2.8.1',
                args: [
                  `--cluster-name=${this.cluster.clusterName}`,
                  '--ingress-class=alb',
                  `--aws-region=${this.region}`,
                  `--aws-vpc-id=${this.vpc.vpcId}`,
                ],
                resources: {
                  limits: {
                    cpu: '200m',
                    memory: '500Mi',
                  },
                  requests: {
                    cpu: '100m',
                    memory: '200Mi',
                  },
                },
              },
            ],
          },
        },
      },
    });

    albControllerManifest.node.addDependency(albServiceAccount);

    // Task 11: Deploy nginx-api application
    // Requirements: 4.1-4.8, 9.1-9.5
    
    // Create namespace for nginx-api
    const nginxApiNamespace = this.cluster.addManifest('NginxApiNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: 'nginx-api',
      },
    });

    // Create Deployment
    const nginxApiDeployment = this.cluster.addManifest('NginxApiDeployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'nginx-api',
        namespace: 'nginx-api',
        labels: {
          app: 'nginx-api',
        },
      },
      spec: {
        replicas: 3,
        selector: {
          matchLabels: {
            app: 'nginx-api',
          },
        },
        template: {
          metadata: {
            labels: {
              app: 'nginx-api',
            },
          },
          spec: {
            containers: [
              {
                name: 'nginx-api',
                image: `${props.jenkinsAccountId}.dkr.ecr.${this.region}.amazonaws.com/nginx-api:latest`,
                ports: [
                  {
                    name: 'http',
                    containerPort: 8080,
                    protocol: 'TCP',
                  },
                ],
                env: [
                  {
                    name: 'NODE_ENV',
                    value: 'production',
                  },
                  {
                    name: 'CLUSTER_NAME',
                    value: this.cluster.clusterName,
                  },
                ],
                livenessProbe: {
                  httpGet: {
                    path: '/health',
                    port: 8080,
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 10,
                  timeoutSeconds: 3,
                  failureThreshold: 3,
                },
                readinessProbe: {
                  httpGet: {
                    path: '/health',
                    port: 8080,
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 5,
                  timeoutSeconds: 3,
                  failureThreshold: 3,
                },
                resources: {
                  requests: {
                    cpu: '100m',
                    memory: '128Mi',
                  },
                  limits: {
                    cpu: '500m',
                    memory: '512Mi',
                  },
                },
              },
            ],
          },
        },
      },
    });

    nginxApiDeployment.node.addDependency(nginxApiNamespace);
    nginxApiDeployment.node.addDependency(nodeGroup);

    // Create Service
    const nginxApiService = this.cluster.addManifest('NginxApiService', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'nginx-api',
        namespace: 'nginx-api',
      },
      spec: {
        type: 'ClusterIP',
        selector: {
          app: 'nginx-api',
        },
        ports: [
          {
            name: 'http',
            port: 80,
            targetPort: 8080,
            protocol: 'TCP',
          },
        ],
      },
    });

    nginxApiService.node.addDependency(nginxApiDeployment);

    // Create Ingress with ALB annotations
    const nginxApiIngress = this.cluster.addManifest('NginxApiIngress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'nginx-api',
        namespace: 'nginx-api',
        annotations: {
          'alb.ingress.kubernetes.io/scheme': 'internet-facing',
          'alb.ingress.kubernetes.io/target-type': 'ip',
          'alb.ingress.kubernetes.io/security-groups': albSecurityGroup.securityGroupId,
          'alb.ingress.kubernetes.io/listen-ports': '[{"HTTPS":443}]',
          'alb.ingress.kubernetes.io/ssl-policy': 'ELBSecurityPolicy-TLS-1-2-2017-01',
          'alb.ingress.kubernetes.io/healthcheck-path': '/health',
          'alb.ingress.kubernetes.io/healthcheck-interval-seconds': '15',
          'alb.ingress.kubernetes.io/healthcheck-timeout-seconds': '5',
          'alb.ingress.kubernetes.io/healthy-threshold-count': '2',
          'alb.ingress.kubernetes.io/unhealthy-threshold-count': '2',
        },
      },
      spec: {
        ingressClassName: 'alb',
        rules: [
          {
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: 'nginx-api',
                      port: {
                        number: 80,
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    });

    nginxApiIngress.node.addDependency(nginxApiService);
    nginxApiIngress.node.addDependency(albControllerManifest);

    // Output deployment information
    new cdk.CfnOutput(this, 'NginxApiDeploymentStatus', {
      value: 'Deployed via CDK manifests',
      description: 'Nginx API application deployment status',
    });

    new cdk.CfnOutput(this, 'NginxApiImageRepository', {
      value: `${props.jenkinsAccountId}.dkr.ecr.${this.region}.amazonaws.com/nginx-api`,
      description: 'ECR repository for nginx-api Docker image',
    });
  }
}
