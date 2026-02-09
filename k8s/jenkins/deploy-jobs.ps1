# Deploy Jenkins jobs as ConfigMap (PowerShell version)
# This applies the Jenkins Configuration as Code (JCasC) for job definitions

Write-Host "🚀 Deploying Jenkins job configurations..." -ForegroundColor Cyan

# Apply the jobs ConfigMap
Write-Host "`n📝 Creating jenkins-casc-jobs ConfigMap..." -ForegroundColor Yellow
.\kubectl.exe apply -f k8s/jenkins/jobs-configmap.yaml

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create ConfigMap" -ForegroundColor Red
    exit 1
}

# Restart Jenkins to pick up the new configuration
Write-Host "`n🔄 Restarting Jenkins controller to load new jobs..." -ForegroundColor Yellow
.\kubectl.exe rollout restart statefulset/jenkins -n jenkins

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to restart Jenkins" -ForegroundColor Red
    exit 1
}

Write-Host "`n⏳ Waiting for Jenkins to restart..." -ForegroundColor Yellow
.\kubectl.exe rollout status statefulset/jenkins -n jenkins --timeout=5m

Write-Host "`n✅ Jenkins jobs deployed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Jobs will be created automatically by JCasC on startup" -ForegroundColor Cyan
Write-Host "Check Jenkins UI: http://k8s-jenkins-jenkins-b637b220e8-2120753307.us-west-2.elb.amazonaws.com" -ForegroundColor White
Write-Host ""
Write-Host "Expected jobs:" -ForegroundColor Yellow
Write-Host "  - nginx-api-build" -ForegroundColor White
Write-Host "  - nginx-docker-build" -ForegroundColor White
