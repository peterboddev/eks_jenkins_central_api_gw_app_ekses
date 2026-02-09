# Create nginx-docker-build-cached Job

## Quick Steps

1. **Access Jenkins**
   - URL: http://jenkins-alb-2054832393.us-west-2.elb.amazonaws.com/
   - Username: `admin`
   - Password: `g3YVie94Ei61bVdGVHawnV`

2. **Create New Job**
   - Click "New Item" (top left)
   - Name: `nginx-docker-build-cached`
   - Type: Select "Freestyle project"
   - Click "OK"

3. **Configure Job**

   **General Section:**
   - Description: `Build nginx Docker image with intelligent caching - skips rebuild if content unchanged`
   - ✅ Check "This project is parameterized"
   - Add parameter: String Parameter
     - Name: `IMAGE_TAG`
     - Default Value: `${BUILD_NUMBER}`
     - Description: `Docker image tag (default: build number)`

   **Build Environment:**
   - ✅ Check "Restrict where this project can be run"
   - Label Expression: `jenkins-agent`

   **Build Section:**
   - Click "Add build step" → "Execute shell"
   - Copy the entire script from `jenkins-jobs/nginx-docker-build/job-config-cached.xml`
   - Paste into the "Command" text area
   - (The script starts with `#!/bin/bash` and ends with cleanup commands)

4. **Save**
   - Click "Save" at the bottom

## Script to Copy

Open `jenkins-jobs/nginx-docker-build/job-config-cached.xml` and copy everything between:
```xml
<command>
#!/bin/bash
...
(entire script)
...
</command>
```

Or use the content from `jenkins-jobs/nginx-docker-build/build-script-cached.sh`

## Verify Job Created

After saving, you should see:
- Job appears in Jenkins dashboard
- Job URL: http://jenkins-alb-2054832393.us-west-2.elb.amazonaws.com/job/nginx-docker-build-cached/
- "Build with Parameters" option available

## Run First Test

1. Click "Build with Parameters"
2. Leave IMAGE_TAG as default (${BUILD_NUMBER})
3. Click "Build"
4. Watch console output: http://jenkins-alb-2054832393.us-west-2.elb.amazonaws.com/job/nginx-docker-build-cached/1/console

Expected first build output:
```
Content hash: a1b2c3d4e5f6
Checking if image with content hash a1b2c3d4e5f6 exists...
Image doesn't exist, building...
Building Docker image...
✅ SUCCESS (Built new image)
```

## Run Second Test (Cache Hit)

1. Click "Build with Parameters" again
2. Click "Build"
3. Watch console output for build #2

Expected second build output:
```
Content hash: a1b2c3d4e5f6
✅ Image with identical content already exists!
Retagging existing image cache-a1b2c3d4e5f6 as 2
✅ SUCCESS (Reused cached image)
```

Build #2 should complete in <30 seconds (vs 2-3 minutes for build #1)

## Next Steps

Once job is created and first build succeeds:
1. Run the automated test script: `.\test-docker-cache.ps1`
2. Or manually follow the test plan in `DOCKER_CACHE_TEST_PLAN.md`
