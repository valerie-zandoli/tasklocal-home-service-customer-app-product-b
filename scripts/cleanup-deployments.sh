#!/usr/bin/env bash
# Removes every Vercel deployment for this project except the one currently
# holding the production alias. Vercel doesn't auto-prune deployments, and
# this project's deploy-preview CI job creates a new one on every push — run
# this occasionally so they don't accumulate indefinitely (31 had piled up,
# almost entirely superseded, before this script existed).
#
# --safe skips any deployment with an active alias, so the live production
# deployment is never touched by this regardless of how it's invoked.
#
# Usage: scripts/cleanup-deployments.sh
# Requires the Vercel CLI to be authenticated (run `vercel login` first if
# `vercel whoami` doesn't already show you logged in).
set -euo pipefail

urls=$(vercel ls --limit 100 2>&1 | grep -oE "https://tasklocal[a-z0-9.-]*\.vercel\.app" | sort -u)

if [ -z "$urls" ]; then
  echo "No deployments found (or none matched) -- nothing to do."
  exit 0
fi

count=$(echo "$urls" | wc -l | tr -d ' ')
echo "Found $count deployment(s). Removing all but the one with an active alias..."
# shellcheck disable=SC2086
out=$(vercel remove $urls --safe --yes 2>&1) && { echo "$out"; exit 0; }
# When every remaining deployment is alias-protected (e.g. right after this
# script already ran), --safe has nothing left to remove and exits non-zero
# with this message instead of a quiet no-op. That's success, not failure.
if echo "$out" | grep -q "Could not find unaliased deployments"; then
  echo "Nothing to remove -- every remaining deployment is alias-protected."
  exit 0
fi
echo "$out"
exit 1
