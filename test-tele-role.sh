#!/bin/bash

# Test Tele Role Implementation
echo "========================================="
echo "Testing Tele Role Implementation"
echo "========================================="
echo ""

# Get admin token first
echo "1. Logging in as admin..."
ADMIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@imu.com","password":"admin123"}')

ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "Failed to get admin token"
  echo "Response: $ADMIN_RESPONSE"
  exit 1
fi

echo "Admin token received: ${ADMIN_TOKEN:0:20}..."
echo ""

# Test 1: Create a Tele user
echo "2. Creating a Tele user..."
TELE_USER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "email": "tele@example.com",
    "password": "password123",
    "name": "Tele User",
    "role": "tele"
  }')

echo "Tele user creation response:"
echo "$TELE_USER_RESPONSE" | grep -o '"id":"[^"]*"' | head -1
echo ""

# Test 2: Login as Tele user
echo "3. Logging in as Tele user..."
TELE_LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tele@example.com","password":"password123"}')

TELE_TOKEN=$(echo $TELE_LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TELE_TOKEN" ]; then
  echo "Failed to get Tele token"
  echo "Response: $TELE_LOGIN_RESPONSE"
else
  echo "Tele token received: ${TELE_TOKEN:0:20}..."
fi
echo ""

# Test 3: Check user roles
echo "4. Checking available user roles..."
curl -s http://localhost:3000/api/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" | grep -o '"role":"[^"]*"' | sort | uniq
echo ""

# Test 4: Check touchpoint validation function
echo "5. Testing touchpoint sequence validation..."
curl -s -X POST http://localhost:3000/api/touchpoints/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "touchpoint_number": 2,
    "touchpoint_type": "CALL"
  }' | head -c 200
echo ""
echo ""

echo "========================================="
echo "API Tests Completed"
echo "========================================="
