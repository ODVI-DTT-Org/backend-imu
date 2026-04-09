#!/bin/bash
# All Possible Name Arrangement Combinations Test
# Testing 3-word and 2-word permutations

TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImltdS1wcm9kdWN0aW9uLWtleS0yMDI2MDMyNiJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJhdWQiOiJodHRwczovLzY5Y2Q2YjIzOGZhNDJjMTZkN2Y3MjVhOS5wb3dlcnN5bmMuam91cm5leWFwcHMuY29tIiwiZW1haWwiOiJhZG1pbkB0ZXN0LmltdS5sb2NhbCIsImZpcnN0X25hbWUiOiJTeXN0ZW0iLCJsYXN0X25hbWUiOiJBZG1pbmlzdHJhdG9yIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzc1Njc3NTUyLCJleHAiOjE3NzgyNjk1NTJ9.Oa75W2jdxPxFZlByGk9Un12bw0RDcT680qNPEw1PmdLdf3P5r5qSM5fxULN4UDMwkRFgvjoaZ8yXbDP8yeVMya2GOi26_oD_poflD6ff4sloAZ7bSwm2T4i61Ni74Ai30F3URq2arJtDQY1L2escL7ddhIQz3_QF16P5_2216nCEMPgzpN1BuJBCSJUPqoDbot2QTb_SkOYZ1nCjGz6f07qQ2VxxPXOIwXV3ovUEfJqj1ehtNSIdAd3HrmlFE9V_F_w1s4GQpMKzskE3oh5Jrr5F0XNTyUzshd5HrZZG891mh6pgayYy5XeeZItrjrZUulzrnqkO_IFamA0qu9UwQQ"

API_BASE="http://localhost:4000/api"

echo "=========================================="
echo "ALL NAME ARRANGEMENT COMBINATIONS TEST"
echo "=========================================="
echo ""

# Function to test endpoint and extract totalItems and similarity score
test_endpoint() {
    local url="$1"
    local description="$2"

    echo "Test: $description"
    echo "URL: $url"

    response=$(curl -s "$url" -H "Authorization: Bearer $TOKEN")
    total=$(echo "$response" | grep -o '"totalItems":[0-9]*' | grep -o '[0-9]*')
    similarity=$(echo "$response" | grep -o '"similarity_score":[0-9.]*' | head -1 | grep -o '[0-9.]*')

    if [ -n "$total" ] && [ "$total" -gt 0 ]; then
        echo "✅ Results: $total client(s) found"
        if [ -n "$similarity" ]; then
            echo "   Similarity Score: $similarity"
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

# URL encode function
url_encode() {
    local string="$1"
    echo "$string" | sed 's/ /%20/g'
}

echo "=========================================="
echo "3-WORD ARRANGEMENTS (6 Permutations)"
echo "=========================================="
echo ""

# Test with a known complex name: JACK BRIAN EMANUEL BERNARDINO
# First Name: JACK BRIAN EMANUEL (3 words)
# Last Name: BERNARDINO

echo "Target Client: JACK BRIAN EMANUEL BERNARDINO"
echo "First Name: JACK BRIAN EMANUEL (3 words)"
echo "Last Name: BERNARDINO"
echo ""

# Using shortened versions for testing
FIRST="Jack Brian"
MIDDLE="Emmanuel"
LAST="Bernardino"

echo "1. First Middle Last: $FIRST $MIDDLE $LAST"
test_endpoint "$API_BASE/clients?search=$(url_encode "$FIRST $MIDDLE $LAST")&perPage=1" "First Middle Last"

echo "2. First Last Middle: $FIRST $LAST $MIDDLE"
test_endpoint "$API_BASE/clients?search=$(url_encode "$FIRST $LAST $MIDDLE")&perPage=1" "First Last Middle"

echo "3. Middle First Last: $MIDDLE $FIRST $LAST"
test_endpoint "$API_BASE/clients?search=$(url_encode "$MIDDLE $FIRST $LAST")&perPage=1" "Middle First Last"

echo "4. Middle Last First: $MIDDLE $LAST $FIRST"
test_endpoint "$API_BASE/clients?search=$(url_encode "$MIDDLE $LAST $FIRST")&perPage=1" "Middle Last First"

echo "5. Last First Middle: $LAST $FIRST $MIDDLE"
test_endpoint "$API_BASE/clients?search=$(url_encode "$LAST $FIRST $MIDDLE")&perPage=1" "Last First Middle"

echo "6. Last Middle First: $LAST $MIDDLE $FIRST"
test_endpoint "$API_BASE/clients?search=$(url_encode "$LAST $MIDDLE $FIRST")&perPage=1" "Last Middle First"

echo ""
echo "=========================================="
echo "2-WORD ARRANGEMENTS (6 Permutations)"
echo "=========================================="
echo ""

echo "Target Client: JACK BRIAN EMANUEL BERNARDINO"
echo ""

echo "1. First Middle: Jack Brian"
test_endpoint "$API_BASE/clients?search=$(url_encode "Jack Brian")&perPage=1" "First Middle"

echo "2. First Last: Jack Bernardino"
test_endpoint "$API_BASE/clients?search=$(url_encode "Jack Bernardino")&perPage=1" "First Last"

echo "3. Middle First: Brian Jack"
test_endpoint "$API_BASE/clients?search=$(url_encode "Brian Jack")&perPage=1" "Middle First"

echo "4. Middle Last: Brian Bernardino"
test_endpoint "$API_BASE/clients?search=$(url_encode "Brian Bernardino")&perPage=1" "Middle Last"

echo "5. Last First: Bernardino Jack"
test_endpoint "$API_BASE/clients?search=$(url_encode "Bernardino Jack")&perPage=1" "Last First"

echo "6. Last Middle: Bernardino Brian"
test_endpoint "$API_BASE/clients?search=$(url_encode "Bernardino Brian")&perPage=1" "Last Middle"

echo ""
echo "=========================================="
echo "ADDITIONAL 3-WORD NAME TESTS"
echo "=========================================="
echo ""

# Test with another complex name: CYRIL DE LOS SANTOS DELA CRUZ
echo "Target Client: CYRIL DE LOS SANTOS DELA CRUZ"
echo "Last Name: DE LOS SANTOS (3 words)"
echo ""

echo "1. Full Last Name Only: De Los Santos"
test_endpoint "$API_BASE/clients?search=$(url_encode "De Los Santos")&perPage=1" "3-Word Last Name"

echo "2. Compound No Space: Delosantos"
test_endpoint "$API_BASE/clients?search=Delosantos&perPage=1" "Compound No Space"

echo "3. With First Name: Cyril De Los Santos"
test_endpoint "$API_BASE/clients?search=$(url_encode "Cyril De Los Santos")&perPage=1" "First + 3-Word Last"

echo ""
echo "=========================================="
echo "MULTI-WORD MIDDLE NAME TESTS"
echo "=========================================="
echo ""

# Test with multi-word middle name
echo "Target Client: JACK BRIAN EMANUEL BERNARDINO DELA CRUZ"
echo "Middle Name: DELA CRUZ (2 words)"
echo ""

echo "1. Middle Name Only: Dela Cruz"
test_endpoint "$API_BASE/clients?search=$(url_encode "Dela Cruz")&perPage=1" "2-Word Middle Name"

echo "2. Compound No Space: Delacruz"
test_endpoint "$API_BASE/clients?search=Delacruz&perPage=1" "Compound Middle Name"

echo "3. With First Name: Jack Dela Cruz"
test_endpoint "$API_BASE/clients?search=$(url_encode "Jack Dela Cruz")&perPage=1" "First + Middle"

echo ""
echo "=========================================="
echo "SINGLE WORD VARIATIONS"
echo "=========================================="
echo ""

echo "Target: JACK BRIAN EMANUEL BERNARDINO"
echo ""

echo "1. First Word Only: Jack"
test_endpoint "$API_BASE/clients?search=Jack&perPage=1" "First Word Only"

echo "2. Middle Word Only: Brian"
test_endpoint "$API_BASE/clients?search=Brian&perPage=1" "Middle Word Only"

echo "3. Last Word Only: Bernardino"
test_endpoint "$API_BASE/clients?search=Bernardino&perPage=1" "Last Word Only"

echo ""
echo "=========================================="
echo "PARTIAL MATCH TESTS"
echo "=========================================="
echo ""

echo "1. First Two Words: Jack Brian"
test_endpoint "$API_BASE/clients?search=$(url_encode "Jack Brian")&perPage=1" "First Two Words"

echo "2. Last Two Words: Emmanuel Bernardino"
test_endpoint "$API_BASE/clients?search=$(url_encode "Emmanuel Bernardino")&perPage=1" "Last Two Words"

echo "3. First and Last: Jack Bernardino"
test_endpoint "$API_BASE/clients?search=$(url_encode "Jack Bernardino")&perPage=1" "First and Last"

echo ""
echo "=========================================="
echo "COMPLETE NAME ARRANGEMENTS"
echo "=========================================="
echo ""

echo "Target: DEMOSTHENES BABON GABON"
echo "First: DEMOSTHENES, Last: BABON, Middle: GABON"
echo ""

echo "1. Standard: Demosthenes Babon"
test_endpoint "$API_BASE/clients?search=$(url_encode "Demosthenes Babon")&perPage=1" "Standard Format"

echo "2. Reversed: Babon Demosthenes"
test_endpoint "$API_BASE/clients?search=$(url_encode "Babon Demosthenes")&perPage=1" "Reversed Format"

echo "3. With Middle: Demosthenes Gabon Babon"
test_endpoint "$API_BASE/clients?search=$(url_encode "Demosthenes Gabon Babon")&perPage=1" "First Middle Last"

echo "4. All Reversed: Babon Gabon Demosthenes"
test_endpoint "$API_BASE/clients?search=$(url_encode "Babon Gabon Demosthenes")&perPage=1" "Last Middle First"

echo ""
echo "=========================================="
echo "TEST COMPLETE"
echo "=========================================="
