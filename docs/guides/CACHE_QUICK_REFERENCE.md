# Docker Image Caching - Quick Reference

## How It Works

```
Source Files → SHA256 Hash → Check ECR → Cache Hit/Miss
                                ↓              ↓
                           Retag Only    Full Build
                           (<30 sec)     (2-3 min)
```

## Content Hash Formula

```bash
CONTENT_HASH=$(cat Dockerfile nginx.conf index.html | sha256sum | cut -d' ' -f1 | cut -c1-12)
```

**Changes that trigger rebuild:**
- ✅ Dockerfile modifications
- ✅ nginx.conf changes
- ✅ index.html updates
- ❌ Build number changes (doesn't affect hash)
- ❌ Comments in files (affects hash)

## ECR Tag Strategy

| Tag Type | Format | Purpose | Example |
|----------|--------|---------|---------|
| Build Number | `{number}` | Track builds | `1`, `2`, `3` |
| Content Hash | `cache-{hash}` | Detect changes | `cache-a1b2c3d4e5f6` |
| Latest | `latest` | Current version | `latest` |

## Cache Behavior

### Cache Hit (No Changes)
```
✅ Image with identical content already exists!
Retagging existing image cache-a1b2c3d4e5f6 as 2
✅ SUCCESS (Reused cached image)
```
- Time: <30 seconds
- No Docker build
- ECR operations: 2 retag calls
- Cost: Minimal (API calls only)

### Cache Miss (Changes Detected)
```
Image doesn't exist, building...
Pulling latest image for cache...
Building Docker image...
✅ SUCCESS (Built new image)
```
- Time: 2-3 minutes
- Full Docker build
- ECR operations: 3 image pushes
- Cost: Build time + storage + transfer

## Commands

### Check ECR Images
```powershell
aws ecr describe-images --repository-name nginx-demo --region us-west-2 --output table
```

### Compare Image Digests
```powershell
# Check if two tags point to same image
$digest1 = aws ecr describe-images --repository-name nginx-demo --image-ids imageTag=1 --region us-west-2 --query 'imageDetails[0].imageDigest' --output text
$digest2 = aws ecr describe-images --repository-name nginx-demo --image-ids imageTag=2 --region us-west-2 --query 'imageDetails[0].imageDigest' --output text
if ($digest1 -eq $digest2) { Write-Host "Same image (cache hit)" } else { Write-Host "Different images" }
```

### List Cache Tags
```powershell
aws ecr describe-images --repository-name nginx-demo --region us-west-2 --query 'imageDetails[?contains(imageTags[0], `cache-`)].imageTags[0]' --output table
```

### Delete Old Cache Tags
```powershell
# Delete specific cache tag
aws ecr batch-delete-image --repository-name nginx-demo --image-ids imageTag=cache-a1b2c3d4e5f6 --region us-west-2

# Delete all cache tags older than 30 days (requires jq)
aws ecr describe-images --repository-name nginx-demo --region us-west-2 --query 'imageDetails[?contains(imageTags[0], `cache-`)]' | jq -r '.[] | select(.imagePushedAt < (now - 2592000)) | .imageTags[0]' | xargs -I {} aws ecr batch-delete-image --repository-name nginx-demo --image-ids imageTag={} --region us-west-2
```

## Performance Metrics

| Metric | Cache Hit | Cache Miss |
|--------|-----------|------------|
| Build Time | <30 sec | 2-3 min |
| Docker Build | No | Yes |
| ECR Pushes | 0 | 3 |
| Data Transfer | ~1 KB | ~50 MB |
| Cost Impact | ~$0.0001 | ~$0.01 |

## Troubleshooting

### Problem: Cache always misses
**Symptoms**: Every build shows "Built new image"
**Causes**:
- Dynamic content in source files (e.g., timestamps)
- File encoding changes (CRLF vs LF)
- Whitespace differences

**Fix**:
```bash
# Check what's being hashed
cat Dockerfile nginx.conf index.html | sha256sum

# Compare between builds
# Hash should be identical if content unchanged
```

### Problem: Wrong image reused
**Symptoms**: Old content appears in new builds
**Cause**: Cache tag collision (very rare with SHA256)

**Fix**:
```powershell
# Clear all cache tags and rebuild
aws ecr batch-delete-image --repository-name nginx-demo --image-ids $(aws ecr list-images --repository-name nginx-demo --region us-west-2 --query 'imageIds[?contains(imageTag, `cache-`)]' --output json) --region us-west-2
```

### Problem: ECR storage growing
**Symptoms**: Many cache tags accumulating
**Cause**: Each content change creates new cache tag

**Fix**: Implement lifecycle policy
```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep only last 10 cache tags",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["cache-"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
```

## Best Practices

1. **Include all source files in hash**
   - Dockerfile
   - Application code
   - Configuration files
   - Dependencies (package.json, requirements.txt)

2. **Exclude dynamic content**
   - Build numbers
   - Timestamps
   - Git commit SHAs (unless you want per-commit caching)

3. **Monitor cache hit rate**
   - Target: >70% cache hits
   - Low hit rate = too many content changes or hash too sensitive

4. **Clean up old cache tags**
   - Keep last 10-20 cache tags
   - Delete tags older than 30 days
   - Use ECR lifecycle policies

5. **Tag strategy**
   - Always tag with build number (traceability)
   - Always tag with content hash (caching)
   - Always tag as latest (convenience)

## Integration with CI/CD

### Jenkins Pipeline
```groovy
stage('Build Docker Image') {
    steps {
        script {
            // Content hash automatically calculated
            sh './build-script-cached.sh'
        }
    }
}
```

### GitHub Actions
```yaml
- name: Build Docker Image
  run: |
    chmod +x build-script-cached.sh
    ./build-script-cached.sh
  env:
    AWS_REGION: us-west-2
    IMAGE_TAG: ${{ github.run_number }}
```

## Cost Savings Example

**Scenario**: 100 builds/month, 50% cache hit rate

| Item | Without Cache | With Cache | Savings |
|------|---------------|------------|---------|
| Build Time | 300 min | 175 min | 42% |
| ECR Pushes | 300 | 150 | 50% |
| Data Transfer | 15 GB | 7.5 GB | 50% |
| Monthly Cost | $15 | $8 | $7/month |

**Annual savings**: ~$84 + developer time savings
