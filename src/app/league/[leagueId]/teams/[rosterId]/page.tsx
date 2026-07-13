"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getFullRosters, getLeagueUsers } from "@/lib/sleeper";
import { RosterView } from "../RosterView";

export default function TeamDetail() {
  const params = useParams();
  const leagueId = params.leagueId as string;
  const rosterId = Number(params.rosterId);

  const [teamName, setTeamName] = useState("");
  const [handle, setHandle] = useState("");
  const [teamLogo, setTeamLogo] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const [rosters, users] = await Promise.all([
        getFullRosters(leagueId),
        getLeagueUsers(leagueId),
      ]);
      const roster = rosters.find((r) => r.roster_id === rosterId);
      const u = roster?.owner_id
        ? users.find((x) => x.user_id === roster.owner_id)
        : undefined;
      setTeamName(u?.team_name || u?.display_name || "Unknown");
      setHandle(u?.display_name || "unknown");
      setTeamLogo(u?.teamAvatar ?? null);
      setCount(roster?.players.length ?? 0);
    }
    load();
  }, [leagueId, rosterId]);

  return (
    <div>
      <Link href="../teams" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← All rivals
      </Link>
      <div className="mt-2 mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
          {teamLogo && (
            <img
              src={teamLogo}
              alt=""
              className="h-12 w-12 object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{teamName || " "}</h2>
          <p className="text-sm text-zinc-500">
            @{handle}
            {count != null && ` · ${count} players`}
          </p>
        </div>
      </div>

      <RosterView leagueId={leagueId} rosterId={rosterId} />
    </div>
  );
}
