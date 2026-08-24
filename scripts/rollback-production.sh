#!/usr/bin/env bash
# Rolls production back to a previous known-good deployment.
#
# No rollback procedure existed anywhere in this project before this --
# flagged as an open gap across several review rounds and never actually
# closed until now. If a bad deployment ever slipped past the deploy job's
# smoke test (.github/workflows/test.yml — deploy → smoke-test → promote),
# or a real problem only shows up in front of real traffic after promotion,
# this is how to get back to the last good deployment without waiting on a
# revert commit and a full CI run.
#
# Usage:
#   scripts/rollback-production.sh                          lists recent
#     production deployments to choose from
#   scripts/rollback-production.sh <deployment-url-or-id>    rolls back to
#     that one, then re-runs the smoke test against the live production
#     domain to confirm the rollback actually took and is healthy
#
# Requires the Vercel CLI to be authenticated (run `vercel login` first if
# `vercel whoami` doesn't already show you logged in).
set -euo pipefail

PRODUCTION_DOMAIN="https://tasklocal-home-service-customer-app.vercel.app"
TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  echo "Usage: $0 <deployment-url-or-id>"
  echo
  echo "Recent production deployments (pick one of the URLs below):"
  vercel ls --environment production --limit 10
  exit 1
fi

echo "Rolling back production to $TARGET..."
vercel rollback "$TARGET" --yes

echo
echo "Re-running the smoke test against $PRODUCTION_DOMAIN to confirm the rollback is live and healthy..."
"$(dirname "$0")/smoke-test-deployment.sh" "$PRODUCTION_DOMAIN"
