#!/bin/bash

echo "========================================="
echo "Testing Tele Role - Final Verification"
echo "========================================="
echo ""

# Login as admin
echo "1. Getting admin token..."
ADMIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@imu.com\",\"password\":\"admin123\"}")

ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# Login as Tele user
echo "2. Getting Tele user token..."
TELE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"teleuser@example.com\",\"password\":\"TelePass123!\"}")

TELE_TOKEN=$(echo $TELE_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TELE_TOKEN" ]; then
  echo "✗ FAIL: Could not get Tele user token"
  echo "Response: $TELE_RESPONSE"
  exit 1
fi

echo "✓ Admin and Tele tokens obtained"
echo ""

# Get a client ID for testing
echo "3. Getting a client ID for testing..."
CLIENTS_RESPONSE=$(curl -s http://localhost:3000/api/clients \
  -H "Authorization: Bearer $ADMIN_TOKEN")

CLIENT_ID=$(echo $CLIENTS_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$CLIENT_ID" ]; then
  echo "✗ FAIL: No clients found"
  exit 1
fi

echo "✓ Using client ID: $CLIENT_ID"
echo ""

# TEST 1: Admin can fetch Call touchpoints
echo "TEST 1: Admin fetching Call touchpoints"
CALLS_RESPONSE=$(curl -s "http://localhost:3000/api/touchpoints?type=Call&page=1&perPage=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$CALLS_RESPONSE" | grep -q '"items"'; then
  echo "✓ PASS: Admin can fetch Call touchpoints"
  CALL_COUNT=$(echo "$CALLS_RESPONSE" | grep -o '"totalItems":[0-9]*' | cut -d':' -f2)
  echo "  Found $CALL_COUNT Call touchpoints"
else
  echo "✗ FAIL: Admin could not fetch Call touchpoints"
fi
echo ""

# TEST 2: Tele user can fetch Call touchpoints
echo "TEST 2: Tele user fetching Call touchpoints"
TELE_CALLS=$(curl -s "http://localhost:3000/api/touchpoints?type=Call&page=1&perPage=10" \
  -H "Authorization: Bearer $TELE_TOKEN")

if echo "$TELE_CALLS" | grep -q '"items"'; then
  echo "✓ PASS: Tele user can fetch Call touchpoints"
else
  echo "✗ FAIL: Tele user could not fetch Call touchpoints"
fi
echo ""

# TEST 3: Tele user can create Call touchpoint #2
echo "TEST 3: Tele user creating Call touchpoint #2"
TELE_CALL_CREATE=$(curl -s -X POST http://localhost:3000/api/touchpoints \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TELE_TOKEN" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"touchpoint_number\": 2,
    \"type\": \"Call\",
    \"date\": \"2026-03-26\",
    \"reason\": \"Follow-up call\",
    \"status\": \"Undecided\"
  }")

if echo "$TELE_CALL_CREATE" | grep -q '"id"'; then
  echo "✓ PASS: Tele user created Call touchpoint"
  CALL_ID=$(echo "$TELE_CALL_CREATE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  Call ID: $CALL_ID"
else
  echo "✗ FAIL: Tele user could not create Call touchpoint"
  echo "Response: $(echo "$TELE_CALL_CREATE" | head -c 200)"
fi
echo ""

# TEST 4: Tele user cannot create Visit touchpoint
echo "TEST 4: Tele user trying to create Visit touchpoint (should fail)"
TELE_VISIT_ATTEMPT=$(curl -s -X POST http://localhost:3000/api/touchpoints \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TELE_TOKEN" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"touchpoint_number\": 1,
    \"type\": \"Visit\",
    \"date\": \"2026-03-26\",
    \"reason\": \"Trying Visit\",
    \"status\": \"Interested\"
  }")

if echo "$TELE_VISIT_ATTEMPT" | grep -qi "tele.*call.*only\|cannot.*create.*visit"; then
  echo "✓ PASS: Tele user correctly prevented from creating Visit"
else
  echo "✗ FAIL: Validation not working - Tele user could create Visit"
fi
echo ""

echo "========================================="
echo "Tele Role Verification Complete"
echo "========================================="
