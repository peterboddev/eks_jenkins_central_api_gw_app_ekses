#!/bin/bash

# Script to create Jenkins jobs
# This script applies a Kubernetes Job that creates Jenkins pipeline jobs

set -e

echo "Creating Jenkins jobs..."

# Apply the job
kubectl apply -f create-jobs.yaml

# Wait for the job to complete
echo "Waiting for job to complete..."
kubectl wait --for=condition=complete --timeout=300s job/jenkins-create-jobs -n jenkins

# Show job logs
echo "Job logs:"
kubectl logs -n jenkins job/jenkins-create-jobs

echo "✓ Jenkins jobs created successfully!"
echo ""
echo "You can now:"
echo "1. Access Jenkins at your ALB URL"
echo "2. See the jobs: nginx-api-build and nginx-docker-build"
echo "3. Push code to trigger builds via webhook"
