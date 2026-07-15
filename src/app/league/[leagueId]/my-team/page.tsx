"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { loadTeamCards, type TeamCard } from "../teams/teamData";
import { TeamScoreCard } from "../teams/TeamScoreCard";
import { RosterView } from "../teams/RosterView";
import { TeamStrengthPanel } from "./TeamStrengthPanel";
import { MyNeedsStrengths } from "./MyNeedsStrengths";

export default function MyTeamTab() {
  const params = useParams();
  const leagueId = params.leagueId as string;

  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState<TeamCard | null>(null);

  useEffect(() => {
    async function load() {
      const { cards } = await loadTeamCards(leagueId);
      setMine(cards.find((c) => c.isMe) ?? null);
      setLoading(false);
    }
    load();
  }, [leagueId]);

  if (loading) {
    return <p className="py-10 text-center text-zinc-400">Loading your team…</p>;
  }

  if (!mine) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        We couldn&apos;t find your team in this league.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TeamScoreCard t={mine} highlight extra={<TeamStrengthPanel leagueId={leagueId} />} />

      <MyNeedsStrengths leagueId={leagueId} rosterId={mine.rosterId} />

      <div>
        <h3 className="mb-3 text-lg font-semibold text-white">Your Roster</h3>
        <RosterView leagueId={leagueId} rosterId={mine.rosterId} />
      </div>
    </div>
  );
}
