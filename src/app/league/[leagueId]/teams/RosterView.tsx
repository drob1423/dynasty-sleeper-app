"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { getFullRosters, getPlayerMap, type PlayerInfo } from "@/lib/sleeper";

const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

type RosterPlayer = {
  id: string;
  info: PlayerInfo;
  isStarter: boolean;
  isTaxi: boolean;
  isIR: boolean;
};

// The position-grouped roster for a team (no header). Shared by the roster
// detail page and the My Team tab.
export function RosterView({
  leagueId,
  rosterId,
}: {
  leagueId: string;
  rosterId: number;
}) {
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);

  useEffect(() => {
    async function load() {
      const [rosters, playerMap] = await Promise.all([
        getFullRosters(leagueId),
        getPlayerMap(),
      ]);
      const roster = rosters.find((r) => r.roster_id === rosterId);
      if (!roster) {
        setLoading(false);
        return;
      }
      const starters = new Set(roster.starters);
      const taxi = new Set(roster.taxi);
      const ir = new Set(roster.reserve);
      setPlayers(
        roster.players.map((id) => ({
          id,
          info:
            playerMap[id] ??
            { name: `Player ${id}`, position: "?", team: null, age: null, yearsExp: null },
          isStarter: starters.has(id),
          isTaxi: taxi.has(id),
          isIR: ir.has(id),
        }))
      );
      setLoading(false);
    }
    load();
  }, [leagueId, rosterId]);

  if (loading) {
    return <p className="py-6 text-center text-zinc-400">Loading roster…</p>;
  }

  // Within a position group: starters first, then bench, then taxi, then IR;
  // and within each of those, youngest first (dynasty lens).
  const statusRank = (p: RosterPlayer) =>
    p.isStarter ? 0 : p.isIR ? 3 : p.isTaxi ? 2 : 1;
  const sortRoster = (a: RosterPlayer, b: RosterPlayer) =>
    statusRank(a) - statusRank(b) ||
    (a.info.age ?? 99) - (b.info.age ?? 99) ||
    a.info.name.localeCompare(b.info.name);

  const groups = [...POS_ORDER, "Other"]
    .map((pos) => ({
      pos,
      players: players
        .filter((p) =>
          pos === "Other"
            ? !POS_ORDER.includes(p.info.position ?? "?")
            : p.info.position === pos
        )
        .sort(sortRoster),
    }))
    .filter((g) => g.players.length > 0);

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.pos}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {g.pos}
            <span className="ml-1 text-zinc-600">({g.players.length})</span>
          </h3>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            {g.players.map((p, i) => (
              <Link
                key={p.id}
                href={`/league/${leagueId}/player/${p.id}`}
                className={[
                  "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-800/50",
                  i > 0 ? "border-t border-zinc-800/60" : "",
                ].join(" ")}
              >
                <Avatar id={p.id} position={p.info.position} team={p.info.team} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{p.info.name}</span>
                    {p.isStarter && <Tag color="emerald">Starter</Tag>}
                    {p.isTaxi && <Tag color="sky">Taxi</Tag>}
                    {p.isIR && <Tag color="red">IR</Tag>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                    <TeamLogo team={p.info.team} />
                    {p.info.team ?? "FA"}
                    {p.info.age != null && ` · ${p.info.age} yrs`}
                    {p.info.yearsExp != null &&
                      ` · ${p.info.yearsExp === 0 ? "Rookie" : `${p.info.yearsExp} exp`}`}
                  </div>
                </div>
                <span className="text-xs font-medium text-zinc-600">
                  {p.info.position}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Avatar({
  id,
  position,
  team,
}: {
  id: string;
  position: string | null;
  team: string | null;
}) {
  const isDef = position === "DEF";
  const src =
    isDef && team
      ? `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`
      : `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
      <img
        src={src}
        alt=""
        loading="lazy"
        className={isDef ? "h-7 w-7 object-contain" : "h-10 w-10 object-cover"}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    </div>
  );
}

function TeamLogo({ team }: { team: string | null }) {
  if (!team) return null;
  return (
    <img
      src={`https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`}
      alt=""
      loading="lazy"
      className="h-3.5 w-3.5 object-contain"
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

function Tag({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "emerald" | "sky" | "red";
}) {
  const colors = {
    emerald: "bg-emerald-950 text-emerald-400 border-emerald-900",
    sky: "bg-sky-950 text-sky-400 border-sky-900",
    red: "bg-red-950 text-red-400 border-red-900",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${colors[color]}`}
    >
      {children}
    </span>
  );
}
