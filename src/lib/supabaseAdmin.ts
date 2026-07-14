// ---------------------------------------------------------------------------
// Server-only Supabase client (service_role key).
//
// This key BYPASSES row-level security, so it may ONLY be used in server code
// (route handlers, server actions). Never import this into a client component —
// the service key must never reach the browser. It reads SUPABASE_SERVICE_ROLE_KEY,
// which is intentionally NOT prefixed NEXT_PUBLIC_ so Next keeps it server-side.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getAdminClient() {
  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (or URL) — sync requires the server-only service key."
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
