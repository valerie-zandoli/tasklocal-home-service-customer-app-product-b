#!/usr/bin/env bash
# Verifies routing/header behavior against an actual deployed URL — the
# thing node --test can't cover, since it needs Vercel's real routing engine.
# Written after three consecutive rounds of bugs in vercel.json (root path
# 404ing, trailing slashes 404ing, redirects missing security headers) that
# only ever got caught by manually re-running these exact checks by hand.
#
# check_status/check_header only look at status codes and header *presence*
# -- neither ever inspects the response body, so a routing rule that starts
# shadowing one page with another's content (same failure family as the
# rewrite bugs above, just one layer deeper) would sail through both
# unnoticed as long as the status code still looked right. check_body closes
# that: each key page is checked for an element id that only that page's own
# HTML contains, so a page silently serving the wrong content actually fails.
#
# Usage: scripts/smoke-test-deployment.sh <deployment-url-or-alias>
# Requires the Vercel CLI to be authenticated (this script shells out to
# `vercel curl`, which handles Vercel's deployment-protection bypass so this
# works against a protected preview URL without needing a browser session).
set -uo pipefail

DEP="${1:?Usage: $0 <deployment-url-or-alias>}"
FAIL=0

check_status() {
  local path="$1" expected="$2"
  local actual
  actual=$(vercel curl "$path" --deployment "$DEP" -s -o /dev/null -w '%{http_code}' 2>/dev/null | tail -1)
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $path expected $expected got $actual"
    FAIL=1
  else
    echo "ok:   $path -> $actual"
  fi
}

check_header() {
  local path="$1" header="$2"
  local headers
  headers=$(vercel curl "$path" --deployment "$DEP" -sI 2>/dev/null)
  if ! echo "$headers" | grep -qi "^${header}:"; then
    echo "FAIL: $path missing header $header"
    FAIL=1
  else
    echo "ok:   $path has $header"
  fi
}

check_body() {
  local path="$1" marker="$2"
  local body
  body=$(vercel curl "$path" --deployment "$DEP" -s 2>/dev/null)
  if ! echo "$body" | grep -qF "$marker"; then
    echo "FAIL: $path body missing expected marker: $marker"
    FAIL=1
  else
    echo "ok:   $path body has expected content"
  fi
}

check_status "/" 200
check_status "/login" 200
check_status "/login/" 308
check_status "/login.html" 308
check_status "/listings" 200
check_status "/listings/" 308
check_status "/listing" 200
check_status "/bookings" 200
check_status "/bookings/" 308
check_status "/index" 308
check_status "/manifest.json" 200
check_status "/manifest-dark.json" 200
check_status "/sw.js" 200
check_status "/css/styles.css" 200
# One representative file per static-asset directory the app actually
# depends on at runtime (relative fetch("data/...") and <script src="js/...">
# calls resolve to these). Catches a routes rule that shadows a whole
# directory, not just the three specific files checked below -- js/api.js
# and js/nav.js are separate imports from separate pages, not the same file
# under two names.
check_status "/js/api.js" 200
check_status "/js/nav.js" 200
check_status "/data/listings.json" 200
check_status "/assets/logo.svg" 200
check_status "/this-path-should-not-exist-smoketest" 404

check_header "/" "content-security-policy"
check_header "/login.html" "content-security-policy"
check_header "/this-path-should-not-exist-smoketest" "content-security-policy"
check_header "/sw.js" "cache-control"

# One element id unique to each page's own HTML -- catches a routing rule
# that returns 200 with the *wrong* page's content, which check_status alone
# can't tell apart from the right page also returning 200. "app-nav" isn't
# used here because listings/listing/bookings all share that nav markup.
check_body "/" 'id="loading-state"'
check_body "/login" 'id="login-form"'
check_body "/listings" 'id="listing-grid"'
check_body "/listing" 'id="listing-detail"'
check_body "/bookings" 'id="bookings-list"'

exit $FAIL
