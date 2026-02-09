# Docker Image Caching Test Plan

## Overview
Test the intelligent Docker image caching system that uses content hashing to skip unnecessary rebuilds.

## How It Works
1. **Content Hash Generation**: Creates SHA256 hash from Dockerfile + nginx.conf + index.html
2. **Cache Check**: Queries ECR for image with tag `cache-{hash}`
3. **Cache Hit**: If found, retags existing image (no rebuild)
4. **Cache Miss**: If not found, builds new image and tags with both build number and content hash

## Test Scenarios

### Test 1: First Build (Cache Miss)
**Expected**: Full Docker build, creates new image with cache tag

**Steps**:
1. Create job `nginx-docker-build-cached` in Jenkins UI
2. Trigger build #1
3. Observe full Docker build process
4. Verify 3 tags created in ECR:
   - `1` (build number)
   - `cache-{hash}` (content hash)
   - `latest`

**Success Criteria**:
- Build completes successfully
- Console shows "Built new image"
- All 3 tags exist in ECR
- Build time: ~2-3 minutes

### Test 2: Identical Rebuild (Cache Hit)
**Expected**: No Docker build, reuses existing image

**Steps**:
1. Trigger build #2 immediately (no changes)
2. Observe cache detection
3. Verify retagging operation

**Success Criteria**:
- Build completes in <30 seconds
- Console shows "Reused cached image"
- Console shows "Image with identical content already exists"
- New tag `2` points to same image digest as `1`
- No Docker build steps executed

### Test 3: Content Change (Cache Miss)
**Expected**: Full Docker build with new cache tag

**Steps**:
1. Modify job configuration to change index.html content:
   - Change title from "Nginx Demo" to "Nginx Demo v2"
2. Trigger build #3
3. Observe new build

**Success Criteria**:
- Build completes successfully
- Console shows "Built new image"
- New cache tag created: `cache-{new-hash}`
- Build time: ~2-3 minutes
- Both old and new cache tags exist in ECR

### Test 4: Revert to Original (Cache Hit)
**Expected**: Reuses first build's cached image

**Steps**:
1. Revert index.html back to original
2. Trigger build #4
3. Observe cache hit on original hash

**Success Criteria**:
- Build completes in <30 seconds
- Console shows "Reused cached image"
- Tag `4` points to same digest as tag `1`
- Original cache tag reused

## Deployment Steps

### 1. Create Jenkins Job

**Option A: Via Jenkins UI** (Recommended)
```
1. Go to: http://jenkins-alb-2054832393.us-west-2.elb.amazonaws.com/
2. Login: admin / g3YVie94Ei61bVdGVHawnV
3. Click "New Item"
4. Name: nginx-docker-build-cached
5. Type: Freestyle project
6. Configure:
   - Restrict where: jenkins-agent
   - Add parameter: IMAGE_TAG (String, default: ${BUILD_NUMBER})
   - Build step: Execute shell
   - Copy content from job-config-cached.xml (the <command> section)
7. Save
```

**Option B: Via Jenkins CLI**
```powershell
Get-Content jenkins-jobs/nginx-docker-build/job-config-cached.xml | java -jar jenkins-cli.jar -s http://jenkins-alb-2054832393.us-west-2.elb.amazonaws.com/ -auth admin:g3YVie94Ei61bVdGVHawnV create-job nginx-docker-build-cached
```

### 2. Run Test Sequence

```powershell
# Test 1: First build
Write-Host "=== Test 1: First Build (Cache Miss) ===" -ForegroundColor Cyan
# Trigger via UI or:
# .\trigger-nginx-build.ps1

# Wait for completion, then check ECR
aws ecr list-images --repository-name nginx-demo --region us-west-2

# Test 2: Immediate rebuild
Write-Host "`n=== Test 2: Identical Rebuild (Cache Hit) ===" -ForegroundColor Cyan
# Trigger build #2
# Should complete in <30 seconds

# Test 3: Modify content
Write-Host "`n=== Test 3: Content Change (Cache Miss) ===" -ForegroundColor Cyan
# Edit job in Jenkins UI, change "Nginx Demo" to "Nginx Demo v2"
# Trigger build #3
# Should take ~2-3 minutes

# Test 4: Revert content
Write-Host "`n=== Test 4: Revert to Original (Cache Hit) ===" -ForegroundColor Cyan
# Edit job back to original
# Trigger build #4
# Should complete in <30 seconds
```

### 3. Verify Results

```powershell
# List all images with tags
aws ecr describe-images --repository-name nginx-demo --region us-west-2 --output table

# Check specific image by tag
aws ecr describe-images --repository-name nginx-demo --image-ids imageTag=1 --region us-west-2

# Compare image digests (should be same for cache hits)
aws ecr batch-get-image --repository-name nginx-demo --image-ids imageTag=1 imageTag=2 --region us-west-2 --query 'images[*].[imageId.imageTag, imageManifest]' --output json | jq -r '.[] | @json' | jq -r 'fromjson | [.[0], (.[1] | fromjson | .config.digest)] | @tsv'
```

## Expected Console Output

### Cache Miss (First Build)
```
Content hash: a1b2c3d4e5f6
Primary tag: 1
Cache tag: cache-a1b2c3d4e5f6
Checking if image with content hash a1b2c3d4e5f6 exists...
Image doesn't exist, building...
Pulling latest image for cache...
Building Docker image...
Step 1/6 : FROM nginx:alpine
...
✅ SUCCESS (Built new image)
```

### Cache Hit (Rebuild)
```
Content hash: a1b2c3d4e5f6
Primary tag: 2
Cache tag: cache-a1b2c3d4e5f6
Checking if image with content hash a1b2c3d4e5f6 exists...
✅ Image with identical content already exists!
Retagging existing image cache-a1b2c3d4e5f6 as 2
✅ SUCCESS (Reused cached image)
```

## Performance Metrics

| Scenario | Expected Time | Docker Build | ECR Operations |
|----------|--------------|--------------|----------------|
| Cache Miss | 2-3 minutes | Yes (full) | Push 3 tags |
| Cache Hit | <30 seconds | No | Retag only |
| Layer Cache | 1-2 minutes | Yes (partial) | Push 3 tags |

## Troubleshooting

### Issue: Cache always misses
**Cause**: Content hash changes unexpectedly
**Fix**: Check for dynamic content in files (e.g., ${BUILD_NUMBER} in Dockerfile)

### Issue: "jq: command not found"
**Cause**: jq not installed in Docker image
**Fix**: Add to Dockerfile: `RUN apk add --no-cache jq`

### Issue: ECR authentication fails
**Cause**: IAM role permissions
**Fix**: Verify jenkins-controller service account has ECR permissions

### Issue: Manifest not found
**Cause**: Image was deleted from ECR
**Fix**: Clear cache tags or rebuild from scratch

## Cleanup

```powershell
# Delete all images in ECR (optional)
aws ecr batch-delete-image --repository-name nginx-demo --image-ids $(aws ecr list-images --repository-name nginx-demo --region us-west-2 --query 'imageIds[*]' --output json) --region us-west-2

# Delete specific cache tags
aws ecr batch-delete-image --repository-name nginx-demo --image-ids imageTag=cache-a1b2c3d4e5f6 --region us-west-2
```

## Success Indicators

✅ First build creates cache tag
✅ Second build reuses cache (no Docker build)
✅ Content change triggers new build
✅ Reverting content reuses original cache
✅ Build time reduced by 80%+ on cache hits
✅ ECR contains multiple cache tags for different content versions

## Next Steps After Testing

1. Update existing `nginx-docker-build` job with cached version
2. Apply same pattern to other Docker build jobs
3. Consider implementing cache cleanup policy (delete old cache tags)
4. Monitor ECR storage costs (cache tags increase storage)
5. Document cache tag naming convention for team
