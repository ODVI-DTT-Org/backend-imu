#!/bin/bash
# Test Real Client Names with Enhanced Permutation Search
# Testing 4-6 word names from actual database

TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImltdS1wcm9kdWN0aW9uLWtleS0yMDI2MDQwMiJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJhdWQiOiJodHRwczovLzY5Y2Q2YjIzOGZhNDJjMTZkN2Y3MjVhOS5wb3dlcnN5bmMuam91cm5leWFwcHMuY29tIiwiZW1haWwiOiJhZG1pbkB0ZXN0LmltdS5sb2NhbCIsImZpcnN0X25hbWUiOiJTeXN0ZW0iLCJsYXN0X25hbWUiOiJBZG1pbmlzdHJhdG9yIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzc1NzMwMTAzLCJleHAiOjE3NzU3MzM3MDN9.B5EYxAz-L13Pcm_ebFSu34BQlb0fr91727fHe5uwP7F-WyoN0Dn_ze4N5Bkugm3bZpvlkuvLRnYb76eLeAP5ZUKcVIra7Hp_GnXWGjDk_cSmbM8fpJiMabE_WDPNopJoLoj5QAralMw2Pr9RzM1Q-Qg2tyzkz57IIxFhPGS4lZw7oSAyGixbM9Z093DwvOYJIZUqRhavbs-_mBcpptmeWyNUOB6yOyOqNQxNXg8mangsdFq2rW_BIEaxP0z7CYW8FEr-F2QIcqAZ84k2xISJSk4qVQMAxGBGm9j4QGMqsW8kswimd0WBSJF-wb8lWyuxGz2Bj1Qkyvpl8GPofMJBYw"
API_BASE="http://localhost:4004/api/clients"

echo "=========================================="
echo "REAL CLIENT NAMES - ENHANCED PERMUTATION TEST"
echo "=========================================="
echo ""

# Function to test a search query
test_search() {
    local client_name="$1"
    local search_query="$2"
    # Simple URL encoding: replace spaces with %20, handle common special chars
    local encoded_query=$(echo "$search_query" | sed 's/ /%20/g' | sed 's/Ñ/%C3%91/g' | sed 's/ñ/%C3%B1/g')

    response=$(curl -s "$API_BASE?search=$encoded_query&perPage=5" -H "Authorization: Bearer $TOKEN")
    total=$(echo "$response" | grep -o '"totalItems":[0-9]*' | grep -o '[0-9]*')

    if [ -n "$total" ] && [ "$total" -gt 0 ]; then
        echo "  ✅ \"$search_query\" → $total result(s)"
        # Extract first client name if available
        first_client=$(echo "$response" | grep -o '"first_name":"[^"]*"' | head -1 | cut -d'"' -f4)
        last_client=$(echo "$response" | grep -o '"last_name":"[^"]*"' | head -1 | cut -d'"' -f4)

        if [ -n "$first_client" ] && [ -n "$last_client" ]; then
            # Check if this is the expected client
            if [[ "$first_client $last_client" == *"ACNAM"* ]] || [[ "$first_client $last_client" == *"BERNARDINO"* ]] || [[ "$first_client $last_client" == *"COLADO"* ]] || [[ "$first_client $last_client" == *"DE LOS"* ]] || [[ "$first_client $last_client" == *"MAGSINO"* ]] || [[ "$first_client $last_client" == *"AGULLO"* ]] || [[ "$first_client $last_client" == *"ALMADEN"* ]] || [[ "$first_client $last_client" == *"APINES"* ]] || [[ "$first_client $last_client" == *"ARBOLADURA"* ]] || [[ "$first_client $last_client" == *"ARMILLO"* ]]; then
                echo "     → Target found: $first_client $last_client"
            fi
        fi
        return 0
    else
        echo "  ❌ \"$search_query\" → 0 results"
        return 1
    fi
}

# Function to test a client with multiple permutations
test_client_permutations() {
    local client_name="$1"
    local word_count="$2"

    echo "════════════════════════════════════════"
    echo "Client: $client_name"
    echo "Word Count: $word_count"
    echo "════════════════════════════════════════"

    # Convert to array for permutation testing
    IFS=' ' read -ra WORDS <<< "$client_name"
    local total_tests=0
    local passed_tests=0

    # Test original order
    if test_search "$client_name" "$client_name"; then
        ((passed_tests++))
    fi
    ((total_tests++))

    # Test reverse order
    local reversed=""
    for ((i=${#WORDS[@]}-1; i>=0; i--)); do
        reversed="$reversed ${WORDS[$i]}"
    done
    reversed=$(echo "$reversed" | sed 's/^ //') # Remove leading space

    if test_search "$client_name" "$reversed"; then
        ((passed_tests++))
    fi
    ((total_tests++))

    # Test First Last (for 3+ words)
    if [ $word_count -ge 3 ]; then
        local first_last="${WORDS[0]} ${WORDS[${#WORDS[@]}-1]}"
        if test_search "$client_name" "$first_last"; then
            ((passed_tests++))
        fi
        ((total_tests++))
    fi

    # Test Last First (for 2+ words)
    if [ $word_count -ge 2 ]; then
        local last_first="${WORDS[${#WORDS[@]}-1]} ${WORDS[0]}"
        if test_search "$client_name" "$last_first"; then
            ((passed_tests++))
        fi
        ((total_tests++))
    fi

    # Test Middle word combinations (for 4+ words)
    if [ $word_count -ge 4 ]; then
        local mid1=${WORDS[$(($word_count/2))]}
        local mid2=${WORDS[$(($word_count/2-1))]}
        local middle_combo="$mid1 $mid2"

        if test_search "$client_name" "$middle_combo"; then
            ((passed_tests++))
        fi
        ((total_tests++))
    fi

    # Calculate success rate
    local success_rate=$((passed_tests * 100 / total_tests))

    echo ""
    echo "  📊 Test Results: $passed_tests/$total_tests ($success_rate%)"

    if [ $success_rate -ge 90 ]; then
        echo "  ✅ EXCEEDS 90% REQUIREMENT"
    else
        echo "  ❌ BELOW 90% REQUIREMENT"
    fi

    echo ""

    # Return success rate for summary
    return $success_rate
}

# Test all clients
total_clients=0
exceeding_clients=0

echo "=========================================="
echo "TESTING 10 REAL CLIENT NAMES"
echo "=========================================="
echo ""

# Test each client
test_client_permutations "BERNARDINO JACK BRIAN EMANUEL DELA CRUZ" 6
if [ $? -ge 90 ]; then ((exceeding_clients++)); fi
((total_clients++))

test_client_permutations "COLADO MARAH ELAINE KAY DELA PENA" 6
if [ $? -ge 90 ]; then ((exceeding_clients++)); fi
((total_clients++))

test_client_permutations "DE LOS SANTOS CYRIL DELA CRUZ" 6
if [ $? -ge 90 ]; then ((exceeding_clients++)); fi
((total_clients++))

test_client_permutations "MAGSINO CHRISTA JAN LEI CONTRERAS" 5
if [ $? -ge 90 ]; then ((exceeding_clients++)); fi
((total_clients++))

test_client_permutations "ACNAM PRINCE VANN EISEN DANAO" 5
if [ $? -ge 90 ]; then ((exceeding_clients++)); fi
((total_clients++))

test_client_permutations "AGULLO THELY GAYE DE VEYRA" 5
if [ $? -ge 90 ]; then ((exceeding_clients++)); fi
((total_clients++))

test_client_permutations "ALMADEN ELMER DE LA PEÑA" 5
if [ $? -ge 90 ]; then ((exceeding_clients++)); fi
((total_clients++))

test_client_permutations "APINES MIKKA VIANEY MARIE TOLORES" 5
if [ $? -ge 90 ]; then ((exceeding_clients++)); fi
((total_clients++))

test_client_permutations "ARBOLADURA AARON JOHN VINCENT ELEVERA" 5
if [ $? -ge 90 ]; then ((exceeding_clients++)); fi
((total_clients++))

test_client_permutations "ARMILLO HERMELINA DE LA RAMA" 5
if [ $? -ge 90 ]; then ((exceeding_clients++)); fi
((total_clients++))

echo "=========================================="
echo "FINAL SUMMARY"
echo "=========================================="
echo ""
echo "Total Clients Tested: $total_clients"
echo "Clients Exceeding 90%: $exceeding_clients"
echo ""

if [ $exceeding_clients -eq $total_clients ]; then
    echo "✅ ALL CLIENTS EXCEED 90% SUCCESS RATE"
    echo "✅ ENHANCED PERMUTATION SEARCH: PRODUCTION READY"
else
    echo "⚠️  SOME CLIENTS BELOW 90% SUCCESS RATE"
    echo "❌ NEEDS FURTHER OPTIMIZATION"
fi

echo ""
echo "=========================================="
echo "TEST COMPLETE"
echo "=========================================="
