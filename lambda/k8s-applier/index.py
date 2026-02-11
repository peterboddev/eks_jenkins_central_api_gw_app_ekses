#!/usr/bin/env python3
"""
CDK Custom Resource Lambda to apply Kubernetes manifests.
This is triggered during cdk deploy to automatically apply manifests.
"""

import json
import boto3
import subprocess
import tempfile
import os
from urllib.request import Request, urlopen

s3 = boto3.client('s3')
eks = boto3.client('eks')

def get_kubeconfig(cluster_name, region):
    """Generate kubeconfig for EKS cluster."""
    cluster_info = eks.describe_cluster(name=cluster_name)
    cluster = cluster_info['cluster']
    
    kubeconfig = f"""apiVersion: v1
kind: Config
clusters:
- name: {cluster_name}
  cluster:
    server: {cluster['endpoint']}
    certificate-authority-data: {cluster['certificateAuthority']['data']}
contexts:
- name: {cluster_name}
  context:
    cluster: {cluster_name}
    user: {cluster_name}
current-context: {cluster_name}
users:
- name: {cluster_name}
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: aws
      args:
        - eks
        - get-token
        - --cluster-name
        - {cluster_name}
        - --region
        - {region}
"""
    return kubeconfig

def apply_manifests(event):
    """Apply Kubernetes manifests from S3."""
    properties = event['ResourceProperties']
    cluster_name = properties['ClusterName']
    bucket = properties['ManifestsBucket']
    prefix = properties.get('ManifestsPrefix', 'k8s/jenkins/')
    region = properties.get('Region', 'us-west-2')
    
    print(f"Applying manifests from s3://{bucket}/{prefix} to cluster {cluster_name}")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        # Write kubeconfig
        kubeconfig_path = os.path.join(tmpdir, 'kubeconfig')
        with open(kubeconfig_path, 'w') as f:
            f.write(get_kubeconfig(cluster_name, region))
        
        # Download manifests
        paginator = s3.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket, Prefix=prefix)
        
        manifest_files = []
        for page in pages:
            if 'Contents' not in page:
                continue
            for obj in page['Contents']:
                key = obj['Key']
                if key.endswith('.yaml') or key.endswith('.yml'):
                    local_path = os.path.join(tmpdir, os.path.basename(key))
                    print(f"Downloading {key}")
                    s3.download_file(bucket, key, local_path)
                    manifest_files.append(local_path)
        
        if not manifest_files:
            return {'Message': 'No manifests found'}
        
        # Apply manifests
        results = []
        for manifest in sorted(manifest_files):
            print(f"Applying {manifest}")
            result = subprocess.run(
                ['/opt/bin/kubectl', 'apply', '-f', manifest],
                env={'KUBECONFIG': kubeconfig_path},
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                print(f"✓ {manifest}")
                results.append({'file': os.path.basename(manifest), 'status': 'success'})
            else:
                print(f"✗ {manifest}: {result.stderr}")
                results.append({'file': os.path.basename(manifest), 'status': 'failed', 'error': result.stderr})
        
        return {'Results': results}

def send_response(event, context, status, data):
    """Send response to CloudFormation."""
    response_body = json.dumps({
        'Status': status,
        'Reason': f'See CloudWatch Log Stream: {context.log_stream_name}',
        'PhysicalResourceId': context.log_stream_name,
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'Data': data
    })
    
    headers = {'Content-Type': 'application/json'}
    req = Request(event['ResponseURL'], data=response_body.encode('utf-8'), headers=headers, method='PUT')
    
    try:
        urlopen(req)
        print('Response sent successfully')
    except Exception as e:
        print(f'Error sending response: {e}')

def handler(event, context):
    """Lambda handler for CDK Custom Resource."""
    print(f'Event: {json.dumps(event)}')
    
    try:
        request_type = event['RequestType']
        
        if request_type == 'Create' or request_type == 'Update':
            result = apply_manifests(event)
            send_response(event, context, 'SUCCESS', result)
        elif request_type == 'Delete':
            # Don't delete manifests on stack deletion
            send_response(event, context, 'SUCCESS', {'Message': 'Skipped deletion'})
        else:
            send_response(event, context, 'FAILED', {'Message': f'Unknown request type: {request_type}'})
    
    except Exception as e:
        print(f'Error: {e}')
        import traceback
        traceback.print_exc()
        send_response(event, context, 'FAILED', {'Message': str(e)})
