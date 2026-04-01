#!/bin/bash

# API Endpoint Test Script
# Run: cd backend && bash test-endpoints.sh

BASE_URL="http://localhost:3000"
LOG_FILE="../docs/endpoint-test-log.md"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

PASS=0
FAIL=0

# Initialize log file
init_log() {
    echo "# API Endpoint Test Log" > $LOG_FILE
    echo "" >> $LOG_FILE
    echo "**Test Date:** $(date)" >> $LOG_FILE
    echo "**Backend URL:** $BASE_URL" >> $LOG_FILE
    echo "" >> $LOG_FILE
}

# Log result
log_result() {
    local category=$1
    local endpoint=$2
    local method=$3
    local status=$4
    local response=$5

    echo "### $category - $method $endpoint" >> $LOG_FILE
    echo "\`\`\`json" >> $LOG_FILE
    echo "$response" >> $LOG_FILE
    echo "\`\`\`" >> $LOG_FILE
    echo "**Status:** $status" >> $LOG_FILE

    if [[ "$status" == "200" || "$status" == "201" ]]; then
        echo "**Result:** ${GREEN}✅ PASS${NC}" >> $LOG_FILE
        ((PASS++))
    else
        echo "**Result:** ${RED}❌ FAIL${NC}" >> $LOG_FILE
        ((FAIL++))
    fi
    echo "" >> $LOG_FILE
}

# Test endpoint
test_get() {
    local category=$1
    local endpoint=$2
    local auth=$3

    if [[ "$auth" == "auth" ]]; then
        response=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    log_result "$category" "$endpoint" "GET" "$http_code" "$body"
}

test_post() {
    local category=$1
    local endpoint=$2
    local data=$3
    local auth=$4

    if [[ "$auth" == "auth" ]]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $TOKEN" \
            -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi


    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    log_result "$category" "$endpoint" "POST" "$http_code" "$body"
}

# ============================================
# START TESTS
# ============================================

init_log

echo "Running tests..."
echo ""

# 1. Health
test_get "Health" "/api/health" "noauth"

# 2. Auth - Register
test_post "Auth" "/api/auth/register" '{"email":"testuser@example.com","password":"Test123!","first_name":"Test","last_name":"User","role":"admin"}' "noauth"

# 3. Auth - Login
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"testuser@example.com","password":"Test123!"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | sed 's/"access_token":"//;s/"//')
echo ""
echo "### Auth - POST /api/auth/login (noauth)"
echo '```json' >> $LOG_FILE
echo "$LOGIN_RESPONSE" >> $LOG_FILE
echo '```' >> $LOG_FILE
if [[ -n "$TOKEN" ]]; then
    echo "**Status:** 200" >> $LOG_FILE
    echo "**Result:** ${GREEN}✅ PASS${NC}" >> $LOG_FILE
    ((PASS++))
else
    echo "**Result:** ${RED}❌ FAIL - Could not get token${NC}" >> $LOG_FILE
    ((FAIL++))
fi
echo "" >> $LOG_FILE

# 4. Auth - Me
test_get "Auth" "/api/auth/me" "auth"

# 5. Users - List
test_get "Users" "/api/users?page=1&perPage=10" "auth"

# 6. Clients - List
test_get "Clients" "/api/clients?page=1&perPage=10" "auth"

# 7. Caravans - List
test_get "Caravans" "/api/caravans?page=1&perPage=10" "auth"

# 8. Agencies - List
test_get "Agencies" "/api/agencies?page=1&perPage=10" "auth"

# 9. Touchpoints - List
test_get "Touchpoints" "/api/touchpoints?page=1&perPage=10" "auth"

# 10. Itineraries - List
test_get "Itineraries" "/api/itineraries?page=1&perPage=10" "auth"

# 11. Groups - List
test_get "Groups" "/api/groups?page=1&perPage=10" "auth"

# 12. Targets - List
test_get "Targets" "/api/targets" "auth"

# 13. Attendance - List
test_get "Attendance" "/api/attendance?page=1&perPage=10" "auth"

# 14. My-Day - Tasks
test_get "My-Day" "/api/my-day/tasks" "auth"

# 15. My-Day - Stats
test_get "My-Day" "/api/my-day/stats" "auth"

# 16. Dashboard - Stats
test_get "Dashboard" "/api/dashboard" "auth"

# 17. Dashboard - Performance
test_get "Dashboard" "/api/dashboard/performance" "auth"

# 18. Reports - Agent Performance
test_get "Reports" "/api/reports/agent-performance?period=month" "auth"

# 19. Reports - Client Activity
test_get "Reports" "/api/reports/client-activity?period=month" "auth"

# 20. Reports - Touchpoint Summary
test_get "Reports" "/api/reports/touchpoint-summary?period=month" "auth"

# 21. Reports - Attendance Summary
test_get "Reports" "/api/reports/attendance-summary?period=month" "auth"

# 22. Reports - Target Achievement
test_get "Reports" "/api/reports/target-achievement" "auth"

# 23. Reports - Conversion
test_get "Reports" "/api/reports/conversion?period=month" "auth"

# 24. Reports - Area Coverage
test_get "Reports" "/api/reports/area-coverage?period=month" "auth"

# 25. Upload - Categories
test_get "Upload" "/api/upload/categories" "auth"

# 26. Upload - Pending
test_get "Upload" "/api/upload/pending" "auth"

# ============================================
# SUMMARY
# ============================================

echo "" >> $LOG_FILE
echo "---" >> $LOG_FILE
echo "" >> $LOG_FILE
echo "## Test Summary" >> $LOG_FILE
echo "" >> $LOG_FILE
echo "| Status | Count |" >> $LOG_FILE
echo "|--------|-------|" >> $LOG_FILE
echo "| ✅ PASS | $PASS |" >> $LOG_FILE
echo "| ❌ FAIL | $FAIL |" >> $LOG_FILE
echo "| **Total** | $((PASS + FAIL)) |" >> $LOG_FILE

echo ""
echo "=========================================="
echo "Tests completed: $PASS passed, $FAIL failed"
echo "Log saved to: $LOG_FILE"
echo "=========================================="
