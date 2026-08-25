// Client-side config. SUPABASE_ANON_KEY is a PUBLIC key by design (Supabase
// docs: safe to expose in a browser, access is enforced by Row Level Security
// policies in backend/schema.sql) — it is safe to commit here once filled in.
// The SERVICE ROLE key must never appear in this file or anywhere in frontend/.
//
// Leave both blank to run in local demo mode against the sample data in
// frontend/data/ instead of a real Supabase project.
window.APP_CONFIG = {
  SUPABASE_URL: "https://bikimbnqtvbqzprfgzfj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_C5VQy9h0OV5LSSCsKqoneQ_R3RaN59S",
};
