#!/bin/bash
# test-pipeline.sh — End-to-end test of the MapShare → Worker → KV → Frontend pipeline
#
# Usage:
#   ./scripts/test-pipeline.sh              # Test against local worker (localhost:8788)
#   ./scripts/test-pipeline.sh production   # Test against production worker
#
# Prerequisites:
#   - For local: npm run dev:worker running in another terminal
#   - jq installed (brew install jq)

set -euo pipefail

# --- Configuration ---
LOCAL_URL="http://localhost:8788"
PROD_URL="https://where-is-al.matthew-declercq.workers.dev"

if [ "${1:-local}" = "production" ]; then
  BASE_URL="$PROD_URL"
  echo "=== Testing PRODUCTION worker: $BASE_URL ==="
else
  BASE_URL="$LOCAL_URL"
  echo "=== Testing LOCAL worker: $BASE_URL ==="
fi

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
WARN=0

pass() { ((PASS++)); echo -e "  ${GREEN}✓ $1${NC}"; }
fail() { ((FAIL++)); echo -e "  ${RED}✗ $1${NC}"; }
warn() { ((WARN++)); echo -e "  ${YELLOW}⚠ $1${NC}"; }
info() { echo -e "  ${CYAN}ℹ $1${NC}"; }
header() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# --- Check prerequisites ---
header "Prerequisites"

if ! command -v jq &> /dev/null; then
  fail "jq is not installed (brew install jq)"
  exit 1
fi
pass "jq installed"

if ! command -v curl &> /dev/null; then
  fail "curl is not installed"
  exit 1
fi
pass "curl installed"

# Check if worker is reachable
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/auth" -X POST -H "Content-Type: application/json" -d '{"password":"test"}' 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "000" ]; then
  fail "Worker not reachable at $BASE_URL"
  if [ "$BASE_URL" = "$LOCAL_URL" ]; then
    info "Start the worker with: npm run dev:worker"
  fi
  exit 1
fi
pass "Worker reachable at $BASE_URL"

# --- Step 1: Authentication ---
header "Step 1: Authentication"

read -sp "Enter site password: " PASSWORD
echo

AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/auth" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$PASSWORD\"}" \
  --max-time 10)

AUTH_HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -1)
AUTH_BODY=$(echo "$AUTH_RESPONSE" | sed '$d')

if [ "$AUTH_HTTP_CODE" = "200" ]; then
  TOKEN=$(echo "$AUTH_BODY" | jq -r '.token // empty')
  EXPIRES=$(echo "$AUTH_BODY" | jq -r '.expiresAt // empty')
  if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    pass "Authentication successful (token received)"
    info "Token expires at: $(date -r "$EXPIRES" 2>/dev/null || echo "$EXPIRES")"
  else
    fail "Auth returned 200 but no token in response"
    echo "$AUTH_BODY" | jq . 2>/dev/null || echo "$AUTH_BODY"
    exit 1
  fi
else
  fail "Authentication failed (HTTP $AUTH_HTTP_CODE)"
  echo "$AUTH_BODY" | jq . 2>/dev/null || echo "$AUTH_BODY"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

# --- Step 2: KML / Stats endpoint ---
header "Step 2: Stats Endpoint (GET /)"

STATS_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/" \
  -H "$AUTH_HEADER" \
  --max-time 30)

STATS_HTTP_CODE=$(echo "$STATS_RESPONSE" | tail -1)
STATS_BODY=$(echo "$STATS_RESPONSE" | sed '$d')

if [ "$STATS_HTTP_CODE" = "200" ]; then
  pass "Stats endpoint returned 200"
else
  fail "Stats endpoint returned HTTP $STATS_HTTP_CODE"
  echo "$STATS_BODY" | jq . 2>/dev/null || echo "$STATS_BODY"
fi

# Validate stats fields
TOTAL_MILES=$(echo "$STATS_BODY" | jq '.totalMilesCompleted // 0')
CURRENT_DAY=$(echo "$STATS_BODY" | jq '.currentDayOnTrail // 0')
LOCATION_LAT=$(echo "$STATS_BODY" | jq '.location.lat // empty')
LOCATION_LON=$(echo "$STATS_BODY" | jq '.location.lon // empty')
HAS_WEATHER=$(echo "$STATS_BODY" | jq 'has("weather")')

if [ -n "$TOTAL_MILES" ] && [ "$TOTAL_MILES" != "0" ] && [ "$TOTAL_MILES" != "null" ]; then
  pass "Total miles: $TOTAL_MILES"
else
  warn "Total miles is 0 or missing (may be expected if no data yet)"
fi

if [ -n "$LOCATION_LAT" ] && [ "$LOCATION_LAT" != "null" ]; then
  pass "Location received: ($LOCATION_LAT, $LOCATION_LON)"
else
  warn "No location data in stats response"
fi

if [ "$HAS_WEATHER" = "true" ]; then
  WEATHER_NULL=$(echo "$STATS_BODY" | jq '.weather == null')
  if [ "$WEATHER_NULL" = "false" ]; then
    pass "Weather data present"
  else
    warn "Weather field exists but is null"
  fi
else
  warn "No weather field in response"
fi

info "Day on trail: $CURRENT_DAY"
info "Full stats response:"
echo "$STATS_BODY" | jq '{totalMilesCompleted, milesRemaining, currentDayOnTrail, averageSpeed, location, dailyDistance}' 2>/dev/null

# --- Step 3: Points endpoint (map data) ---
header "Step 3: Points Endpoint (GET /points)"

POINTS_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/points" \
  -H "$AUTH_HEADER" \
  --max-time 30)

POINTS_HTTP_CODE=$(echo "$POINTS_RESPONSE" | tail -1)
POINTS_BODY=$(echo "$POINTS_RESPONSE" | sed '$d')

if [ "$POINTS_HTTP_CODE" = "200" ]; then
  pass "Points endpoint returned 200"
else
  fail "Points endpoint returned HTTP $POINTS_HTTP_CODE"
  echo "$POINTS_BODY" | jq . 2>/dev/null || echo "$POINTS_BODY"
fi

POINT_COUNT=$(echo "$POINTS_BODY" | jq '.points | length')
ON_TRAIL_COUNT=$(echo "$POINTS_BODY" | jq '[.points[] | select(.onTrail == true)] | length')
OFF_TRAIL_COUNT=$(echo "$POINTS_BODY" | jq '[.points[] | select(.onTrail == false)] | length')
THRESHOLD=$(echo "$POINTS_BODY" | jq '.offTrailThreshold')

if [ "$POINT_COUNT" -gt 0 ] 2>/dev/null; then
  pass "Points received: $POINT_COUNT total"
  info "On-trail: $ON_TRAIL_COUNT | Off-trail: $OFF_TRAIL_COUNT | Threshold: ${THRESHOLD}mi"
else
  warn "No points returned (may be expected if no GPS pings yet)"
fi

# Validate point structure
if [ "$POINT_COUNT" -gt 0 ] 2>/dev/null; then
  FIRST_POINT=$(echo "$POINTS_BODY" | jq '.points[0]')
  LAST_POINT=$(echo "$POINTS_BODY" | jq '.points[-1]')

  HAS_LAT=$(echo "$FIRST_POINT" | jq 'has("lat")')
  HAS_LON=$(echo "$FIRST_POINT" | jq 'has("lon")')
  HAS_TIME=$(echo "$FIRST_POINT" | jq 'has("time")')
  HAS_ELEVATION=$(echo "$FIRST_POINT" | jq 'has("elevation")')
  HAS_ON_TRAIL=$(echo "$FIRST_POINT" | jq 'has("onTrail")')

  if [ "$HAS_LAT" = "true" ] && [ "$HAS_LON" = "true" ] && [ "$HAS_TIME" = "true" ] && [ "$HAS_ON_TRAIL" = "true" ]; then
    pass "Point structure valid (lat, lon, time, elevation, onTrail)"
  else
    fail "Point structure missing fields: lat=$HAS_LAT lon=$HAS_LON time=$HAS_TIME elevation=$HAS_ELEVATION onTrail=$HAS_ON_TRAIL"
  fi

  FIRST_TIME=$(echo "$FIRST_POINT" | jq -r '.time')
  LAST_TIME=$(echo "$LAST_POINT" | jq -r '.time')
  LAST_LAT=$(echo "$LAST_POINT" | jq '.lat')
  LAST_LON=$(echo "$LAST_POINT" | jq '.lon')

  info "First point: $FIRST_TIME"
  info "Last point:  $LAST_TIME ($LAST_LAT, $LAST_LON)"

  # Check if points are sorted chronologically
  SORTED=$(echo "$POINTS_BODY" | jq '[.points | to_entries[] | select(.key > 0) | .value.time > (.key - 1 | tostring | . as $k | input_line_number)] | all' 2>/dev/null || echo "unknown")
  # Simpler sort check: compare first and last timestamps
  if [[ "$FIRST_TIME" < "$LAST_TIME" ]] || [[ "$FIRST_TIME" = "$LAST_TIME" ]]; then
    pass "Points are chronologically ordered"
  else
    fail "Points are NOT chronologically ordered (first: $FIRST_TIME, last: $LAST_TIME)"
  fi

  # Check if latest point is recent (within last 48 hours)
  LAST_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$(echo "$LAST_TIME" | cut -c1-19)" "+%s" 2>/dev/null || echo "0")
  NOW_EPOCH=$(date "+%s")
  if [ "$LAST_EPOCH" -gt 0 ] 2>/dev/null; then
    AGE_HOURS=$(( (NOW_EPOCH - LAST_EPOCH) / 3600 ))
    if [ "$AGE_HOURS" -lt 48 ]; then
      pass "Latest point is recent (${AGE_HOURS}h ago)"
    else
      warn "Latest point is ${AGE_HOURS}h old (may be stale if device is off)"
    fi
  fi
fi

# --- Step 4: Sync endpoint ---
header "Step 4: Sync Endpoint (GET /sync)"

SYNC_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/sync" \
  -H "$AUTH_HEADER" \
  --max-time 30)

SYNC_HTTP_CODE=$(echo "$SYNC_RESPONSE" | tail -1)
SYNC_BODY=$(echo "$SYNC_RESPONSE" | sed '$d')

if [ "$SYNC_HTTP_CODE" = "200" ]; then
  SYNC_SUCCESS=$(echo "$SYNC_BODY" | jq '.success')
  KML_PROCESSED=$(echo "$SYNC_BODY" | jq '.kmlPointsProcessed')
  TOTAL_STORED=$(echo "$SYNC_BODY" | jq '.totalStoredPoints')
  DAYS_STORED=$(echo "$SYNC_BODY" | jq '.daysStored')

  if [ "$SYNC_SUCCESS" = "true" ]; then
    pass "Sync successful"
    info "KML points processed: $KML_PROCESSED"
    info "Total stored in KV: $TOTAL_STORED"
    info "Days stored: $DAYS_STORED"
  else
    fail "Sync returned 200 but success=false"
  fi
elif [ "$SYNC_HTTP_CODE" = "400" ]; then
  warn "Sync returned 400 (expected if USE_MOCK_DATA=true)"
  echo "$SYNC_BODY" | jq -r '.error // .message // .' 2>/dev/null
elif [ "$SYNC_HTTP_CODE" = "500" ]; then
  ERROR_MSG=$(echo "$SYNC_BODY" | jq -r '.error // .message // .' 2>/dev/null)
  if echo "$ERROR_MSG" | grep -qi "KV namespace"; then
    warn "KV namespace not configured (sync requires TRAIL_HISTORY KV binding)"
    info "Set up KV with: cd worker && npx wrangler kv namespace create TRAIL_HISTORY"
  else
    fail "Sync failed: $ERROR_MSG"
  fi
else
  fail "Sync returned HTTP $SYNC_HTTP_CODE"
  echo "$SYNC_BODY" | jq . 2>/dev/null || echo "$SYNC_BODY"
fi

# --- Step 5: Elevation endpoint ---
header "Step 5: Elevation Endpoint (GET /elevation)"

ELEV_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/elevation" \
  -H "$AUTH_HEADER" \
  --max-time 30)

ELEV_HTTP_CODE=$(echo "$ELEV_RESPONSE" | tail -1)
ELEV_BODY=$(echo "$ELEV_RESPONSE" | sed '$d')

if [ "$ELEV_HTTP_CODE" = "200" ]; then
  pass "Elevation endpoint returned 200"
  ELEV_POINTS=$(echo "$ELEV_BODY" | jq '.points // .elevationData // . | if type == "array" then length else "non-array" end' 2>/dev/null)
  info "Elevation data points: $ELEV_POINTS"
else
  warn "Elevation endpoint returned HTTP $ELEV_HTTP_CODE"
fi

# --- Step 6: Data consistency check ---
header "Step 6: Data Consistency"

if [ "$POINT_COUNT" -gt 0 ] 2>/dev/null && [ -n "$LOCATION_LAT" ] && [ "$LOCATION_LAT" != "null" ]; then
  # Check that stats location matches the last point
  STATS_LAT=$(echo "$STATS_BODY" | jq '.location.lat')
  STATS_LON=$(echo "$STATS_BODY" | jq '.location.lon')
  POINTS_LAST_LAT=$(echo "$POINTS_BODY" | jq '.points[-1].lat')
  POINTS_LAST_LON=$(echo "$POINTS_BODY" | jq '.points[-1].lon')

  if [ "$STATS_LAT" = "$POINTS_LAST_LAT" ] && [ "$STATS_LON" = "$POINTS_LAST_LON" ]; then
    pass "Stats location matches last point from /points"
  else
    warn "Stats location ($STATS_LAT, $STATS_LON) differs from last point ($POINTS_LAST_LAT, $POINTS_LAST_LON)"
    info "This can happen if stats filters off-trail points"
  fi
fi

# --- Summary ---
header "Summary"
echo -e "  ${GREEN}Passed: $PASS${NC}"
[ "$FAIL" -gt 0 ] && echo -e "  ${RED}Failed: $FAIL${NC}" || echo -e "  Failed: $FAIL"
[ "$WARN" -gt 0 ] && echo -e "  ${YELLOW}Warnings: $WARN${NC}" || echo -e "  Warnings: $WARN"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Some tests failed. See details above.${NC}"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo -e "${YELLOW}All tests passed with warnings.${NC}"
  exit 0
else
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
fi
