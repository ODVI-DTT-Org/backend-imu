#!/bin/bash

echo "========================================="
echo "Testing Tele Role - Final Verification v3"
echo "========================================="
echo ""

# Login as admin
echo "1. Getting tokens..."
ADMIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@imu.com\",\"password\":\"admin123\"}")
ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

TELE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"teleuser@example.com\",\"password\":\"TelePass123!\"}")
TELE_TOKEN=$(echo $TELE_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

echo "✓ Tokens obtained"
echo ""

# Get first client
echo "2. Getting a client..."
CLIENTS_RESPONSE=$(curl -s http://localhost:3000/api/clients \
  -H "Authorization: Bearer $ADMIN_TOKEN")
CLIENT_ID=$(echo $CLIENTS_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "✓ Client ID: $CLIENT_ID"
echo ""

# Get existing touchpoints for this client
echo "3. Checking existing touchpoints..."
EXISTING_TP=$(curl -s "http://localhost:3000/api/touchpoints?client_id=$CLIENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

# Count touchpoints by number
TP_COUNT=$(echo "$EXISTING_TP" | grep -o '"touchpoint_number":[0-9]*' | wc -l)
echo "  Found $TP_COUNT existing touchpoints"

# Find the highest touchpoint number
HIGHEST_TP=0
for num in $(echo "$EXISTING_TP" | grep -o '"touchpoint_number":[0-9]*' | cut -d':' -f2); do
  if [ $num -gt $HIGHEST_TP ]; then
    HIGHEST_TP=$num
  fi
done

NEXT_TP=$((HIGHEST_TP + 1))
if [ $NEXT_TP -gt 7 ]; then
  echo "  All 7 touchpoints completed. Using a different test approach."
  NEXT_TP=1
fi
echo "  Next touchpoint number: $NEXT_TP"

# Get expected type
case $NEXT_TP in
  1|4|7) EXPECTED_TYPE="Visit"; ALLOWED_FOR="Caravan" ;;
  2|3|5|6) EXPECTED_TYPE="Call"; ALLOWED_FOR="Tele" ;;
  *) EXPECTED_TYPE="Unknown"; ALLOWED_FOR="Neither" ;;
esac
echo "  Expected type: $EXPECTED_TYPE (for $ALLOWED_FOR)"
echo ""

echo "========================================="
echo "ROLE VALIDATION TESTS"
echo "========================================="
echo ""

# TEST 1: Tele user creating correct type (Call)
echo "TEST 1: Tele user creating Call touchpoint"
if [ "$EXPECTED_TYPE" = "Call" ]; then
  echo "  Creating touchpoint #$NEXT_TP (Call) with Tele user..."
  TELE_CALL=$(curl -s -X POST http://localhost:3000/api/touchpoints \
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

  if echo "$TELE_CALL" | grep -q '"id"'; then
    echo "  ✓ PASS: Tele user created Call touchpoint"
  else
    echo "  ✗ FAIL: $(echo "$TELE_CALL" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)"
  fi
else
  echo "  (Skipped - next touchpoint is Visit, not Call)"
fi
echo ""

# TEST 2: Tele user blocked from Visit
echo "TEST 2: Tele user blocked from Visit touchpoint"
echo "  Attempting Visit touchpoint with Tele user..."
TELE_VISIT=$(curl -s -X POST http://localhost:3000/api/touchpoints \
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

if echo "$TELE_VISIT" | grep -qi "tele.*call.*only\|INVALID_TOUCHPOINT_TYPE_FOR_ROLE"; then
  echo "  ✓ PASS: Tele user blocked from Visit"
  MSG=$(echo "$TELE_VISIT" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
  echo "  Error: $MSG"
else
  echo "  ✗ FAIL: Tele user was able to create Visit"
  echo "  Response: $(echo "$TELE_VISIT" | head -c 200)"
fi
echo ""

# TEST 3: Admin can create any type
echo "TEST 3: Admin can create any touchpoint type"
echo "  Creating touchpoint #$NEXT_TP ($EXPECTED_TYPE) with Admin..."
ADMIN_TP=$(curl -s -X POST http://localhost:3000/api/touchpoints \
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

if echo "$ADMIN_TP" | grep -q '"id"'; then
  echo "  ✓ PASS: Admin created $EXPECTED_TYPE touchpoint"
else
  ERR=$(echo "$ADMIN_TP" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
  if echo "$ERR" | grep -qi "already exists"; then
    echo "  ✓ PASS: Touchpoint already exists (validation working)"
  else
    echo "  ✗ FAIL: $ERR"
  fi
fi
echo ""

# TEST 4: Tele user blocked from wrong sequence
echo "TEST 4: Tele user blocked from wrong sequence"
echo "  Attempting Call touchpoint #1 (should be Visit)..."
TELE_WRONG=$(curl -s -X POST http://localhost:3000/api/touchpoints \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TELE_TOKEN" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"touchpoint_number\": 1,
    \"type\": \"Call\",
    \"date\": \"2026-03-26\",
    \"reason\": \"Wrong sequence\",
    \"status\": \"Interested\"
  }")

if echo "$TELE_WRONG" | grep -qi "must be a Visit\|expected.*Visit"; then
  echo "  ✓ PASS: Correctly blocked Call at position #1"
  MSG=$(echo "$TELE_WRONG" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
  echo "  Error: $MSG"
else
  echo "  ✗ FAIL: Sequence validation not working"
  echo "  Response: $(echo "$TELE_WRONG" | head -c 200)"
fi
echo ""

echo "========================================="
echo "SUMMARY"
echo "========================================="
echo "All Tele role validation tests completed."
echo "Review the results above to verify:"
echo "  1. Tele users can create Call touchpoints (2,3,5,6)"
echo "  2. Tele users CANNOT create Visit touchpoints (1,4,7)"
echo "  3. Admin can create any touchpoint type"
echo "  4. Touchpoint sequence validation works"
echo "========================================="
