#!/bin/bash
set -e

# Environment variables
export AWS_REGION=us-west-2
export AWS_ACCOUNT_ID=450683699755
export ECR_REPOSITORY=nginx-demo
export ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

echo "========================================="
echo "Building Nginx Docker Image (with caching)"
echo "========================================="

# Create source files
cat > Dockerfile <<'EOF'
FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
EOF

cat > nginx.conf <<'EOF'
user  nginx;
worker_processes  auto;
error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;

events {
    worker_connections  1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                      '$status $body_bytes_sent "$http_referer" '
                      '"$http_user_agent" "$http_x_forwarded_for"';
    access_log  /var/log/nginx/access.log  main;
    sendfile        on;
    keepalive_timeout  65;
    gzip  on;

    server {
        listen       80;
        server_name  localhost;
        location / {
            root   /usr/share/nginx/html;
            index  index.html index.htm;
        }
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
        error_page   500 502 503 504  /50x.html;
        location = /50x.html {
            root   /usr/share/nginx/html;
        }
    }
}
EOF

cat > index.html <<EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nginx Demo - Jenkins EKS</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            backdrop-filter: blur(10px);
        }
        h1 { font-size: 3em; margin: 0 0 20px 0; }
        p { font-size: 1.2em; margin: 10px 0; }
        .badge {
            display: inline-block;
            padding: 10px 20px;
            margin: 10px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 5px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Nginx Demo</h1>
        <p>Built with Jenkins on EKS</p>
        <p>Deployed to Amazon ECR</p>
        <div>
            <span class="badge">Docker</span>
            <span class="badge">Nginx</span>
            <span class="badge">Jenkins</span>
            <span class="badge">EKS</span>
            <span class="badge">ECR</span>
        </div>
        <p style="margin-top: 30px; font-size: 0.9em; opacity: 0.8;">
            Build #${BUILD_NUMBER}
        </p>
    </div>
</body>
</html>
EOF

# Generate content hash from source files
CONTENT_HASH=$(cat Dockerfile nginx.conf index.html | sha256sum | cut -d' ' -f1 | cut -c1-12)
echo "Content hash: ${CONTENT_HASH}"

# Use content hash as primary tag, build number as secondary
export IMAGE_TAG="${IMAGE_TAG:-${BUILD_NUMBER}}"
CACHE_TAG="cache-${CONTENT_HASH}"

echo "Primary tag: ${IMAGE_TAG}"
echo "Cache tag: ${CACHE_TAG}"

# Login to ECR
echo ""
echo "Logging in to Amazon ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

# Check if image with this content hash already exists
echo ""
echo "Checking if image with content hash ${CONTENT_HASH} exists..."
if aws ecr describe-images \
    --repository-name ${ECR_REPOSITORY} \
    --image-ids imageTag=${CACHE_TAG} \
    --region ${AWS_REGION} 2>/dev/null | grep -q imageDigest; then
    
    echo "✅ Image with identical content already exists!"
    echo "Retagging existing image ${CACHE_TAG} as ${IMAGE_TAG}"
    
    # Get the manifest of the existing image
    MANIFEST=$(aws ecr batch-get-image \
        --repository-name ${ECR_REPOSITORY} \
        --image-ids imageTag=${CACHE_TAG} \
        --region ${AWS_REGION} \
        --output json | jq -r '.images[0].imageManifest')
    
    # Put the manifest with new tag
    aws ecr put-image \
        --repository-name ${ECR_REPOSITORY} \
        --image-tag ${IMAGE_TAG} \
        --image-manifest "$MANIFEST" \
        --region ${AWS_REGION}
    
    # Also tag as latest
    aws ecr put-image \
        --repository-name ${ECR_REPOSITORY} \
        --image-tag latest \
        --image-manifest "$MANIFEST" \
        --region ${AWS_REGION}
    
    echo ""
    echo "========================================="
    echo "✅ SUCCESS (Reused cached image)"
    echo "========================================="
    echo "Image tags:"
    echo "  ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
    echo "  ${ECR_REGISTRY}/${ECR_REPOSITORY}:${CACHE_TAG}"
    echo "  ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest"
    echo "========================================="
    exit 0
fi

echo "Image doesn't exist, building..."

# Pull latest image for layer cache
echo ""
echo "Pulling latest image for cache..."
docker pull ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest || echo "No previous image found, building from scratch"

# Build with cache
echo ""
echo "Building Docker image..."
docker build \
    --cache-from ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest \
    -t ${ECR_REPOSITORY}:${IMAGE_TAG} \
    -t ${ECR_REPOSITORY}:${CACHE_TAG} \
    -t ${ECR_REPOSITORY}:latest \
    .

# Tag for ECR
echo ""
echo "Tagging images for ECR..."
docker tag ${ECR_REPOSITORY}:${IMAGE_TAG} ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}
docker tag ${ECR_REPOSITORY}:${CACHE_TAG} ${ECR_REGISTRY}/${ECR_REPOSITORY}:${CACHE_TAG}
docker tag ${ECR_REPOSITORY}:latest ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest

# Push all tags
echo ""
echo "Pushing images to ECR..."
docker push ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}
docker push ${ECR_REGISTRY}/${ECR_REPOSITORY}:${CACHE_TAG}
docker push ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest

# Verify
echo ""
echo "Verifying images in ECR..."
aws ecr describe-images \
    --repository-name ${ECR_REPOSITORY} \
    --image-ids imageTag=${IMAGE_TAG} \
    --region ${AWS_REGION}

echo ""
echo "========================================="
echo "✅ SUCCESS (Built new image)"
echo "========================================="
echo "Image tags:"
echo "  ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
echo "  ${ECR_REGISTRY}/${ECR_REPOSITORY}:${CACHE_TAG}"
echo "  ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest"
echo "========================================="

# Cleanup local images
docker rmi ${ECR_REPOSITORY}:${IMAGE_TAG} || true
docker rmi ${ECR_REPOSITORY}:${CACHE_TAG} || true
docker rmi ${ECR_REPOSITORY}:latest || true
docker rmi ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG} || true
docker rmi ${ECR_REGISTRY}/${ECR_REPOSITORY}:${CACHE_TAG} || true
docker rmi ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest || true
