# Step-by-Step Jenkins Job Setup Guide

## You Are Here: Step 3 - Configure

Follow these exact steps to configure your Jenkins job:

---

## Step 1: General Configuration

In the Jenkins job configuration page, you should see several sections. Start from the top:

### 1.1 Description (Optional)
In the "Description" text box, enter:
```
Build nginx Docker image and push to Amazon ECR
```

---

## Step 2: General Section - Add Parameter

### 2.1 Check "This project is parameterized"
- Look for a checkbox that says **"This project is parameterized"**
- ✅ Check this box
- A new section will appear below

### 2.2 Click "Add Parameter" button
- Click the **"Add Parameter"** dropdown button
- Select **"String Parameter"** from the dropdown

### 2.3 Configure the String Parameter
You'll see three fields:
- **Name**: Enter `IMAGE_TAG`
- **Default Value**: Enter `${BUILD_NUMBER}`
- **Description**: Enter `Docker image tag (defaults to build number)`

---

## Step 3: Build Environment Section

Scroll down to the **"Build Environment"** section.

### 3.1 Restrict where this project can be run
- ✅ Check the box: **"Restrict where this project can be run"**
- A new field "Label Expression" will appear
- **Label Expression**: Enter `jenkins-agent`

This ensures the job runs on agent nodes (spot instances), not the controller.

---

## Step 4: Build Section - THIS IS WHERE YOU ADD THE SCRIPT

Scroll down to the **"Build"** section.

### 4.1 Click "Add build step"
- Click the **"Add build step"** dropdown button
- Select **"Execute shell"** from the dropdown

### 4.2 Copy the Shell Script
A large text box labeled **"Command"** will appear. This is where you paste the script.

**Copy the entire script below** (starts with `#!/bin/bash` and ends with `docker rmi`):

```bash
#!/bin/bash
set -e

# Environment variables
export AWS_REGION=us-west-2
export AWS_ACCOUNT_ID=450683699755
export ECR_REPOSITORY=nginx-demo
export ECR_REGISTRY=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
export IMAGE_TAG=${IMAGE_TAG:-${BUILD_NUMBER}}

echo "========================================="
echo "Building Nginx Docker Image"
echo "========================================="
echo "Repository: ${ECR_REPOSITORY}"
echo "Tag: ${IMAGE_TAG}"
echo "Registry: ${ECR_REGISTRY}"
echo "========================================="

# Create Dockerfile
cat > Dockerfile <<'EOF'
FROM nginx:alpine

# Add custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Add custom index.html
COPY index.html /usr/share/nginx/html/index.html

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Run nginx
CMD ["nginx", "-g", "daemon off;"]
EOF

# Create nginx.conf
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

# Create index.html
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

echo ""
echo "Step 1: Building Docker image..."
docker build -t ${ECR_REPOSITORY}:${IMAGE_TAG} .
docker tag ${ECR_REPOSITORY}:${IMAGE_TAG} ${ECR_REPOSITORY}:latest

echo ""
echo "Step 2: Logging in to Amazon ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

echo ""
echo "Step 3: Tagging image for ECR..."
docker tag ${ECR_REPOSITORY}:${IMAGE_TAG} ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}
docker tag ${ECR_REPOSITORY}:latest ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest

echo ""
echo "Step 4: Pushing image to ECR..."
docker push ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}
docker push ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest

echo ""
echo "Step 5: Verifying image in ECR..."
aws ecr describe-images \
    --repository-name ${ECR_REPOSITORY} \
    --image-ids imageTag=${IMAGE_TAG} \
    --region ${AWS_REGION}

echo ""
echo "========================================="
echo "✅ SUCCESS!"
echo "========================================="
echo "Image pushed to:"
echo "  ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"
echo "  ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest"
echo "========================================="

# Cleanup
docker rmi ${ECR_REPOSITORY}:${IMAGE_TAG} || true
docker rmi ${ECR_REPOSITORY}:latest || true
docker rmi ${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG} || true
docker rmi ${ECR_REGISTRY}/${ECR_REPOSITORY}:latest || true
```

### 4.3 Paste the Script
- Click inside the **"Command"** text box
- Press `Ctrl+A` to select all (if there's any default text)
- Press `Ctrl+V` to paste the script you just copied
- The text box should now contain the entire bash script

---

## Step 5: Save the Job

### 5.1 Scroll to the bottom
- Scroll all the way down to the bottom of the page

### 5.2 Click "Save"
- Click the blue **"Save"** button at the bottom

---

## Step 6: Run the Build

You'll be redirected to the job's main page.

### 6.1 Click "Build Now"
- On the left sidebar, click **"Build Now"**
- A new build will appear in the "Build History" section (usually #1)

### 6.2 Watch the Build
- Click on the build number (e.g., **#1**)
- Click **"Console Output"** to see the live build log

### 6.3 Wait for Autoscaling (First Build Only)
The first build will take 2-5 minutes because:
1. Job is queued (no agent available)
2. Cluster Autoscaler detects pending pod
3. New spot instance is provisioned
4. Agent pod starts on new node
5. Build begins execution

Subsequent builds will be faster if agent nodes are still running.

---

## What You Should See

### In Console Output:
```
Started by user admin
Running as SYSTEM
Building remotely on jenkins-agent-xyz (jenkins-agent) in workspace /home/jenkins/workspace/nginx-docker-build
[nginx-docker-build] $ /bin/bash /tmp/jenkins123.sh
=========================================
Building Nginx Docker Image
=========================================
Repository: nginx-demo
Tag: 1
Registry: 450683699755.dkr.ecr.us-west-2.amazonaws.com
=========================================

Step 1: Building Docker image...
[+] Building 2.3s (8/8) FINISHED
...

Step 2: Logging in to Amazon ECR...
Login Succeeded

Step 3: Tagging image for ECR...

Step 4: Pushing image to ECR...
The push refers to repository [450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-demo]
...
1: digest: sha256:abc123... size: 1234

Step 5: Verifying image in ECR...
{
    "imageDetails": [...]
}

=========================================
✅ SUCCESS!
=========================================
Image pushed to:
  450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-demo:1
  450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-demo:latest
=========================================

Finished: SUCCESS
```

---

## Troubleshooting

### "Cannot find the 'Command' text box"
- Make sure you clicked **"Add build step"** → **"Execute shell"**
- The text box should appear right after you select "Execute shell"

### "The script is too long to paste"
- The script is about 200 lines - this is normal
- Make sure you copied the ENTIRE script from `#!/bin/bash` to the last `docker rmi` line
- You can paste it in chunks if needed, but make sure nothing is missing

### "Build is stuck in queue"
- This is normal for the first build
- Wait 2-5 minutes for the autoscaler to provision a new agent node
- Watch the progress: `kubectl get nodes -w` in a terminal

### "Build failed with Docker error"
- The agent pod needs Docker installed
- Check if Docker is available: The default Jenkins agent should have Docker
- If not, you may need to use a Docker-enabled agent image

---

## Summary of Configuration

Here's what you configured:

| Section | Setting | Value |
|---------|---------|-------|
| **Description** | Job description | Build nginx Docker image and push to Amazon ECR |
| **Parameters** | String Parameter | IMAGE_TAG = ${BUILD_NUMBER} |
| **Build Environment** | Label Expression | jenkins-agent |
| **Build** | Execute shell | [200-line bash script] |

---

## Next Steps After Successful Build

1. ✅ Verify image in ECR:
   ```powershell
   aws ecr list-images --repository-name nginx-demo --region us-west-2
   ```

2. ✅ Pull and test locally:
   ```powershell
   aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin 450683699755.dkr.ecr.us-west-2.amazonaws.com
   docker pull 450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-demo:latest
   docker run -d -p 8080:80 450683699755.dkr.ecr.us-west-2.amazonaws.com/nginx-demo:latest
   ```

3. ✅ Deploy to Kubernetes (optional)

---

## Need Help?

If you're still stuck, let me know which step you're on and what you see on your screen!
