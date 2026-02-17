import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { Construct } from 'constructs';

/**
 * Nginx API ArgoCD Stack Props
 */
export interface NginxApiArgoCDStackProps extends cdk.StackProps {
  /**
   * EKS cluster (imported from NginxApiClusterStack)
   */
  cluster: eks.ICluster;
  
  /**
   * Security group for ALB (imported from NginxApiClusterStack)
   */
  albSecurityGroup: ec2.ISecurityGroup;
}

/**
 * Nginx API ArgoCD Bootstrap Stack
 * 
 * This stack installs ArgoCD on the nginx-api EKS cluster using Helm.
 * ArgoCD is the GitOps continuous delivery tool that will manage
 * all Kubernetes workloads after migration.
 * 
 * Components:
 * - ArgoCD Helm chart installation
 * - Ingress with ALB for ArgoCD UI access
 * - Outputs for accessing ArgoCD UI and retrieving admin password
 * 
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.1-2.7
 */
export class NginxApiArgoCDStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NginxApiArgoCDStackProps) {
    super(scope, id, props);

    // Install ArgoCD using Helm chart
    // This uses the official argo-cd chart from the Argo project
    const argoCDChart = props.cluster.addHelmChart('ArgoCD', {
      chart: 'argo-cd',
      repository: 'https://argoproj.github.io/argo-helm',
      namespace: 'argocd',
      createNamespace: true,
      release: 'argocd',
      version: '7.7.11', // Latest stable version as of 2024
      values: {
        // Configure server service as ClusterIP (not LoadBalancer)
        // We'll use ALB Ingress for external access
        server: {
          service: {
            type: 'ClusterIP',
          },
        },
        // Enable metrics for monitoring
        metrics: {
          enabled: true,
        },
      },
    });

    // Create Ingress for ArgoCD UI
    // This creates an ALB that routes traffic to the ArgoCD server
    const argoCDIngress = props.cluster.addManifest('ArgoCDIngress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'argocd-server',
        namespace: 'argocd',
        annotations: {
          // ALB configuration
          'alb.ingress.kubernetes.io/scheme': 'internet-facing',
          'alb.ingress.kubernetes.io/target-type': 'ip',
          'alb.ingress.kubernetes.io/backend-protocol': 'HTTPS',
          'alb.ingress.kubernetes.io/listen-ports': '[{"HTTP":80}]',
          'alb.ingress.kubernetes.io/load-balancer-name': 'nginx-api-argocd-alb',
          
          // Security group for access control
          'alb.ingress.kubernetes.io/security-groups': props.albSecurityGroup.securityGroupId,
          
          // Health check configuration
          'alb.ingress.kubernetes.io/healthcheck-path': '/healthz',
          'alb.ingress.kubernetes.io/healthcheck-protocol': 'HTTPS',
          
          // Allow insecure backend (ArgoCD server uses self-signed cert)
          'alb.ingress.kubernetes.io/backend-protocol-version': 'HTTP1',
        },
        labels: {
          app: 'argocd-server',
          'security-group-version': 'v1',
        },
      },
      spec: {
        ingressClassName: 'alb',
        rules: [{
          http: {
            paths: [{
              path: '/',
              pathType: 'Prefix',
              backend: {
                service: {
                  name: 'argocd-server',
                  port: {
                    number: 443,
                  },
                },
              },
            }],
          },
        }],
      },
    });

    // Ingress depends on ArgoCD being installed
    argoCDIngress.node.addDependency(argoCDChart);

    // Output ArgoCD UI URL
    new cdk.CfnOutput(this, 'ArgoCDUIUrlOutput', {
      value: 'http://<ALB-DNS-NAME> (check AWS Console for ALB DNS name)',
      description: 'ArgoCD UI URL - Access via ALB (DNS name available after deployment)',
      exportName: 'NginxApiArgoCDUIUrl',
    });

    // Output command to get ArgoCD admin password (PowerShell compatible)
    new cdk.CfnOutput(this, 'ArgoCDAdminPasswordCommandOutput', {
      value: 'kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | ForEach-Object { [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($_)) }',
      description: 'PowerShell command to retrieve ArgoCD admin password',
    });

    // Output bash command for reference
    new cdk.CfnOutput(this, 'ArgoCDAdminPasswordCommandBashOutput', {
      value: 'kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d',
      description: 'Bash command to retrieve ArgoCD admin password (Linux/Mac)',
    });

    // Output deployment status
    new cdk.CfnOutput(this, 'ArgoCDDeploymentStatusOutput', {
      value: 'ArgoCD installed via Helm - no workloads managed yet',
      description: 'ArgoCD bootstrap status',
    });

    // Output instructions
    new cdk.CfnOutput(this, 'ArgoCDNextStepsOutput', {
      value: '1. Get ALB DNS from AWS Console, 2. Retrieve admin password, 3. Login to ArgoCD UI',
      description: 'Next steps to access ArgoCD',
    });
  }
}
