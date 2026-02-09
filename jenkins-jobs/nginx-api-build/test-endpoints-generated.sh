#!/bin/bash
# Auto-generated integration tests from OpenAPI spec
# DO NOT EDIT MANUALLY - regenerate using generate-tests-from-openapi.js

set -e

# Configuration
API_GATEWAY_URL="${API_GATEWAY_URL:-https://79jzt0dapd.execute-api.us-west-2.amazonaws.com}"
COGNITO_CLIENT_ID="${COGNITO_CLIENT_ID:-5pc3u5as9anjs5vrp3vtblsfs6}"
COGNITO_USERNAME="${COGNITO_USERNAME:-testuser@example.com}"
COGNITO_PASSWORD="${COGNITO_PASSWORD:-TestPass123!}"

echo "🔐 Getting Cognito access token..."
TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id $COGNITO_CLIENT_ID \
  --auth-parameters USERNAME=$COGNITO_USERNAME,PASSWORD=$COGNITO_PASSWORD \
  --region us-west-2 \
  --query "AuthenticationResult.AccessToken" \
  --output text)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get access token"
  exit 1
fi

echo "✅ Got access token"
echo ""

# Test: Health check
echo "Testing GET /health..."
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_GATEWAY_URL/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ GET /health failed with status $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

echo "✅ GET /health - Status: $HTTP_CODE"
echo ""

# Test: Application information
echo "Testing GET /api/info..."
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_GATEWAY_URL/api/info")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ GET /api/info failed with status $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

echo "✅ GET /api/info - Status: $HTTP_CODE"
echo ""

# Test: Test endpoint
echo "Testing GET /api/test..."
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_GATEWAY_URL/api/test")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ GET /api/test failed with status $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

echo "✅ GET /api/test - Status: $HTTP_CODE"
echo ""

# Test: Echo endpoint
echo "Testing POST /api/echo..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"message":"Hello, World!","data":[1,2,3]}' "$API_GATEWAY_URL/api/echo")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ POST /api/echo failed with status $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

echo "✅ POST /api/echo - Status: $HTTP_CODE"
echo ""

# Test: List users
echo "Testing GET /api/users..."
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_GATEWAY_URL/api/users")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ GET /api/users failed with status $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

echo "✅ GET /api/users - Status: $HTTP_CODE"
echo ""

# Test: Create user
echo "Testing POST /api/users..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' "$API_GATEWAY_URL/api/users")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "201" ]; then
  echo "❌ POST /api/users failed with status $HTTP_CODE"
  echo "Response: $BODY"
  exit 1
fi

echo "✅ POST /api/users - Status: $HTTP_CODE"
echo ""

echo "🎉 All tests passed!"
