"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { loadTeamCards, type TeamCard } from "./teamData";
import { TeamScoreCard } from "./TeamScoreCard";

export default function RivalsTab() {
  const params = useParams();
  const leagueId = params.leagueId as string;

  const [loading, setLoading] = useState(true);
  const [rivals, setRivals] = useState<TeamCard[]>([]);
  const [lastSeason, setLastSeason] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { cards, lastSeason } = await loadTeamCards(leagueId);
      // Rivals = everyone but you, sorted by last-season finish.
      const others = cards
        .filter((c) => !c.isMe)
        .sort((a, b) => (a.lastRank ?? 99) - (b.lastRank ?? 99));
      setRivals(others);
      setLastSeason(lastSeason);
      setLoading(false);
    }
    load();
  }, [leagueId]);

  if (loading) {
    return <p className="py-10 text-center text-zinc-400">Loading rivals…</p>;
  }

  return (
    <>
      {lastSeason && (
        <p className="mb-3 text-xs text-zinc-500">
          Ranked by {lastSeason} finish
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {rivals.map((t) => (
          <TeamScoreCard
            key={t.rosterId}
            t={t}
            href={`teams/${t.rosterId}`}
          />
        ))}
      </div>
    </>
  );
}
