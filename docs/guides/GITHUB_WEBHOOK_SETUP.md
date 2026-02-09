# GitHub Webhook Setup for Jenkins

## Overview

Instead of Jenkins polling GitHub every 5 minutes, we use **GitHub webhooks** to trigger builds instantly when you push code. This is more efficient and provides immediate feedback.

## Architecture

```
┌─────────────────┐
│  GitHub Repo    │
│  (push event)   │
└────────┬────────┘
         │
         │ Webhook POST
         │ https://<JENKINS_URL>/github-webhook/
         ▼
┌─────────────────┐
│  AWS ALB        │
│  (internet-     │
│   facing)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Jenkins        │
│  Service        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Build Triggered│
│  Instantly!     │
└─────────────────┘
```

## Prerequisites

1. **Jenkins deployed with ALB ingress** (already configured in `k8s/jenkins/ingress.yaml`)
2. **GitHub repository** (already set up: `https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses`)
3. **Jenkins accessible from internet** (via ALB)

## Step 1: Get Jenkins URL

After deploying Jenkins, get the ALB URL:

```bash
# Get the ALB URL
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

Example output:
```
k8s-jenkins-jenkins-abc123def456-1234567890.us-west-2.elb.amazonaws.com
```

Your Jenkins URL will be:
```
http://k8s-jenkins-jenkins-abc123def456-1234567890.us-west-2.elb.amazonaws.com
```

## Step 2: Configure GitHub Webhook

### Generate Webhook Secret (Required)

```bash
# Generate a secure random secret
openssl rand -hex 32
```

**Important**: Save this secret securely! You'll need it for both GitHub and Jenkins.

Store it in `access_details/CURRENT_ACCESS.md` (gitignored):
```markdown
## GitHub Webhook Secret
<your-generated-secret-here>
```

### In GitHub Repository Settings:

1. Go to your repository: `https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses`

2. Click **Settings** → **Webhooks** → **Add webhook**

3. Configure the webhook:

   **Payload URL:**
   ```
   http://<YOUR_JENKINS_ALB_URL>/github-webhook/
   ```
   
   Example:
   ```
   http://k8s-jenkins-jenkins-abc123def456-1234567890.us-west-2.elb.amazonaws.com/github-webhook/
   ```

   **Content type:**
   ```
   application/json
   ```

   **Secret:** (REQUIRED for security)
   ```
   <paste your generated secret from above>
   ```

   **Which events would you like to trigger this webhook?**
   ```
   ☑ Just the push event
   ```

   **Active:**
   ```
   ☑ Active
   ```

4. Click **Add webhook**

## Step 3: Configure Jenkins to Validate Secret

Jenkins must be configured to validate the webhook secret. Without this, the secret provides no security benefit.

### Option A: Via Jenkins UI (Quick Setup)

1. Go to Jenkins → **Manage Jenkins** → **Configure System**
2. Scroll to **GitHub** section
3. Click **Add GitHub Server**
4. Configure:
   - **Name**: `github`
   - **API URL**: `https://api.github.com`
   - **Credentials**: Click **Add** → **Jenkins**
     - **Kind**: Secret text
     - **Secret**: Paste your webhook secret
     - **ID**: `github-webhook-secret`
     - **Description**: GitHub webhook secret
   - Click **Add**
5. Select the credential you just created
6. Click **Test connection** to verify
7. Click **Save**

### Option B: Via JCasC (Recommended for Production)

This approach stores the configuration as code and is more maintainable.

**1. Create Kubernetes Secret:**

```bash
# Replace <YOUR_SECRET> with your generated secret
kubectl create secret generic github-webhook-secret \
  --from-literal=secret=<YOUR_SECRET> \
  -n jenkins
```

**2. Update Jenkins ConfigMap:**

Add to `k8s/jenkins/agent-pod-template-configmap.yaml`:

```yaml
unclassified:
  githubpluginconfig:
    configs:
    - name: "github"
      apiUrl: "https://api.github.com"
      credentialsId: "github-webhook-secret"
      manageHooks: true

credentials:
  system:
    domainCredentials:
    - credentials:
      - string:
          id: "github-webhook-secret"
          secret: "${GITHUB_WEBHOOK_SECRET}"
          description: "GitHub webhook secret for validating webhook requests"
```

**3. Mount the secret in StatefulSet:**

Update `k8s/jenkins/statefulset.yaml` to add environment variable:

```yaml
env:
- name: GITHUB_WEBHOOK_SECRET
  valueFrom:
    secretKeyRef:
      name: github-webhook-secret
      key: secret
```

**4. Apply changes:**

```bash
kubectl apply -f k8s/jenkins/agent-pod-template-configmap.yaml
kubectl apply -f k8s/jenkins/statefulset.yaml
kubectl rollout restart statefulset/jenkins-controller -n jenkins
```

## Step 4: Verify Webhook

### Test the Webhook

1. In GitHub, go to **Settings** → **Webhooks**
2. Click on your webhook
3. Scroll down to **Recent Deliveries**
4. Click **Redeliver** to test

You should see:
- ✅ Green checkmark = Success (200 response)
- ❌ Red X = Failed (check Jenkins logs)

### Test with a Real Push

```bash
# Make a small change
echo "# Test webhook" >> README.md

# Commit and push
git add README.md
git commit -m "Test webhook trigger"
git push
```

**Expected behavior:**
- GitHub sends webhook immediately
- Jenkins receives webhook
- Build starts within seconds
- No 5-minute wait!

## Step 5: Monitor Webhook Activity

### In GitHub

**Settings** → **Webhooks** → Click your webhook → **Recent Deliveries**

You'll see:
- Request headers
- Request payload
- Response from Jenkins
- Delivery status

### In Jenkins

**Job** → **Build History** → Check build was triggered by "GitHub push"

## Troubleshooting

### Webhook Shows Failed (Red X)

**Check Jenkins is accessible:**
```bash
# From your local machine
curl -I http://<JENKINS_ALB_URL>/github-webhook/

# Should return HTTP 200 or 302
```

**Check ALB security group:**
- Ensure ALB allows inbound traffic from GitHub IPs
- Current config allows GitHub webhook IPs (see `inbound-cidrs` in ingress.yaml)

**Check Jenkins logs:**
```bash
kubectl logs -n jenkins jenkins-controller-0 | grep -i webhook
```

### Builds Not Triggering

**Verify job configuration:**
```bash
# Check jobs ConfigMap has githubPush trigger
kubectl get configmap jenkins-casc-jobs -n jenkins -o yaml | grep -A5 triggers
```

Should show:
```yaml
triggers {
  githubPush()
}
```

**Restart Jenkins to reload config:**
```bash
kubectl rollout restart statefulset/jenkins-controller -n jenkins
```

### GitHub Can't Reach Jenkins

**Check ALB is internet-facing:**
```bash
kubectl get ingress jenkins -n jenkins -o yaml | grep scheme
```

Should show:
```yaml
alb.ingress.kubernetes.io/scheme: internet-facing
```

**Get ALB DNS name:**
```bash
kubectl get ingress jenkins -n jenkins
```

**Test from external network:**
```bash
curl -I http://<ALB_URL>/github-webhook/
```

## Security Considerations

### Current Setup (With Secret - Recommended)

- ✅ ALB restricts inbound traffic to GitHub IP ranges
- ✅ Jenkins behind ALB (not directly exposed)
- ✅ Webhook secret validates requests are from GitHub
- ✅ Prevents unauthorized build triggers
- ✅ Production-ready security

**How it works:**
1. GitHub signs each webhook request with your secret using HMAC-SHA256
2. Signature is sent in `X-Hub-Signature-256` header
3. Jenkins validates the signature matches
4. If signature is invalid, request is rejected

### Without Secret (NOT Recommended)

- ⚠️ Anyone with Jenkins URL can trigger builds
- ⚠️ No way to verify requests are from GitHub
- ⚠️ Potential for abuse and resource exhaustion
- ❌ Not suitable for production

### Recommended: Use HTTPS

For production, configure HTTPS:

1. **Get a domain name** (e.g., `jenkins.example.com`)

2. **Create ACM certificate** in AWS

3. **Update ingress.yaml:**
   ```yaml
   annotations:
     alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS": 443}]'
     alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...
   ```

4. **Update GitHub webhook URL:**
   ```
   https://jenkins.example.com/github-webhook/
   ```

## Configuration Files

### jobs-configmap.yaml (Updated)

```yaml
triggers {
  githubPush()  # ← Webhook trigger instead of polling
}
```

**Before (polling):**
```yaml
triggers {
  scm('H/5 * * * *')  # Poll every 5 minutes
}
```

**After (webhook):**
```yaml
triggers {
  githubPush()  # Instant trigger on push
}
```

### ingress.yaml

Already configured with:
- ✅ Internet-facing ALB
- ✅ GitHub IP ranges allowed
- ✅ Health check configured
- ✅ Path routing to Jenkins service

## Benefits of Webhooks

### ✅ Instant Builds
- No waiting for polling interval
- Builds start within seconds of push
- Faster feedback loop

### ✅ Reduced Load
- No constant polling requests
- Jenkins doesn't hammer GitHub API
- More efficient resource usage

### ✅ Better Developer Experience
- Push code → See build immediately
- Faster CI/CD pipeline
- Immediate feedback on failures

## Webhook Payload Example

When you push to GitHub, it sends:

```json
{
  "ref": "refs/heads/master",
  "repository": {
    "name": "eks_jenkins_central_api_gw_app_ekses",
    "full_name": "peterboddev/eks_jenkins_central_api_gw_app_ekses",
    "clone_url": "https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses.git"
  },
  "pusher": {
    "name": "peterboddev"
  },
  "commits": [
    {
      "id": "abc123...",
      "message": "Update application",
      "author": {
        "name": "Peter"
      }
    }
  ]
}
```

Jenkins receives this and:
1. Identifies the repository
2. Finds matching jobs
3. Triggers builds for those jobs

## Quick Setup Checklist

- [ ] Deploy Jenkins with ALB ingress
- [ ] Get ALB URL from kubectl
- [ ] Add webhook in GitHub repository settings
- [ ] Set payload URL to `http://<ALB_URL>/github-webhook/`
- [ ] Select "Just the push event"
- [ ] Save webhook
- [ ] Test with a push
- [ ] Verify build triggers instantly

## Summary

**Webhook setup:**
1. Jenkins already configured for webhooks (`githubPush()` trigger)
2. ALB already allows GitHub IPs
3. Just need to add webhook in GitHub settings
4. Builds will trigger instantly on push

**No more polling!** 🎉
