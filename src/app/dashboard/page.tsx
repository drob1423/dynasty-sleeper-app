"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getDynastyLeagues, type SleeperLeague } from "@/lib/sleeper";

const CURRENT_SEASON = "2026";

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sleeperName, setSleeperName] = useState("");
  const [leagues, setLeagues] = useState<SleeperLeague[]>([]);

  useEffect(() => {
    async function load() {
      // Who's logged in?
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      // Not logged in → bounce to login page
      if (!user) {
        router.replace("/login");
        return;
      }

      // Pull the Sleeper identity we saved at signup
      const sleeperUserId = user.user_metadata?.sleeper_user_id as
        | string
        | undefined;
      const displayName = user.user_metadata?.sleeper_display_name as
        | string
        | undefined;

      setSleeperName(displayName ?? "");

      if (sleeperUserId) {
        const dynasty = await getDynastyLeagues(sleeperUserId, CURRENT_SEASON);
        setLeagues(dynasty);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
        Loading your leagues…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-12 font-sans">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Welcome, {sleeperName || "manager"}
            </h1>
            <p className="text-sm text-zinc-400">Your dynasty leagues</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Log out
          </button>
        </div>

        {leagues.length === 0 ? (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-300">
            No dynasty leagues found for {CURRENT_SEASON}.
          </p>
        ) : (
          <ul className="space-y-3">
            {leagues.map((l) => (
              <li
                key={l.league_id}
                className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
              >
                <span className="font-semibold text-white">{l.name}</span>
                <span className="text-xs text-zinc-500">
                  {l.total_rosters} teams
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
