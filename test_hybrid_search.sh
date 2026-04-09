#!/bin/bash
# Test Hybrid Search Implementation
# Testing pg_trgm (1-2 words) + full-text search (3+ words)

TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImltdS1wcm9kdWN0aW9uLWtleS0yMDI2MDMyNiJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJhdWQiOiJodHRwczovLzY5Y2Q2YjIzOGZhNDJjMTZkN2Y3MjVhOS5wb3dlcnN5bmMuam91cm5leWFwcHMuY29tIiwiZW1haWwiOiJhZG1pbkB0ZXN0LmltdS5sb2NhbCIsImZpcnN0X25hbWUiOiJTeXN0ZW0iLCJsYXN0X25hbWUiOiJBZG1pbmlzdHJhdG9yIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzc1Njc3NTUyLCJleHAiOjE3NzgyNjk1NTJ9.Oa75W2jdxPxFZlByGk9Un12bw0RDcT680qNPEw1PmdLdf3P5r5qSM5fxULN4UDMwkRFgvjoaZ8yXbDP8yeVMya2GOi26_oD_poflD6ff4sloAZ7bSwm2T4i61Ni74Ai30F3URq2arJtDQY1L2escL7ddhIQz3_QF16P5_2216nCEMPgzpN1BuJBCSJUPqoDbot2QTb_SkOYZ1nCjGz6f07qQ2VxxPXOIwXV3ovUEfJqj1ehtNSIdAd3HrmlFE9V_F_w1s4GQpMKzskE3oh5Jrr5F0XNTyUzshd5HrZZG891mh6pgayYy5XeeZItrjrZUulzrnqkO_IFamA0qu9UwQQ"

API_BASE="http://localhost:4000/api"

echo "=========================================="
echo "HYBRID SEARCH IMPLEMENTATION TEST"
echo "=========================================="
echo ""
echo "Testing pg_trgm (1-2 words) + full-text search (3+ words)"
echo ""

# Function to test endpoint and extract totalItems
test_endpoint() {
    local url="$1"
    local description="$2"

    echo "Test: $description"
    echo "URL: $url"

    response=$(curl -s "$url" -H "Authorization: Bearer $TOKEN")
    total=$(echo "$response" | grep -o '"totalItems":[0-9]*' | grep -o '[0-9]*')
    strategy=$(echo "$response" | grep -o '"similarity_score":[0-9.]*' | head -1 | grep -o '[0-9.]*')

    if [ -n "$total" ] && [ "$total" -gt 0 ]; then
        echo "✅ Results: $total client(s) found"
        if [ -n "$strategy" ]; then
            echo "   Similarity Score: $strategy"
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
echo "5-WORD SEARCH TESTS (Full-Text Search)"
echo "=========================================="
echo ""

echo "Target Client: JACK BRIAN EMANUEL BERNARDINO DELA CRUZ"
echo ""

echo "1. Full Name Search (6 words): Jack Brian Emmanuel Bernardino Dela Cruz"
test_endpoint "$API_BASE/clients?search=Jack%20Brian%20Emmanuel%20Bernardino%20Dela%20Cruz&perPage=1" "6-Word Full Name"

echo "2. First 5 Words: Jack Brian Emmanuel Bernardino Dela"
test_endpoint "$API_BASE/clients?search=Jack%20Brian%20Emmanuel%20Bernardino%20Dela&perPage=1" "5-Word Name"

echo "3. First 4 Words: Jack Brian Emmanuel Bernardino"
test_endpoint "$API_BASE/clients?search=Jack%20Brian%20Emmanuel%20Bernardino&perPage=1" "4-Word Name"

echo ""
echo "=========================================="
echo "3-WORD SEARCH TESTS (Full-Text Search)"
echo "=========================================="
echo ""

echo "1. First Middle Last: Demosthenes Gabon Babon"
test_endpoint "$API_BASE/clients?search=Demosthenes%20Gabon%20Babon&perPage=1" "3-Word Standard"

echo "2. Last First Middle: Babon Demosthenes Gabon"
test_endpoint "$API_BASE/clients?search=Babon%20Demosthenes%20Gabon&perPage=1" "3-Word Reversed"

echo "3. With Multi-word Last: Cyril De Los Santos"
test_endpoint "$API_BASE/clients?search=Cyril%20De%20Los%20Santos&perPage=1" "3-Word Multi-word Last"

echo ""
echo "=========================================="
echo "2-WORD SEARCH TESTS (pg_trgm - Baseline)"
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
echo "1-WORD SEARCH TESTS (pg_trgm - Baseline)"
echo "=========================================="
echo ""

echo "1. Single word: Jack"
test_endpoint "$API_BASE/clients?search=Jack&perPage=1" "1-Word Search"

echo "2. Single word: Babon"
test_endpoint "$API_BASE/clients?search=Babon&perPage=1" "1-Word Search"

echo "3. Single word: Dela"
test_endpoint "$API_BASE/clients?search=Dela&perPage=1" "1-Word Search"

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
echo "FUZZY MATCH TESTS (Typos and Variations)"
echo "=========================================="
echo ""

echo "1. Typo in name: Jck Brian" (missing 'a' in Jack)
test_endpoint "$API_BASE/clients?search=Jck%20Brian&perPage=1" "Typo: Jck Brian"

echo "2. Transposed letters: Bnrian" (Brian → Bnrian)
test_endpoint "$API_BASE/clients?search=Bnrian&perPage=1" "Transposed: Bnrian"

echo "3. Partial match: Emanu" (Emmanuel partial)
test_endpoint "$API_BASE/clients?search=Emanu&perPage=1" "Partial: Emanu"

echo ""
echo "=========================================="
echo "TEST COMPLETE"
echo "=========================================="
echo ""
echo "Expected Results:"
echo "- 1-2 words: pg_trgm fuzzy matching (high success rate)"
echo "- 3+ words: Full-text search with stemming (should find matches)"
echo ""
echo "Check server logs for search strategy information:"
echo "[Hybrid Search] Strategy: trgm/fulltext"
echo "[Hybrid Search] Word Count: X"
echo ""
