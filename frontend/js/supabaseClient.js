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
export function _setClientForTesting(client) {
  _client = client;
}
