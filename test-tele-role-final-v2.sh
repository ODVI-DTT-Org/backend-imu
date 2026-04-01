#!/bin/bash

echo "========================================="
echo "Testing Tele Role - Final Verification v2"
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

# Get next touchpoint number
echo "4. Getting next touchpoint number..."
NEXT_TP_RESPONSE=$(curl -s "http://localhost:3000/api/touchpoints/next/$CLIENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

NEXT_TP=$(echo $NEXT_TP_RESPONSE | grep -o '"nextTouchpointNumber":[0-9]*' | cut -d':' -f2)

if [ -z "$NEXT_TP" ]; then
  echo "✗ Could not get next touchpoint number"
  NEXT_TP=1
else
  echo "✓ Next touchpoint number: $NEXT_TP"
fi
echo ""

# Get expected type for this touchpoint number
case $NEXT_TP in
  1|4|7) EXPECTED_TYPE="Visit" ;;
  2|3|5|6) EXPECTED_TYPE="Call" ;;
  *) EXPECTED_TYPE="Unknown" ;;
esac

echo "Expected type for touchpoint #$NEXT_TP: $EXPECTED_TYPE"
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

# TEST 3: Role-based validation based on next touchpoint
echo "TEST 3: Testing role-based touchpoint validation"

if [ "$EXPECTED_TYPE" = "Call" ]; then
  echo "  Next touchpoint is Call - testing Tele user creation"
  TELE_CALL_CREATE=$(curl -s -X POST http://localhost:3000/api/touchpoints \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TELE_TOKEN" \
    -d "{
      \"client_id\": \"$CLIENT_ID\",
      \"touchpoint_number\": $NEXT_TP,
      \"type\": \"Call\",
      \"date\": \"2026-03-26\",
      \"reason\": \"Follow-up call\",
      \"status\": \"Undecided\"
    }")

  if echo "$TELE_CALL_CREATE" | grep -q '"id"'; then
    echo "✓ PASS: Tele user created Call touchpoint #$NEXT_TP"
    CALL_ID=$(echo "$TELE_CALL_CREATE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  Call ID: $CALL_ID"
  else
    echo "✗ FAIL: Tele user could not create Call touchpoint"
    echo "Response: $(echo "$TELE_CALL_CREATE" | head -c 300)"
  fi
else
  echo "  Next touchpoint is Visit - testing that Tele user is blocked"
  TELE_VISIT_ATTEMPT=$(curl -s -X POST http://localhost:3000/api/touchpoints \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TELE_TOKEN" \
    -d "{
      \"client_id\": \"$CLIENT_ID\",
      \"touchpoint_number\": $NEXT_TP,
      \"type\": \"Visit\",
      \"date\": \"2026-03-26\",
      \"reason\": \"Trying Visit\",
      \"status\": \"Interested\"
    }")

  if echo "$TELE_VISIT_ATTEMPT" | grep -qi "tele.*call.*only\|INVALID_TOUCHPOINT_TYPE_FOR_ROLE"; then
    echo "✓ PASS: Tele user correctly prevented from creating Visit"
    echo "Error message: $(echo "$TELE_VISIT_ATTEMPT" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"
  else
    echo "✗ FAIL: Tele user was able to create Visit (validation broken)"
    echo "Response: $(echo "$TELE_VISIT_ATTEMPT" | head -c 300)"
  fi
fi
echo ""

# TEST 4: Admin can create any touchpoint type
echo "TEST 4: Testing admin can create any touchpoint type"
if [ "$NEXT_TP" -le 7 ]; then
  ADMIN_CREATE=$(curl -s -X POST http://localhost:3000/api/touchpoints \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{
      \"client_id\": \"$CLIENT_ID\",
      \"touchpoint_number\": $NEXT_TP,
      \"type\": \"$EXPECTED_TYPE\",
      \"date\": \"2026-03-26\",
      \"reason\": \"Admin creating $EXPECTED_TYPE\",
      \"status\": \"Interested\"
    }")

  if echo "$ADMIN_CREATE" | grep -q '"id"'; then
    echo "✓ PASS: Admin created $EXPECTED_TYPE touchpoint #$NEXT_TP"
  else
    echo "✗ FAIL: Admin could not create touchpoint"
    echo "Response: $(echo "$ADMIN_CREATE" | head -c 300)"
  fi
else
  echo "⊘ SKIP: All 7 touchpoints completed for this client"
fi
echo ""

echo "========================================="
echo "Tele Role Verification Complete"
echo "========================================="
