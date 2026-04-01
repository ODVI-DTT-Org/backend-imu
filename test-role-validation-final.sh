#!/bin/bash

echo "========================================="
echo "Testing Role-Based Touchpoint Validation"
echo "========================================="
echo ""

# Login as admin
echo "1. Getting admin and user tokens..."
ADMIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@imu.com","password":"admin123"}')

ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
ADMIN_ID=$(echo $ADMIN_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

# Login as Tele user
TELE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teleuser@example.com","password":"TelePass123!"}')

TELE_TOKEN=$(echo $TELE_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
TELE_ID=$(echo $TELE_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "Admin ID: $ADMIN_ID"
echo "Tele ID: $TELE_ID"
echo ""

# Get a client ID for testing
CLIENTS_RESPONSE=$(curl -s http://localhost:3000/api/clients \
  -H "Authorization: Bearer $ADMIN_TOKEN")

CLIENT_ID=$(echo $CLIENTS_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$CLIENT_ID" ]; then
  echo "Using client ID: $CLIENT_ID"
  echo ""
  
  # TEST 1: Admin creating Visit touchpoint (should succeed)
  echo "TEST 1: Admin creating Visit touchpoint #1"
  echo "Expected: SUCCESS (Admin can create any type)"
  ADMIN_VISIT=$(curl -s -X POST http://localhost:3000/api/touchpoints \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{
      \"client_id\": \"$CLIENT_ID\",
      \"user_id\": \"$ADMIN_ID\",
      \"touchpoint_number\": 1,
      \"type\": \"Visit\",
      \"date\": \"2026-03-26\",
      \"reason\": \"Initial visit\",
      \"status\": \"Interested\"
    }")
  
  if echo "$ADMIN_VISIT" | grep -q '"id"'; then
    echo "✓ PASS: Admin created Visit touchpoint"
  else
    echo "✗ FAIL: Admin could not create Visit touchpoint"
    echo "Response: $(echo "$ADMIN_VISIT" | head -c 150)"
  fi
  echo ""
  
  # TEST 2: Tele user trying to create Visit touchpoint (should fail)
  echo "TEST 2: Tele user creating Visit touchpoint #1"
  echo "Expected: FAIL (Tele users can only create Call touchpoints)"
  TELE_VISIT=$(curl -s -X POST http://localhost:3000/api/touchpoints \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TELE_TOKEN" \
    -d "{
      \"client_id\": \"$CLIENT_ID\",
      \"user_id\": \"$TELE_ID\",
      \"touchpoint_number\": 1,
      \"type\": \"Visit\",
      \"date\": \"2026-03-26\",
      \"reason\": \"Trying to create Visit\",
      \"status\": \"Interested\"
    }")
  
  if echo "$TELE_VISIT" | grep -qi "tele.*call.*only\|cannot.*create.*visit"; then
    echo "✓ PASS: Tele user correctly prevented from creating Visit"
    echo "Error: $(echo "$TELE_VISIT" | grep -o '"message":"[^"]*"')"
  else
    echo "✗ FAIL: Tele user was able to create Visit (validation broken)"
    echo "Response: $(echo "$TELE_VISIT" | head -c 150)"
  fi
  echo ""
  
  # TEST 3: Tele user creating Call touchpoint (should succeed)
  echo "TEST 3: Tele user creating Call touchpoint #2"
  echo "Expected: SUCCESS (Tele users can create Call touchpoints)"
  TELE_CALL=$(curl -s -X POST http://localhost:3000/api/touchpoints \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TELE_TOKEN" \
    -d "{
      \"client_id\": \"$CLIENT_ID\",
      \"user_id\": \"$TELE_ID\",
      \"touchpoint_number\": 2,
      \"type\": \"Call\",
      \"date\": \"2026-03-26\",
      \"reason\": \"Follow-up call\",
      \"status\": \"Undecided\"
    }")
  
  if echo "$TELE_CALL" | grep -q '"id"'; then
    echo "✓ PASS: Tele user created Call touchpoint successfully"
  else
    echo "✗ FAIL: Tele user could not create Call touchpoint"
    echo "Response: $(echo "$TELE_CALL" | head -c 150)"
  fi
  echo ""
  
  # TEST 4: Tele user trying to create Call at wrong position (should fail)
  echo "TEST 4: Tele user creating Call touchpoint #1 (wrong position)"
  echo "Expected: FAIL (Touchpoint #1 must be Visit)"
  TELE_CALL_WRONG=$(curl -s -X POST http://localhost:3000/api/touchpoints \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TELE_TOKEN" \
    -d "{
      \"client_id\": \"$CLIENT_ID\",
      \"user_id\": \"$TELE_ID\",
      \"touchpoint_number\": 1,
      \"type\": \"Call\",
      \"date\": \"2026-03-26\",
      \"reason\": \"Trying to create Call at wrong position\",
      \"status\": \"Interested\"
    }")
  
  if echo "$TELE_CALL_WRONG" | grep -qi "invalid.*touchpoint.*type\|expected.*visit"; then
    echo "✓ PASS: Correctly prevented Call at wrong position"
    echo "Error: $(echo "$TELE_CALL_WRONG" | grep -o '"message":"[^"]*"')"
  else
    echo "✗ FAIL: Sequence validation not working"
    echo "Response: $(echo "$TELE_CALL_WRONG" | head -c 150)"
  fi
  echo ""
fi

echo "========================================="
echo "Role-Based Validation Tests Completed"
echo "========================================="
