# GitHub Webhook Quick Start

## 5-Minute Setup

### 1. Get Jenkins URL

```bash
kubectl get ingress jenkins -n jenkins -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

Copy the output (e.g., `k8s-jenkins-jenkins-abc123-1234567890.us-west-2.elb.amazonaws.com`)

### 2. Add Webhook in GitHub

1. Go to: `https://github.com/peterboddev/eks_jenkins_central_api_gw_app_ekses/settings/hooks`

2. Click **Add webhook**

3. Fill in:
   - **Payload URL**: `http://<YOUR_ALB_URL>/github-webhook/`
   - **Content type**: `application/json`
   - **Events**: Just the push event
   - **Active**: ✓ Checked

4. Click **Add webhook**

### 3. Test It

```bash
# Make a change
echo "# Test" >> README.md

# Push
git add README.md
git commit -m "Test webhook"
git push

# Build should start within seconds!
```

### 4. Verify

In GitHub:
- Settings → Webhooks → Recent Deliveries
- Should see green checkmark ✓

In Jenkins:
- Check build history
- Build should show "Started by GitHub push"

## That's It!

Builds now trigger instantly when you push code. No more waiting!

**Full documentation:** [GitHub Webhook Setup Guide](GITHUB_WEBHOOK_SETUP.md)
