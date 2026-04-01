#!/bin/bash

echo "========================================="
echo "Testing Touchpoint Role Validation"
echo "========================================="
echo ""

# Login as admin
echo "1. Getting admin token..."
ADMIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@imu.com","password":"admin123"}')

ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo "Admin token received"
echo ""

# Login as Tele user
echo "2. Getting Tele user token..."
TELE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teleuser@example.com","password":"TelePass123!"}')

TELE_TOKEN=$(echo $TELE_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo "Tele token received"
echo ""

# Get a client ID for testing
echo "3. Getting a client ID for testing..."
CLIENTS_RESPONSE=$(curl -s http://localhost:3000/api/clients \
  -H "Authorization: Bearer $ADMIN_TOKEN")

CLIENT_ID=$(echo $CLIENTS_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$CLIENT_ID" ]; then
  echo "Using client ID: $CLIENT_ID"
  echo ""
  
  # Test 1: Admin creating Visit touchpoint (should succeed)
  echo "4. TEST 1: Admin creating Visit touchpoint #1 (SHOULD SUCCEED)"
  ADMIN_VISIT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/touchpoints \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -d "{
      \"client_id\": \"$CLIENT_ID\",
      \"touchpoint_number\": 1,
      \"type\": \"VISIT\",
      \"date\": \"2026-03-26\",
      \"reason\": \"Interested\",
      \"status\": \"Interested\"
    }")
  
  if echo "$ADMIN_VISIT_RESPONSE" | grep -q "id"; then
    echo "✓ Admin created Visit touchpoint successfully"
  else
    echo "✗ Admin failed to create Visit touchpoint"
    echo "Response: $ADMIN_VISIT_RESPONSE" | head -c 200
  fi
  echo ""
  
  # Test 2: Tele user trying to create Visit touchpoint (should fail)
  echo "5. TEST 2: Tele user creating Visit touchpoint #1 (SHOULD FAIL)"
  TELE_VISIT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/touchpoints \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TELE_TOKEN" \
    -d "{
      \"client_id\": \"$CLIENT_ID\",
      \"touchpoint_number\": 1,
      \"type\": \"VISIT\",
      \"date\": \"2026-03-26\",
      \"reason\": \"Interested\",
      \"status\": \"Interested\"
    }")
  
  if echo "$TELE_VISIT_RESPONSE" | grep -qi "tele.*call.*only\|cannot.*create.*visit\|invalid.*role"; then
    echo "✓ Tele user correctly prevented from creating Visit touchpoint"
    echo "Error message: $(echo "$TELE_VISIT_RESPONSE" | grep -o '"message":"[^"]*"')"
  else
    echo "✗ Tele user was able to create Visit touchpoint (validation not working)"
    echo "Response: $TELE_VISIT_RESPONSE" | head -c 200
  fi
  echo ""
  
  # Test 3: Tele user creating Call touchpoint (should succeed if validation allows)
  echo "6. TEST 3: Tele user creating Call touchpoint #2 (SHOULD SUCCEED)"
  TELE_CALL_RESPONSE=$(curl -s -X POST http://localhost:3000/api/touchpoints \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TELE_TOKEN" \
    -d "{
      \"client_id\": \"$CLIENT_ID\",
      \"touchpoint_number\": 2,
      \"type\": \"CALL\",
      \"date\": \"2026-03-26\",
      \"reason\": \"Follow-up\",
      \"status\": \"Undecided\"
    }")
  
  if echo "$TELE_CALL_RESPONSE" | grep -q "id"; then
    echo "✓ Tele user created Call touchpoint successfully"
    CALL_ID=$(echo "$TELE_CALL_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "Call touchpoint ID: $CALL_ID"
  else
    echo "✗ Tele user failed to create Call touchpoint"
    echo "Response: $TELE_CALL_RESPONSE" | head -c 200
  fi
  echo ""
fi

echo "========================================="
echo "Touchpoint Validation Tests Completed"
echo "========================================="
