import * as cdk from 'aws-cdk-lib';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface AwsAuthHandlerProps {
  cluster: eks.ICluster;
  nodeRoles: iam.IRole[];
}

/**
 * Custom resource to add node roles to aws-auth ConfigMap
 * This avoids circular dependency issues when node roles are in a different stack
 */
export class AwsAuthHandler extends Construct {
  constructor(scope: Construct, id: string, props: AwsAuthHandlerProps) {
    super(scope, id);

    // Create a custom resource provider that updates aws-auth
    const onEvent = new cdk.aws_lambda.Function(this, 'AwsAuthHandlerFunction', {
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: cdk.aws_lambda.Code.fromInline(`
import json
import boto3
import base64

eks_client = boto3.client('eks')

def handler(event, context):
    request_type = event['RequestType']
    cluster_name = event['ResourceProperties']['ClusterName']
    node_roles = event['ResourceProperties']['NodeRoles']
    
    if request_type == 'Delete':
        return {'PhysicalResourceId': f'aws-auth-{cluster_name}'}
    
    # Get cluster info
    cluster_info = eks_client.describe_cluster(name=cluster_name)
    endpoint = cluster_info['cluster']['endpoint']
    ca_data = cluster_info['cluster']['certificateAuthority']['data']
    
    # Create kubeconfig
    import subprocess
    import os
    
    # Use aws eks get-token to get authentication token
    token_cmd = f"aws eks get-token --cluster-name {cluster_name}"
    token_result = subprocess.run(token_cmd.split(), capture_output=True, text=True)
    token_data = json.loads(token_result.stdout)
    token = token_data['status']['token']
    
    # Create kubectl config
    kubeconfig = {
        'apiVersion': 'v1',
        'kind': 'Config',
        'clusters': [{
            'name': 'cluster',
            'cluster': {
                'server': endpoint,
                'certificate-authority-data': ca_data
            }
        }],
        'contexts': [{
            'name': 'context',
            'context': {
                'cluster': 'cluster',
                'user': 'user'
            }
        }],
        'current-context': 'context',
        'users': [{
            'name': 'user',
            'user': {
                'token': token
            }
        }]
    }
    
    # Write kubeconfig to temp file
    kubeconfig_path = '/tmp/kubeconfig'
    with open(kubeconfig_path, 'w') as f:
        json.dump(kubeconfig, f)
    
    os.environ['KUBECONFIG'] = kubeconfig_path
    
    # Get current aws-auth configmap
    get_cmd = "kubectl get configmap aws-auth -n kube-system -o json"
    result = subprocess.run(get_cmd.split(), capture_output=True, text=True)
    
    if result.returncode != 0:
        return {
            'PhysicalResourceId': f'aws-auth-{cluster_name}',
            'Data': {'Error': f'Failed to get aws-auth: {result.stderr}'}
        }
    
    configmap = json.loads(result.stdout)
    
    # Parse existing mapRoles
    import yaml
    map_roles_str = configmap['data'].get('mapRoles', '[]')
    map_roles = yaml.safe_load(map_roles_str) or []
    
    # Add node roles if not already present
    for role_arn in node_roles:
        role_exists = any(r['rolearn'] == role_arn for r in map_roles)
        if not role_exists:
            map_roles.append({
                'rolearn': role_arn,
                'username': 'system:node:{{EC2PrivateDNSName}}',
                'groups': ['system:bootstrappers', 'system:nodes']
            })
    
    # Update configmap
    configmap['data']['mapRoles'] = yaml.dump(map_roles)
    
    # Write updated configmap
    with open('/tmp/aws-auth.json', 'w') as f:
        json.dump(configmap, f)
    
    # Apply updated configmap
    apply_cmd = "kubectl apply -f /tmp/aws-auth.json"
    result = subprocess.run(apply_cmd.split(), capture_output=True, text=True)
    
    if result.returncode != 0:
        return {
            'PhysicalResourceId': f'aws-auth-{cluster_name}',
            'Data': {'Error': f'Failed to apply aws-auth: {result.stderr}'}
        }
    
    return {
        'PhysicalResourceId': f'aws-auth-{cluster_name}',
        'Data': {'Status': 'Success'}
    }
      `),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
    });

    // Grant permissions to the Lambda function
    onEvent.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'eks:DescribeCluster',
        'eks:ListClusters',
      ],
      resources: [props.cluster.clusterArn],
    }));

    // Create custom resource provider
    const provider = new cr.Provider(this, 'AwsAuthProvider', {
      onEventHandler: onEvent,
    });

    // Create custom resource
    new cdk.CustomResource(this, 'AwsAuthResource', {
      serviceToken: provider.serviceToken,
      properties: {
        ClusterName: props.cluster.clusterName,
        NodeRoles: props.nodeRoles.map(r => r.roleArn),
      },
    });
  }
}
