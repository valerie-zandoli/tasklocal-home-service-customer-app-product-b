export function isSupabaseConfigured() {
  const c = window.APP_CONFIG || {};
  return Boolean(c.SUPABASE_URL && c.SUPABASE_ANON_KEY);
}

let _client = null;

export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (_client) return _client;
  // Pinned to an exact version, not the @2 semver range: esm.sh serves
  // whatever currently matches a range, so an unpinned import means the
  // exact code running in users' browsers can change with no corresponding
  // commit or review. Bump deliberately when there's a reason to.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.112.3");
  _client = createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);
  return _client;
}

// Test-only seam: _client is checked before the esm.sh import above, so
// setting it directly lets api.test.mjs exercise api.js's
// isSupabaseConfigured() === true code paths with a fake client - no real
// network call to esm.sh or a real Supabase project, and no experimental
// Node module-mocking flag. No production code path calls this.
//
// This file ships to production as-is (no build/bundling step strips test
// code), so this export is reachable from any real browser too - and
// without a guard, anyone with devtools open on the live site could swap
// out the app's real Supabase client for their own. `process` is a real
// Node global no actual browser defines (jsdom runs inside Node, so it's
// still present there), which reliably tells "running under `node --test`"
// apart from "running in a real browser" - the no-op below makes this a
// dead function outside the former.
export function _setClientForTesting(client) {
  if (typeof process === "undefined") return;
  _client = client;
}
