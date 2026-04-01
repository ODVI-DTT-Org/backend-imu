#!/bin/bash

echo "========================================="
echo "Testing Tele User Creation (Fixed)"
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

# Check if Tele user was created
if echo "$CREATE_TELE_RESPONSE" | grep -q "id"; then
  echo "✓ Tele user created successfully!"
  
  # Get the Tele user ID
  TELE_USER_ID=$(echo $CREATE_TELE_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "Tele User ID: $TELE_USER_ID"
  echo ""
  
  # Login as Tele user
  echo "3. Logging in as Tele user..."
  TELE_LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"teleuser@example.com","password":"TelePass123!"}')

  TELE_TOKEN=$(echo $TELE_LOGIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

  if [ -n "$TELE_TOKEN" ]; then
    echo "✓ Tele user login successful!"
    echo "Tele token received: ${TELE_TOKEN:0:30}..."
    echo ""
    
    # Check user info
    echo "4. Getting Tele user info..."
    curl -s http://localhost:3000/api/auth/me \
      -H "Authorization: Bearer $TELE_TOKEN" | grep -E '"role"|"first_name"|"last_name"' | head -5
    echo ""
    
    echo "✓ All Tele user tests passed!"
  else
    echo "✗ Tele login failed"
    echo "Response: $TELE_LOGIN_RESPONSE"
  fi
else
  echo "✗ Tele user creation failed"
  echo "Response: $CREATE_TELE_RESPONSE"
fi

echo ""
echo "========================================="
echo "Tele User Tests Completed"
echo "========================================="
