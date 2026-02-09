#!/bin/bash
# Test nginx-api endpoints through API Gateway
# This script can be run standalone or as part of the Jenkins pipeline

set -e

API_GATEWAY_URL="https://79jzt0dapd.execute-api.us-west-2.amazonaws.com"
COGNITO_CLIENT_ID="5pc3u5as9anjs5vrp3vtblsfs6"
COGNITO_USERNAME="testuser@example.com"
COGNITO_PASSWORD="TestPass123!"
AWS_REGION="us-west-2"

echo "🧪 Testing nginx-api endpoints..."
echo ""

# Get Cognito access token
echo "🔑 Getting Cognito access token..."
TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id ${COGNITO_CLIENT_ID} \
  --auth-parameters USERNAME=${COGNITO_USERNAME},PASSWORD=${COGNITO_PASSWORD} \
  --region ${AWS_REGION} \
  --query 'AuthenticationResult.AccessToken' \
  --output text)

if [ -z "$TOKEN" ]; then
    echo "❌ Failed to get access token"
    exit 1
fi

echo "✅ Access token obtained"
echo ""

# Test /health endpoint
echo "📍 Testing GET /health..."
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer ${TOKEN}" \
  ${API_GATEWAY_URL}/health)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ /health returned 200"
    echo "   Response: $BODY"
else
    echo "❌ /health returned $HTTP_CODE"
    echo "   Response: $BODY"
    exit 1
fi
echo ""

# Test /api/info endpoint
echo "📍 Testing GET /api/info..."
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer ${TOKEN}" \
  ${API_GATEWAY_URL}/api/info)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ /api/info returned 200"
    echo "   Response: $BODY"
else
    echo "❌ /api/info returned $HTTP_CODE"
    echo "   Response: $BODY"
    exit 1
fi
echo ""

# Test /api/test endpoint (NEW!)
echo "📍 Testing GET /api/test..."
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer ${TOKEN}" \
  ${API_GATEWAY_URL}/api/test)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ /api/test returned 200"
    echo "   Response: $BODY"
else
    echo "❌ /api/test returned $HTTP_CODE"
    echo "   Response: $BODY"
    exit 1
fi
echo ""

# Test /api/echo endpoint
echo "📍 Testing POST /api/echo..."
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"test":"data","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
  ${API_GATEWAY_URL}/api/echo)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ /api/echo returned 200"
    echo "   Response: $BODY"
else
    echo "❌ /api/echo returned $HTTP_CODE"
    echo "   Response: $BODY"
    exit 1
fi
echo ""

echo "🎉 All endpoint tests passed!"
echo ""
echo "Tested endpoints:"
echo "  ✅ GET  /health"
echo "  ✅ GET  /api/info"
echo "  ✅ GET  /api/test"
echo "  ✅ POST /api/echo"
