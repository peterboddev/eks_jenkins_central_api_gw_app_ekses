#!/bin/bash
# Script to build kubectl Lambda layer

set -e

echo "Building kubectl Lambda layer..."

# Create layer directory structure
mkdir -p layer/bin

# Download kubectl binary
echo "Downloading kubectl..."
KUBECTL_VERSION="v1.32.0"
curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"
chmod +x kubectl
mv kubectl layer/bin/

# Download AWS CLI (needed for EKS token)
echo "Downloading AWS CLI..."
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install --install-dir layer/aws-cli --bin-dir layer/bin
rm -rf aws awscliv2.zip

# Create zip file
echo "Creating layer zip..."
cd layer
zip -r ../kubectl-layer.zip . -q
cd ..

echo "✓ kubectl-layer.zip created successfully"
echo "  Size: $(du -h kubectl-layer.zip | cut -f1)"
echo "  Location: $(pwd)/kubectl-layer.zip"

# Cleanup
rm -rf layer

echo ""
echo "To use this layer:"
echo "1. Upload to S3 or use directly in CDK"
echo "2. Attach to Lambda function"
echo "3. Set PATH=/opt/bin:\$PATH in Lambda environment"
