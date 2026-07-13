// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
// This creates the single connection to our Supabase project (database + auth).
// The URL and key come from .env.local (and from Vercel's env vars in prod).
// The publishable/anon key is safe to expose in the browser — it only allows
// what our security rules permit.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey);
