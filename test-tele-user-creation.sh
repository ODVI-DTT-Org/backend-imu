#!/bin/bash

echo "========================================="
echo "Testing Tele User Creation & Validation"
echo "========================================="
echo ""

# Login as admin
echo "1. Logging in as admin..."
ADMIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@imu.com","password":"admin123"}')

ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo "Admin token received"
echo ""

# Create a Tele user
echo "2. Creating a Tele user..."
CREATE_TELE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "email": "teleuser@example.com",
    "password": "TelePass123!",
    "first_name": "Tele",
    "last_name": "User",
    "role": "tele"
  }')

echo "Tele user creation response:"
echo "$CREATE_TELE_RESPONSE" | head -c 300
echo ""
echo ""

# Login as Tele user
echo "3. Logging in as Tele user..."
TELE_LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"teleuser@example.com","password":"TelePass123!"}')

TELE_TOKEN=$(echo $TELE_LOGIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TELE_TOKEN" ]; then
  echo "Failed to get Tele token"
  echo "Response: $TELE_LOGIN_RESPONSE"
else
  echo "Tele token received: ${TELE_TOKEN:0:30}..."
  echo ""
  
  # Test: Try to create a Visit touchpoint (should fail for Tele user)
  echo "4. Testing role-based validation - Tele user trying to create Visit touchpoint..."
  echo "Expected: Should fail (Tele users can only create Call touchpoints)"
  
  # First, get a client ID
  CLIENTS_RESPONSE=$(curl -s http://localhost:3000/api/clients \
    -H "Authorization: Bearer $TELE_TOKEN")
    
  CLIENT_ID=$(echo $CLIENTS_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  
  if [ -n "$CLIENT_ID" ]; then
    echo "Using client ID: $CLIENT_ID"
    
    # Try to create a Visit touchpoint (should fail)
    VISIT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/touchpoints \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TELE_TOKEN" \
      -d "{
        \"client_id\": \"$CLIENT_ID\",
        \"touchpoint_number\": 1,
        \"type\": \"VISIT\",
        \"date\": \"2026-03-26\",
        \"reason\": \"Interested\"
      }")
    
    echo "Visit creation response:"
    echo "$VISIT_RESPONSE" | head -c 200
    echo ""
  fi
fi

echo ""
echo "========================================="
echo "Tele User Tests Completed"
echo "========================================="
