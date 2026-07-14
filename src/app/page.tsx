"use client";

import { useState } from "react";
import Link from "next/link";
import { getUser, getDynastyLeagues, type SleeperLeague } from "@/lib/sleeper";
import { supabase } from "@/lib/supabase";

// The current NFL season we look leagues up against.
const CURRENT_SEASON = "2026";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [username, setUsername] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<SleeperLeague[] | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLeagues(null);
    setSuccess(false);

    // Basic form checks first
    if (!email || !password || !confirm || !username) {
      setError("Please fill in every field.");
      return;
    }
    if (password !== confirm) {
      setError("Your passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    // Step 1: confirm the Sleeper username actually exists
    const user = await getUser(username);
    if (!user) {
      setLoading(false);
      setError(
        `We couldn't find a Sleeper account named "${username}". Double-check the spelling.`
      );
      return;
    }

    // Step 2: pull their dynasty leagues for this season
    const dynasty = await getDynastyLeagues(user.user_id, CURRENT_SEASON);

    // Step 3: create the real account in Supabase. We attach their verified
    // Sleeper identity to the account so we never have to re-look it up.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          sleeper_username: user.username,
          sleeper_user_id: user.user_id,
          sleeper_display_name: user.display_name,
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      // Most common: email already registered
      setError(signUpError.message);
      return;
    }

    // Mirror the Sleeper identity into the public profiles table so leaguemates
    // can see who's joined the app. (auth metadata isn't readable across users.)
    if (signUpData.user) {
      await supabase.from("profiles").upsert({
        id: signUpData.user.id,
        sleeper_user_id: user.user_id,
        sleeper_username: user.username,
        sleeper_display_name: user.display_name,
      });
    }

    setLoading(false);

    setDisplayName(user.display_name);
    setLeagues(dynasty);
    setSuccess(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-12 font-sans">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Dynasty Intelligence
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Know your league better than anyone else in it.
          </p>
        </div>

        {/* Signup card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@email.com"
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="At least 6 characters"
            />
            <Field
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              placeholder="Re-enter your password"
            />
            <Field
              label="Sleeper username"
              type="text"
              value={username}
              onChange={setUsername}
              placeholder="Your Sleeper handle"
            />

            {error && (
              <p className="rounded-lg bg-red-950/60 border border-red-900 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? "Checking Sleeper…" : "Create account"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-zinc-400">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-emerald-400 hover:text-emerald-300">
              Log in
            </Link>
          </p>
        </div>

        {/* Result: account created + dynasty leagues found */}
        {leagues && (
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            {success && (
              <div className="mb-4 rounded-lg bg-emerald-950/60 border border-emerald-900 px-3 py-2 text-sm text-emerald-300">
                🎉 Account created! You can{" "}
                <Link href="/login" className="font-semibold underline">
                  log in
                </Link>{" "}
                now.
              </div>
            )}
            <p className="text-sm text-zinc-400">
              Verified as{" "}
              <span className="font-semibold text-white">{displayName}</span>
            </p>

            {leagues.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-300">
                No dynasty leagues found for {CURRENT_SEASON}. (We only support
                dynasty leagues right now — keeper and redraft are coming later.)
              </p>
            ) : (
              <>
                <p className="mt-3 mb-2 text-sm font-medium text-white">
                  Your dynasty leagues:
                </p>
                <ul className="space-y-2">
                  {leagues.map((l) => (
                    <li
                      key={l.league_id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3"
                    >
                      <span className="font-medium text-white">{l.name}</span>
                      <span className="text-xs text-zinc-500">
                        {l.total_rosters} teams
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// A small reusable labeled input so the form stays tidy.
// Password fields get a show/hide eye toggle automatically.
function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const isPassword = type === "password";
  const [show, setShow] = useState(false);

  // When it's a password field, we flip the actual input type based on `show`.
  const inputType = isPassword ? (show ? "text" : "password") : type;

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-300">
        {label}
      </span>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white placeholder-zinc-600 outline-none focus:border-emerald-500"
          style={isPassword ? { paddingRight: "2.75rem" } : undefined}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500 hover:text-zinc-300"
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
    </label>
  );
}

// Simple inline SVG eye icons so we don't need an icon library.
function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.06 6.06A13.16 13.16 0 0 0 2 12s3.5 7 10 7a9.12 9.12 0 0 0 3.94-.9" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
