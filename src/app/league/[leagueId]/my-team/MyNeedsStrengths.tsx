"use client";

import { useEffect, useState } from "react";
import { getRoomStrength } from "@/lib/roomStrength";
import { computeTradeProfiles, type TradeProfile } from "../teams/tradeProfile";
import { NeedsStrengths } from "../teams/NeedsStrengths";

// The same positional Needs / Strong read the Rivals cards show, for your own
// team — taxi/IR players stay uncounted, just like everywhere else.
export function MyNeedsStrengths({
  leagueId,
  rosterId,
}: {
  leagueId: string;
  rosterId: number;
}) {
  const [profile, setProfile] = useState<TradeProfile | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { rooms } = await getRoomStrength(leagueId);
      if (!alive) return;
      setProfile(computeTradeProfiles(rooms).get(rosterId) ?? null);
    }
    load();
    return () => {
      alive = false;
    };
  }, [leagueId, rosterId]);

  if (!profile || (profile.needs.length === 0 && profile.strengths.length === 0)) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Positional Needs &amp; Strengths
      </h3>
      <NeedsStrengths profile={profile} />
    </div>
  );
}
