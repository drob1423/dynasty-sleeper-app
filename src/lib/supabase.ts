// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
// This creates the single connection to our Supabase project (database + auth).
// The URL and key come from .env.local (and from Vercel's env vars in prod).
// The publishable/anon key is safe to expose in the browser — it only allows
// what our security rules permit.
//
// Session persistence is controlled by a "remember me" flag (see below). When
// it's on, the auth session lives in localStorage and survives closing the
// browser; when it's off, it lives in sessionStorage and clears when the tab
// closes. The login screen sets the flag before signing in.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Where we remember the user's "remember me" choice (this key itself always
// lives in localStorage so the choice is durable).
const REMEMBER_KEY = "di-remember-me";

// Default to remembering — most people expect to stay logged in.
function shouldRemember(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(REMEMBER_KEY) !== "false";
}

/**
 * Record whether future sessions should persist across browser restarts.
 * Call this right before signing in.
 */
export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
}

// A storage adapter that routes the Supabase auth session to either
// localStorage ("remember me" on) or sessionStorage (off), and reads from
// whichever one currently holds it.
const rememberAwareStorage = {
  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    return (
      window.localStorage.getItem(key) ??
      window.sessionStorage.getItem(key)
    );
  },
  setItem(key: string, value: string): void {
    if (typeof window === "undefined") return;
    if (shouldRemember()) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  },
  removeItem(key: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: rememberAwareStorage,
  },
});
