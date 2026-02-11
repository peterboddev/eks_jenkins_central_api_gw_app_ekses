#!/usr/bin/env python3
"""
Lambda function to apply Kubernetes manifests from S3 to EKS cluster.

This function:
1. Downloads manifests from S3
2. Applies them to the EKS cluster using kubectl
3. Returns success/failure status

Environment Variables:
- CLUSTER_NAME: EKS cluster name
- S3_BUCKET: S3 bucket containing manifests
- S3_PREFIX: Prefix/folder in S3 bucket (e.g., "k8s/jenkins/")
"""

import os
import json
import boto3
import subprocess
import tempfile
from pathlib import Path

s3 = boto3.client('s3')
eks = boto3.client('eks')

CLUSTER_NAME = os.environ['CLUSTER_NAME']
S3_BUCKET = os.environ['S3_BUCKET']
S3_PREFIX = os.environ.get('S3_PREFIX', 'k8s/jenkins/')

def get_kubeconfig():
    """Generate kubeconfig for EKS cluster."""
    cluster_info = eks.describe_cluster(name=CLUSTER_NAME)
    cluster = cluster_info['cluster']
    
    kubeconfig = {
        'apiVersion': 'v1',
        'kind': 'Config',
        'clusters': [{
            'name': CLUSTER_NAME,
            'cluster': {
                'server': cluster['endpoint'],
                'certificate-authority-data': cluster['certificateAuthority']['data']
            }
        }],
        'contexts': [{
            'name': CLUSTER_NAME,
            'context': {
                'cluster': CLUSTER_NAME,
                'user': CLUSTER_NAME
            }
        }],
        'current-context': CLUSTER_NAME,
        'users': [{
            'name': CLUSTER_NAME,
            'user': {
                'exec': {
                    'apiVersion': 'client.authentication.k8s.io/v1beta1',
                    'command': 'aws',
                    'args': [
                        'eks',
                        'get-token',
                        '--cluster-name',
                        CLUSTER_NAME,
                        '--region',
                        os.environ['AWS_REGION']
                    ]
                }
            }
        }]
    }
    
    return kubeconfig

def download_manifests(temp_dir):
    """Download all YAML manifests from S3."""
    print(f"Downloading manifests from s3://{S3_BUCKET}/{S3_PREFIX}")
    
    paginator = s3.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=S3_BUCKET, Prefix=S3_PREFIX)
    
    manifest_files = []
    for page in pages:
        if 'Contents' not in page:
            continue
            
        for obj in page['Contents']:
            key = obj['Key']
            if key.endswith('.yaml') or key.endswith('.yml'):
                # Download file
                local_path = os.path.join(temp_dir, os.path.basename(key))
                print(f"Downloading {key} to {local_path}")
                s3.download_file(S3_BUCKET, key, local_path)
                manifest_files.append(local_path)
    
    return manifest_files

def apply_manifests(kubeconfig_path, manifest_files):
    """Apply Kubernetes manifests using kubectl."""
    results = []
    
    for manifest_file in sorted(manifest_files):
        print(f"Applying {manifest_file}")
        
        try:
            result = subprocess.run(
                ['kubectl', 'apply', '-f', manifest_file],
                env={'KUBECONFIG': kubeconfig_path},
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                print(f"✓ Successfully applied {manifest_file}")
                print(result.stdout)
                results.append({
                    'file': os.path.basename(manifest_file),
                    'status': 'success',
                    'output': result.stdout
                })
            else:
                print(f"✗ Failed to apply {manifest_file}")
                print(result.stderr)
                results.append({
                    'file': os.path.basename(manifest_file),
                    'status': 'failed',
                    'error': result.stderr
                })
        except subprocess.TimeoutExpired:
            print(f"✗ Timeout applying {manifest_file}")
            results.append({
                'file': os.path.basename(manifest_file),
                'status': 'timeout',
                'error': 'Command timed out after 60 seconds'
            })
        except Exception as e:
            print(f"✗ Error applying {manifest_file}: {str(e)}")
            results.append({
                'file': os.path.basename(manifest_file),
                'status': 'error',
                'error': str(e)
            })
    
    return results

def lambda_handler(event, context):
    """Lambda handler function."""
    print(f"Event: {json.dumps(event)}")
    
    try:
        # Create temporary directory for manifests and kubeconfig
        with tempfile.TemporaryDirectory() as temp_dir:
            # Generate kubeconfig
            kubeconfig = get_kubeconfig()
            kubeconfig_path = os.path.join(temp_dir, 'kubeconfig')
            with open(kubeconfig_path, 'w') as f:
                json.dump(kubeconfig, f)
            
            print(f"Kubeconfig written to {kubeconfig_path}")
            
            # Download manifests from S3
            manifest_files = download_manifests(temp_dir)
            
            if not manifest_files:
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'message': 'No manifest files found in S3',
                        'bucket': S3_BUCKET,
                        'prefix': S3_PREFIX
                    })
                }
            
            print(f"Found {len(manifest_files)} manifest files")
            
            # Apply manifests
            results = apply_manifests(kubeconfig_path, manifest_files)
            
            # Check if any failed
            failed = [r for r in results if r['status'] != 'success']
            
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
