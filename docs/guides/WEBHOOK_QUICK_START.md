# GitHub Webhook Quick Start

## 5-Minute Setup

### 1. Generate Webhook Secret

```bash
openssl rand -hex 32
```

**Save this secret!** You'll need it for both GitHub and Jenkins.

Store it in `access_details/CURRENT_ACCESS.md`:
```markdown
## GitHub Webhook Secret
<your-generated-secret>
```

### 2. Get Jenkins URL

```bash
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

Copy the output (e.g., `k8s-jenkins-jenkins-abc123-1234567890.us-west-2.elb.amazonaws.com`)

### 3. Add Webhook in GitHub

1. Go to: `https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses/settings/hooks`

2. Click **Add webhook**

3. Fill in:
   - **Payload URL**: `http://<YOUR_ALB_URL>/github-webhook/`
   - **Content type**: `application/json`
   - **Secret**: Paste the secret from step 1
   - **Events**: Just the push event
   - **Active**: ✓ Checked

4. Click **Add webhook**

### 4. Configure Jenkins to Validate Secret

Jenkins needs to be configured to validate the webhook secret. This requires the GitHub plugin configuration:

**Option A: Via Jenkins UI (Quick)**
1. Go to Jenkins → Manage Jenkins → Configure System
2. Find "GitHub" section
3. Add GitHub Server:
   - Name: `github`
   - API URL: `https://api.github.com`
   - Credentials: Add → Secret text → Paste your webhook secret
4. Save

**Option B: Via JCasC (Recommended for production)**

Add to `k8s/jenkins/agent-pod-template-configmap.yaml`:
```yaml
unclassified:
  githubpluginconfig:
    configs:
    - name: "github"
      apiUrl: "https://api.github.com"
      credentialsId: "github-webhook-secret"
```

Then create a Kubernetes secret:
```bash
kubectl create secret generic github-webhook-secret \
  --from-literal=secret=<YOUR_SECRET> \
  -n jenkins
```

### 5. Test It

```bash
# Make a change
echo "# Test" >> README.md

# Push
git add README.md
git commit -m "Test webhook"
git push

# Build should start within seconds!
```

### 6. Verify

In GitHub:
- Settings → Webhooks → Recent Deliveries
- Should see green checkmark ✓

In Jenkins:
- Check build history
- Build should show "Started by GitHub push"

## That's It!

Builds now trigger instantly when you push code. No more waiting!

**Full documentation:** [GitHub Webhook Setup Guide](GITHUB_WEBHOOK_SETUP.md)
