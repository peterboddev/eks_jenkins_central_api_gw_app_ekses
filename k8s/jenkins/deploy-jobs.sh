#!/bin/bash
# Deploy Jenkins jobs as ConfigMap
# This applies the Jenkins Configuration as Code (JCasC) for job definitions

set -e

echo "🚀 Deploying Jenkins job configurations..."

# Apply the jobs ConfigMap
echo "📝 Creating jenkins-casc-jobs ConfigMap..."
kubectl apply -f k8s/jenkins/jobs-configmap.yaml

# Restart Jenkins to pick up the new configuration
echo "🔄 Restarting Jenkins controller to load new jobs..."
kubectl rollout restart statefulset/jenkins -n jenkins

echo ""
echo "⏳ Waiting for Jenkins to restart..."
kubectl rollout status statefulset/jenkins -n jenkins --timeout=5m

echo ""
echo "✅ Jenkins jobs deployed successfully!"
echo ""
echo "Jobs will be created automatically by JCasC on startup"
echo "Check Jenkins UI: http://k8s-jenkins-jenkins-b637b220e8-2120753307.us-west-2.elb.amazonaws.com"
echo ""
echo "Expected jobs:"
echo "  - nginx-api-build"
echo "  - nginx-docker-build"
