export function isSupabaseConfigured() {
  const c = window.APP_CONFIG || {};
  return Boolean(c.SUPABASE_URL && c.SUPABASE_ANON_KEY);
}

let _client = null;

export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (_client) return _client;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  _client = createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_ANON_KEY);
  return _client;
}
