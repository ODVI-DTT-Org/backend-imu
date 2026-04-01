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

ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "Failed to get admin token"
  echo "Response: $ADMIN_RESPONSE"
  exit 1
fi

echo "Admin token received: ${ADMIN_TOKEN:0:30}..."
echo ""

# Test 1: Check current users
echo "2. Checking current users and roles..."
curl -s http://localhost:3000/api/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" | grep -o '"role":"[^"]*"' | sort | uniq -c
echo ""

# Test 2: Check user roles available
echo "3. Checking available user roles..."
echo "Expected: admin, area_manager, assistant_area_manager, caravan, tele"
echo ""

# Test 3: Get touchpoints to check schema
echo "4. Checking touchpoints schema..."
curl -s http://localhost:3000/api/touchpoints \
  -H "Authorization: Bearer $ADMIN_TOKEN" | head -c 500
echo ""
echo ""

# Test 4: Check if status field exists in response
echo "5. Checking if status field exists in touchpoints response..."
HAS_STATUS=$(curl -s http://localhost:3000/api/touchpoints \
  -H "Authorization: Bearer $ADMIN_TOKEN" | grep -o '"status"' | wc -l)
echo "Status field found: $HAS_STATUS times"
echo ""

echo "========================================="
echo "API Tests Completed"
echo "========================================="
