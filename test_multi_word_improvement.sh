#!/bin/bash
# Test Multi-Word Search Improvement
# Testing 4-5 word searches with new word-level matching

TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImltdS1wcm9kdWN0aW9uLWtleS0yMDI2MDMyNiJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJhdWQiOiJodHRwczovLzY5Y2Q2YjIzOGZhNDJjMTZkN2Y3MjVhOS5wb3dlcnN5bmMuam91cm5leWFwcHMuY29tIiwiZW1haWwiOiJhZG1pbkB0ZXN0LmltdS5sb2NhbCIsImZpcnN0X25hbWUiOiJTeXN0ZW0iLCJsYXN0X25hbWUiOiJBZG1pbmlzdHJhdG9yIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzc1Njc3NTUyLCJleHAiOjE3NzgyNjk1NTJ9.Oa75W2jdxPxFZlByGk9Un12bw0RDcT680qNPEw1PmdLdf3P5r5qSM5fxULN4UDMwkRFgvjoaZ8yXbDP8yeVMya2GOi26_oD_poflD6ff4sloAZ7bSwm2T4i61Ni74Ai30F3URq2arJtDQY1L2escL7ddhIQz3_QF16P5_2216nCEMPgzpN1BuJBCSJUPqoDbot2QTb_SkOYZ1nCjGz6f07qQ2VxxPXOIwXV3ovUEfJqj1ehtNSIdAd3HrmlFE9V_F_w1s4GQpMKzskE3oh5Jrr5F0XNTyUzshd5HrZZG891mh6pgayYy5XeeZItrjrZUulzrnqkO_IFamA0qu9UwQQ"

API_BASE="http://localhost:4000/api"

echo "=========================================="
echo "MULTI-WORD SEARCH IMPROVEMENT TEST"
echo "=========================================="
echo ""

# Function to test endpoint and extract totalItems
test_endpoint() {
    local url="$1"
    local description="$2"

    echo "Test: $description"
    echo "URL: $url"

    response=$(curl -s "$url" -H "Authorization: Bearer $TOKEN")
    total=$(echo "$response" | grep -o '"totalItems":[0-9]*' | grep -o '[0-9]*')
    match_count=$(echo "$response" | grep -o '"word_match_count":[0-9]*' | head -1 | grep -o '[0-9]*')

    if [ -n "$total" ] && [ "$total" -gt 0 ]; then
        echo "✅ Results: $total client(s) found"
        if [ -n "$match_count" ]; then
            echo "   Word Match Count: $match_count"
        fi

        # Extract first client name if available
        first_client=$(echo "$response" | grep -o '"first_name":"[^"]*"' | head -1 | cut -d'"' -f4)
        last_client=$(echo "$response" | grep -o '"last_name":"[^"]*"' | head -1 | cut -d'"' -f4)

        if [ -n "$first_client" ] && [ -n "$last_client" ]; then
            echo "   First result: $first_client $last_client"
        fi
    else
        echo "❌ No results or error"
        echo "$response" | head -c 200
    fi
    echo ""
}

echo "=========================================="
echo "4-WORD SEARCH TESTS"
echo "=========================================="
echo ""

echo "Target Client: JACK BRIAN EMANUEL BERNARDINO DELA CRUZ"
echo ""

echo "1. Full Name Search (5 words): Jack Brian Emmanuel Bernardino Dela Cruz"
test_endpoint "$API_BASE/clients?search=Jack%20Brian%20Emmanuel%20Bernardino%20Dela%20Cruz&perPage=1" "5-Word Full Name"

echo "2. First 4 Words: Jack Brian Emmanuel Bernardino"
test_endpoint "$API_BASE/clients?search=Jack%20Brian%20Emmanuel%20Bernardino&perPage=1" "4-Word First Name + Last"

echo "3. First 3 Words: Jack Brian Emmanuel"
test_endpoint "$API_BASE/clients?search=Jack%20Brian%20Emmanuel&perPage=1" "3-Word First Name"

echo "4. Last + Middle: Bernardino Dela Cruz"
test_endpoint "$API_BASE/clients?search=Bernardino%20Dela%20Cruz&perPage=1" "Last + Middle Name"

echo "5. Scattered Words: Jack Emmanuel Dela Cruz"
test_endpoint "$API_BASE/clients?search=Jack%20Emmanuel%20Dela%20Cruz&perPage=1" "Scattered Words"

echo ""
echo "=========================================="
echo "3-WORD SEARCH TESTS"
echo "=========================================="
echo ""

echo "1. First Middle Last: Demosthenes Gabon Babon"
test_endpoint "$API_BASE/clients?search=Demosthenes%20Gabon%20Babon&perPage=1" "3-Word Standard Format"

echo "2. Last First Middle: Babon Demosthenes Gabon"
test_endpoint "$API_BASE/clients?search=Babon%20Demosthenes%20Gabon&perPage=1" "3-Word Reversed Format"

echo "3. With Multi-word Last: Cyril De Los Santos"
test_endpoint "$API_BASE/clients?search=Cyril%20De%20Los%20Santos&perPage=1" "3-Word with Multi-word Last"

echo ""
echo "=========================================="
echo "2-WORD SEARCH TESTS (BASELINE)"
echo "=========================================="
echo ""

echo "1. First Last: Demosthenes Babon"
test_endpoint "$API_BASE/clients?search=Demosthenes%20Babon&perPage=1" "2-Word Standard"

echo "2. Last First: Babon Demosthenes"
test_endpoint "$API_BASE/clients?search=Babon%20Demosthenes&perPage=1" "2-Word Reversed"

echo "3. First Middle: Jack Brian"
test_endpoint "$API_BASE/clients?search=Jack%20Brian&perPage=1" "2-Word First Middle"

echo ""
echo "=========================================="
echo "COMPOUND NAME TESTS"
echo "=========================================="
echo ""

echo "1. Compound Last Name: Delosantos"
test_endpoint "$API_BASE/clients?search=Delosantos&perPage=1" "Compound Last Name"

echo "2. Compound Middle Name: Delacruz"
test_endpoint "$API_BASE/clients?search=Delacruz&perPage=1" "Compound Middle Name"

echo "3. Normal Multi-word: De Los Santos"
test_endpoint "$API_BASE/clients?search=De%20Los%20Santos&perPage=1" "Normal Multi-word"

echo ""
echo "=========================================="
echo "TEST COMPLETE"
echo "=========================================="
