#!/usr/bin/env python3
"""
Lambda function to apply Kubernetes manifests using AWS SDK.
This avoids needing kubectl by using the Kubernetes Python client.

Environment Variables:
- CLUSTER_NAME: EKS cluster name
- S3_BUCKET: S3 bucket containing manifests
- S3_PREFIX: Prefix/folder in S3 bucket
"""

import os
import json
import boto3
import base64
import yaml
from kubernetes import client, config
from kubernetes.client.rest import ApiException

s3_client = boto3.client('s3')
eks_client = boto3.client('eks')
sts_client = boto3.client('sts')

CLUSTER_NAME = os.environ['CLUSTER_NAME']
S3_BUCKET = os.environ['S3_BUCKET']
S3_PREFIX = os.environ.get('S3_PREFIX', 'k8s/jenkins/')

def get_k8s_client():
    """Create Kubernetes client configured for EKS cluster."""
    # Get cluster info
    cluster_info = eks_client.describe_cluster(name=CLUSTER_NAME)
    cluster = cluster_info['cluster']
    
    # Get authentication token
    token_response = sts_client.assume_role(
        RoleArn=os.environ['EXECUTION_ROLE_ARN'],
        RoleSessionName='k8s-manifest-applier'
    )
    
    # Configure Kubernetes client
    configuration = client.Configuration()
    configuration.host = cluster['endpoint']
    configuration.verify_ssl = True
    configuration.ssl_ca_cert = write_ca_cert(cluster['certificateAuthority']['data'])
    configuration.api_key = {"authorization": f"Bearer {get_bearer_token()}"}
    
    return client.ApiClient(configuration)

def write_ca_cert(ca_data):
    """Write CA certificate to temp file."""
    import tempfile
    ca_cert = base64.b64decode(ca_data)
    with tempfile.NamedTemporaryFile(delete=False, mode='w') as f:
        f.write(ca_cert.decode('utf-8'))
        return f.name

def get_bearer_token():
    """Get EKS authentication token."""
    import subprocess
    result = subprocess.run(
        ['aws', 'eks', 'get-token', '--cluster-name', CLUSTER_NAME],
        capture_output=True,
        text=True
    )
    token_data = json.loads(result.stdout)
    return token_data['status']['token']

def download_manifests():
    """Download all YAML manifests from S3."""
    print(f"Downloading manifests from s3://{S3_BUCKET}/{S3_PREFIX}")
    
    paginator = s3_client.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=S3_BUCKET, Prefix=S3_PREFIX)
    
    manifests = []
    for page in pages:
        if 'Contents' not in page:
            continue
            
        for obj in page['Contents']:
            key = obj['Key']
            if key.endswith('.yaml') or key.endswith('.yml'):
                print(f"Downloading {key}")
                response = s3_client.get_object(Bucket=S3_BUCKET, Key=key)
                content = response['Body'].read().decode('utf-8')
                
                # Parse YAML (may contain multiple documents)
                docs = list(yaml.safe_load_all(content))
                manifests.extend([(key, doc) for doc in docs if doc])
    
    return manifests

def apply_manifest(k8s_client, manifest_file, manifest):
    """Apply a single Kubernetes manifest."""
    kind = manifest.get('kind')
    api_version = manifest.get('apiVersion')
    metadata = manifest.get('metadata', {})
    name = metadata.get('name')
    namespace = metadata.get('namespace', 'default')
    
    print(f"Applying {kind}/{name} in namespace {namespace}")
    
    try:
        # Determine which API to use based on kind
        if kind == 'Namespace':
            api = client.CoreV1Api(k8s_client)
            api.create_namespace(body=manifest)
        elif kind == 'ConfigMap':
            api = client.CoreV1Api(k8s_client)
            try:
                api.read_namespaced_config_map(name, namespace)
                api.replace_namespaced_config_map(name, namespace, body=manifest)
            except ApiException as e:
                if e.status == 404:
                    api.create_namespaced_config_map(namespace, body=manifest)
                else:
                    raise
        elif kind == 'ServiceAccount':
            api = client.CoreV1Api(k8s_client)
            try:
                api.read_namespaced_service_account(name, namespace)
                api.replace_namespaced_service_account(name, namespace, body=manifest)
            except ApiException as e:
                if e.status == 404:
                    api.create_namespaced_service_account(namespace, body=manifest)
                else:
                    raise
        elif kind == 'StatefulSet':
            api = client.AppsV1Api(k8s_client)
            try:
                api.read_namespaced_stateful_set(name, namespace)
                api.replace_namespaced_stateful_set(name, namespace, body=manifest)
            except ApiException as e:
                if e.status == 404:
                    api.create_namespaced_stateful_set(namespace, body=manifest)
                else:
                    raise
        # Add more resource types as needed
        else:
            print(f"Warning: Unsupported kind {kind}, skipping")
            return {'status': 'skipped', 'reason': f'Unsupported kind: {kind}'}
        
        return {'status': 'success'}
    
    except ApiException as e:
        print(f"Error applying {kind}/{name}: {e}")
        return {'status': 'failed', 'error': str(e)}
    except Exception as e:
        print(f"Unexpected error applying {kind}/{name}: {e}")
        return {'status': 'error', 'error': str(e)}

def lambda_handler(event, context):
    """Lambda handler function."""
    print(f"Event: {json.dumps(event)}")
    
    try:
        # Get Kubernetes client
        k8s_client = get_k8s_client()
        
        # Download manifests from S3
        manifests = download_manifests()
        
        if not manifests:
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'No manifest files found in S3',
                    'bucket': S3_BUCKET,
                    'prefix': S3_PREFIX
                })
            }
        
        print(f"Found {len(manifests)} manifest(s)")
        
        # Apply manifests
        results = []
        for manifest_file, manifest in manifests:
            result = apply_manifest(k8s_client, manifest_file, manifest)
            results.append({
                'file': manifest_file,
                'kind': manifest.get('kind'),
                'name': manifest.get('metadata', {}).get('name'),
                **result
            })
        
        # Check if any failed
        failed = [r for r in results if r['status'] in ['failed', 'error']]
        
        if failed:
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'message': f'{len(failed)} manifest(s) failed to apply',
                    'results': results
                })
            }
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': f'Successfully applied {len(results)} manifest(s)',
                'results': results
            })
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': 'Error applying manifests',
                'error': str(e)
            })
        }
