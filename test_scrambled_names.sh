#!/bin/bash
# Test Scrambled Name Orders for Hybrid Search
# Testing if full-text search can handle different permutations

TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImltdS1wcm9kdWN0aW9uLWtleS0yMDI2MDQwMiJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJhdWQiOiJodHRwczovLzY5Y2Q2YjIzOGZhNDJjMTZkN2Y3MjVhOS5wb3dlcnN5bmMuam91cm5leWFwcHMuY29tIiwiZW1haWwiOiJhZG1pbkB0ZXN0LmltdS5sb2NhbCIsImZpcnN0X25hbWUiOiJTeXN0ZW0iLCJsYXN0X25hbWUiOiJBZG1pbmlzdHJhdG9yIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzc1NzMwMTAzLCJleHAiOjE3NzU3MzM3MDN9.B5EYxAz-L13Pcm_ebFSu34BQlb0fr91727fHe5uwP7F-WyoN0Dn_ze4N5Bkugm3bZpvlkuvLRnYb76eLeAP5ZUKcVIra7Hp_GnXWGjDk_cSmbM8fpJiMabE_WDPNopJoLoj5QAralMw2Pr9RzM1Q-Qg2tyzkz57IIxFhPGS4lZw7oSAyGixbM9Z093DwvOYJIZUqRhavbs-_mBcpptmeWyNUOB6yOyOqNQxNXg8mangsdFq2rW_BIEaxP0z7CYW8FEr-F2QIcqAZ84k2xISJSk4qVQMAxGBGm9j4QGMqsW8kswimd0WBSJF-wb8lWyuxGz2Bj1Qkyvpl8GPofMJBYw"
API_BASE="http://localhost:4004/api/clients"

echo "=========================================="
echo "SCRAMBLED NAME ORDER TESTS"
echo "=========================================="
echo ""
echo "Target Client: ACNAM PRINCE VANN EISEN DANAO"
echo "  First Name: PRINCE VANN EISEN"
echo "  Last Name: ACNAM"
echo "  Middle Name: DANAO"
echo ""

test_search() {
    local description="$1"
    local search_query="$2"
    local encoded_query=$(echo "$search_query" | sed 's/ /%20/g')

    echo "Test: $description"
    echo "Query: \"$search_query\""

    response=$(curl -s "$API_BASE?search=$encoded_query&perPage=1" -H "Authorization: Bearer $TOKEN")
    total=$(echo "$response" | grep -o '"totalItems":[0-9]*' | grep -o '[0-9]*')

    if [ -n "$total" ] && [ "$total" -gt 0 ]; then
        echo "✅ Results: $total client(s) found"
        # Extract first client name if available
        first_client=$(echo "$response" | grep -o '"first_name":"[^"]*"' | head -1 | cut -d'"' -f4)
        last_client=$(echo "$response" grep -o '"last_name":"[^"]*"' | head -1 | cut -d'"' -f4)

        if [ -n "$first_client" ] && [ -n "$last_client" ]; then
            echo "   First result: $first_client $last_client"
        fi
    else
        echo "❌ No results or error"
    fi
    echo ""
}

# 3-word permutations
echo "=========================================="
echo "3-WORD PERMUTATIONS"
echo "=========================================="
echo ""

test_search "First Middle Last (3 words)" "PRINCE VANN EISEN DANAO"
test_search "First Last Middle (3 words)" "PRINCE VANN EISEN ACNAM"
test_search "Middle First Last (3 words)" "VANN EISEN PRINCE DANAO"
test_search "Middle Last First (3 words)" "VANN EISEN DANAO ACNAM"
test_search "Last First Middle (3 words)" "ACNAM PRINCE VANN EISEN"
test_search "Last Middle First (3 words)" "ACNAM VANN EISEN PRINCE"

# 2-word permutations
echo "=========================================="
echo "2-WORD PERMUTATIONS"
echo "=========================================="
echo ""

test_search "First Middle (2 words)" "PRINCE VANN EISEN"
test_search "First Last (2 words)" "PRINCE VANN EISEN"
test_search "Middle First (2 words)" "VANN EISEN PRINCE"
test_search "Middle Last (2 words)" "VANN EISEN DANAO"
test_search "Last First (2 words)" "ACNAM PRINCE"
test_search "Last Middle (2 words)" "ACNAM VANN"

echo "=========================================="
echo "TEST COMPLETE"
echo "=========================================="
