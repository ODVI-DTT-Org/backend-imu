#!/bin/bash
# Comprehensive Fuzzy Search API Testing
# Testing search + filters, search only, filters only, and complex names

TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImltdS1wcm9kdWN0aW9uLWtleS0yMDI2MDMyNiJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJhdWQiOiJodHRwczovLzY5Y2Q2YjIzOGZhNDJjMTZkN2Y3MjVhOS5wb3dlcnN5bmMuam91cm5leWFwcHMuY29tIiwiZW1haWwiOiJhZG1pbkB0ZXN0LmltdS5sb2NhbCIsImZpcnN0X25hbWUiOiJTeXN0ZW0iLCJsYXN0X25hbWUiOiJBZG1pbmlzdHJhdG9yIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzc1Njc3NTUyLCJleHAiOjE3NzgyNjk1NTJ9.Oa75W2jdxPxFZlByGk9Un12bw0RDcT680qNPEw1PmdLdf3P5r5qSM5fxULN4UDMwkRFgvjoaZ8yXbDP8yeVMya2GOi26_oD_poflD6ff4sloAZ7bSwm2T4i61Ni74Ai30F3URq2arJtDQY1L2escL7ddhIQz3_QF16P5_2216nCEMPgzpN1BuJBCSJUPqoDbot2QTb_SkOYZ1nCjGz6f07qQ2VxxPXOIwXV3ovUEfJqj1ehtNSIdAd3HrmlFE9V_F_w1s4GQpMKzskE3oh5Jrr5F0XNTyUzshd5HrZZG891mh6pgayYy5XeeZItrjrZUulzrnqkO_IFamA0qu9UwQQ"

API_BASE="http://localhost:4000/api"

echo "=========================================="
echo "COMPREHENSIVE FUZZY SEARCH API TESTS"
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

    if [ -n "$total" ]; then
        echo "✅ Results: $totalItems clients found"

        # Extract first client name if available
        first_client=$(echo "$response" | grep -o '"first_name":"[^"]*"' | head -1)
        last_client=$(echo "$response" | grep -o '"last_name":"[^"]*"' | head -1)

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
echo "SCENARIO 1: SEARCH NAME + FILTER"
echo "=========================================="
echo ""

test_endpoint "$API_BASE/clients?search=Babon&province=Metro%20Manila&perPage=5" "1a. Search 'Babon' + Province Filter (Metro Manila)"
test_endpoint "$API_BASE/clients?search=Babon&municipality=City%20of%20Caloocan&perPage=5" "1b. Search 'Babon' + Municipality Filter (City of Caloocan)"
test_endpoint "$API_BASE/clients?search=Babon&client_type=potential&perPage=5" "1c. Search 'Babon' + Client Type Filter (Potential)"
test_endpoint "$API_BASE/clients?search=Babon&product_type=PNP%20INP&perPage=5" "1d. Search 'Babon' + Product Type Filter (PNP INP)"

echo "=========================================="
echo "SCENARIO 2: SEARCH NAME ONLY"
echo "=========================================="
echo ""

test_endpoint "$API_BASE/clients?search=Babon&perPage=5" "2a. Search 'Babon' (last name)"
test_endpoint "$API_BASE/clients?search=Demosthenes&perPage=5" "2b. Search 'Demosthenes' (first name)"
test_endpoint "$API_BASE/clients?search=Gabon&perPage=5" "2c. Search 'Gabon' (middle name)"
test_endpoint "$API_BASE/clients?search=Dela%20Cruz&perPage=5" "2d. Search 'Dela Cruz' (multi-word middle name)"
test_endpoint "$API_BASE/clients?search=Delacruz&perPage=5" "2e. Search 'Delacruz' (compound without space)"

echo "=========================================="
echo "SCENARIO 3: FILTER ONLY (NO SEARCH)"
echo "=========================================="
echo ""

test_endpoint "$API_BASE/clients?province=Metro%20Manila&perPage=5" "3a. Filter: Province (Metro Manila) only"
test_endpoint "$API_BASE/clients?municipality=City%20of%20Caloocan&perPage=5" "3b. Filter: Municipality (City of Caloocan) only"
test_endpoint "$API_BASE/clients?client_type=potential&perPage=5" "3c. Filter: Client Type (Potential) only"
test_endpoint "$API_BASE/clients?product_type=PNP%20INP&perPage=5" "3d. Filter: Product Type (PNP INP) only"
test_endpoint "$API_BASE/clients?region=National%20Capital%20Region%20(NCR)&perPage=5" "3e. Filter: Region (NCR) only"

echo "=========================================="
echo "SCENARIO 4: COMPLEX NAMES (4-6 WORDS)"
echo "=========================================="
echo ""

test_endpoint "$API_BASE/clients?search=Jack%20Brian%20Emmanuel&perPage=5" "4a. Complex Name: 'Jack Brian Emmanuel' (3-word first name)"
test_endpoint "$API_BASE/clients?search=Marah%20Elaine%20Kay&perPage=5" "4b. Complex Name: 'Marah Elaine Kay' (3-word first name)"
test_endpoint "$API_BASE/clients?search=De%20Los%20Santos&perPage=5" "4c. Complex Name: 'De Los Santos' (3-word last name)"
test_endpoint "$API_BASE/clients?search=Christa%20Jan%20Lei&perPage=5" "4d. Complex Name: 'Christa Jan Lei' (3-word first name)"
test_endpoint "$API_BASE/clients?search=Prince%20Vann%20Einsen&perPage=5" "4e. Complex Name: 'Prince Vann Einsen' (3-word first name)"
test_endpoint "$API_BASE/clients?search=Thely%20Gaye&perPage=5" "4f. Complex Name: 'Thely Gaye' (2-word first name)"

echo "=========================================="
echo "SCENARIO 5: FULL COMPLEX NAMES (COMPLETE)"
echo "=========================================="
echo ""

test_endpoint "$API_BASE/clients?search=Jack%20Brian%20Emmanuel%20Bernardino&perPage=5" "5a. Full Complex: 'Jack Brian Emmanuel Bernardino'"
test_endpoint "$API_BASE/clients?search=Marah%20Elaine%20Kay%20Colado&perPage=5" "5b. Full Complex: 'Marah Elaine Kay Colado'"
test_endpoint "$API_BASE/clients?search=Cyril%20De%20Los%20Santos&perPage=5" "5c. Full Complex: 'Cyril De Los Santos'"
test_endpoint "$API_BASE/clients?search=Prince%20Vann%20Einsen%20Danao&perPage=5" "5d. Full Complex: 'Prince Vann Einsen Danao'"

echo "=========================================="
echo "SCENARIO 6: COMPOUND NAMES (NO SPACES)"
echo "=========================================="
echo ""

test_endpoint "$API_BASE/clients?search=Delosantos&perPage=5" "6a. Compound: 'Delosantos' (no space)"
test_endpoint "$API_BASE/clients?search=Delapena&perPage=5" "6b. Compound: 'Delapena' (no space)"
test_endpoint "$API_BASE/clients?search=Delacruz&perPage=5" "6c. Compound: 'Delacruz' (no space)"

echo "=========================================="
echo "SCENARIO 7: REVERSED NAME ORDER"
echo "=========================================="
echo ""

test_endpoint "$API_BASE/clients?search=Babon%20Demosthenes&perPage=5" "7a. Reversed: 'Babon Demosthenes' (First Last)"
test_endpoint "$API_BASE/clients?search=Demosthenes%20Gabon&perPage=5" "7b. Reversed: 'Demosthenes Gabon' (First Middle)"
test_endpoint "$API_BASE/clients?search=Jack%20Brian%20Bernardino&perPage=5" "7c. Reversed: 'Jack Brian Bernardino' (First Last)"

echo "=========================================="
echo "SCENARIO 8: ASSIGNED CLIENTS ENDPOINT"
echo "=========================================="
echo ""

test_endpoint "$API_BASE/clients/assigned?search=Babon&perPage=5" "8a. Assigned Clients: Search 'Babon'"
test_endpoint "$API_BASE/clients/assigned?search=Demosthenes&perPage=5" "8b. Assigned Clients: Search 'Demosthenes'"
test_endpoint "$API_BASE/clients/assigned?province=Metro%20Manila&perPage=5" "8c. Assigned Clients: Filter Province (Metro Manila) only"

echo "=========================================="
echo "TEST COMPLETE"
echo "=========================================="
