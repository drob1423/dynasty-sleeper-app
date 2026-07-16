"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { getFullRosters, getPlayerMap, type PlayerInfo } from "@/lib/sleeper";
import {
  getRosterInsights,
  type PlayerInsight,
} from "@/lib/rosterInsights";
import { getRoomStrength } from "@/lib/roomStrength";

// A player's rank + points per game from the synced positional engine — the
// single source of truth shared with the Positions tab and the needs engine.
type RoomStat = { rank: number; mean: number };

const POS_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

type RosterPlayer = {
  id: string;
  info: PlayerInfo;
  isStarter: boolean;
  isTaxi: boolean;
  isIR: boolean;
};

export function RosterView({
  leagueId,
  rosterId,
}: {
  leagueId: string;
  rosterId: number;
}) {
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [insights, setInsights] = useState<Record<string, PlayerInsight> | null>(
    null
  );
  // Synced-engine rank/ppg (by player id) + pool size per position.
  const [roomRank, setRoomRank] = useState<Map<string, RoomStat>>(new Map());
  const [poolByPos, setPoolByPos] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    async function load() {
      const [rosters, playerMap] = await Promise.all([
        getFullRosters(leagueId),
        getPlayerMap(),
      ]);
      const roster = rosters.find((r) => r.roster_id === rosterId);
      if (!roster) {
        if (alive) setLoading(false);
        return;
      }
      const starters = new Set(roster.starters);
      const taxi = new Set(roster.taxi);
      const ir = new Set(roster.reserve);
      if (alive) {
        setPlayers(
          roster.players.map((id) => ({
            id,
            info:
              playerMap[id] ??
              { name: `Player ${id}`, position: "?", team: null, age: null, yearsExp: null, fantasyPositions: [] },
            isStarter: starters.has(id),
            isTaxi: taxi.has(id),
            isIR: ir.has(id),
          }))
        );
        setLoading(false);
      }
      // Heavier per-player stats load in the background.
      const [ins, roomRes] = await Promise.all([
        getRosterInsights(leagueId, rosterId, playerMap),
        getRoomStrength(leagueId),
      ]);
      if (!alive) return;
      setInsights(ins);

      // Positional rank + ppg from the synced engine (dedicated rooms only, not
      // Flex), so a player reads the same rank here as on the Positions tab.
      const rank = new Map<string, RoomStat>();
      const pool: Record<string, number> = {};
      for (const room of roomRes.rooms) {
        if (room.position === "FLEX") continue;
        let size = 0;
        for (const team of room.teams) {
          for (const p of team.players) {
            rank.set(p.id, { rank: p.posRank, mean: p.mean });
            // Pool size counts startable players only — taxi/IR carry a
            // would-be rank that shouldn't stretch the "of N" denominator.
            if (p.status === "active") size = Math.max(size, p.posRank);
          }
        }
        pool[room.position] = size;
      }
      setRoomRank(rank);
      setPoolByPos(pool);
    }
    load();
    return () => {
      alive = false;
    };
  }, [leagueId, rosterId]);

  if (loading) {
    return <p className="py-6 text-center text-zinc-400">Loading roster…</p>;
  }

  // Within each position, order by PPG (best first). Uses the synced-engine mean
  // where available (matches the rank shown), falling back to the roster
  // pipeline's PPG for K/DEF; unranked players sink to the bottom.
  const ppgOf = (p: RosterPlayer) =>
    roomRank.get(p.id)?.mean ?? insights?.[p.id]?.ppg ?? -1;

  const groups = [...POS_ORDER, "Other"]
    .map((pos) => ({
      pos,
      players: players
        .filter((p) =>
          pos === "Other"
            ? !POS_ORDER.includes(p.info.position ?? "?")
            : p.info.position === pos
        )
        .sort((a, b) => ppgOf(b) - ppgOf(a)),
    }))
    .filter((g) => g.players.length > 0);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.pos}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {g.pos}
            <span className="ml-1 text-zinc-600">({g.players.length})</span>
          </h3>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            {g.players.map((p, i) => {
              const ins = insights?.[p.id];
              const acq = ins?.acquisition;
              const isTrade = acq?.method === "trade" && acq.trade;
              return (
                <div
                  key={p.id}
                  className={i > 0 ? "border-t border-zinc-800/60" : ""}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Link
                      href={`/league/${leagueId}/player/${p.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <Avatar
                        id={p.id}
                        position={p.info.position}
                        team={p.info.team}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-white">
                            {p.info.name}
                          </span>
                          {p.isStarter && <Tag color="emerald">Starter</Tag>}
                          {p.isTaxi && <Tag color="sky">Taxi</Tag>}
                          {p.isIR && <Tag color="red">IR</Tag>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                          <TeamLogo team={p.info.team} />
                          {p.info.team ?? "FA"}
                          {p.info.age != null && ` · ${p.info.age}y`}
                          {p.info.yearsExp != null &&
                            ` · ${p.info.yearsExp === 0 ? "R" : `${p.info.yearsExp}exp`}`}
                        </div>
                      </div>
                    </Link>
                    <StatCluster
                      insight={ins}
                      position={p.info.position}
                      roomStat={roomRank.get(p.id)}
                      pool={
                        p.info.position
                          ? poolByPos[p.info.position]
                          : undefined
                      }
                      loaded={insights != null}
                    />
                  </div>

                  {/* Acquisition line (indented under the name) */}
                  {acq && acq.method !== "unknown" && (
                    <div className="px-4 pb-2 pl-[52px] text-xs">
                      {isTrade ? (
                        <button
                          onClick={() => toggle(p.id)}
                          className="text-left text-sky-400 hover:text-sky-300"
                        >
                          {acq.label}
                          {acqMeta(acq) && (
                            <span className="text-zinc-500"> · {acqMeta(acq)}</span>
                          )}{" "}
                          · {expanded.has(p.id) ? "hide" : "details"}
                        </button>
                      ) : (
                        <span className="text-zinc-500">
                          <span className="text-zinc-400">{acq.label}</span>
                          {acqMeta(acq) && <> · {acqMeta(acq)}</>}
                        </span>
                      )}
                      {isTrade && expanded.has(p.id) && acq.trade && (
                        <div className="mt-1.5 space-y-1 rounded-lg bg-zinc-950/60 p-2.5">
                          <div className="text-[10px] uppercase tracking-wide text-zinc-600">
                            Trade · {acq.trade.season} wk{acq.trade.week}
                          </div>
                          {acq.trade.sides.map((s, si) => (
                            <div key={si} className="text-zinc-400">
                              <span className="text-zinc-300">@{s.handle}</span>{" "}
                              got{" "}
                              <span className="text-zinc-300">
                                {s.received.length
                                  ? s.received.join(", ")
                                  : "nothing"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// "Wk 1 · Sep 3, 2025" for in-season adds.
function acqMeta(acq: {
  week?: number;
  dateMs?: number;
}): string {
  const parts: string[] = [];
  if (acq.week != null) parts.push(acq.week >= 1 ? `Wk ${acq.week}` : "Offseason");
  if (acq.dateMs) {
    parts.push(
      new Date(acq.dateMs).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    );
  }
  return parts.join(" · ");
}

function StatCluster({
  insight,
  position,
  roomStat,
  pool,
  loaded,
}: {
  insight: PlayerInsight | undefined;
  position: string | null;
  roomStat?: RoomStat;
  pool?: number;
  loaded: boolean;
}) {
  if (!loaded) {
    return <span className="text-xs text-zinc-600">…</span>;
  }
  // Prefer the synced engine for rank + ppg (matches the Positions tab / needs);
  // the roster pipeline still supplies start rate, and rank for K/DEF.
  const ppg = roomStat ? roomStat.mean : insight?.ppg ?? null;
  const rank = roomStat ? roomStat.rank : insight?.rank ?? null;
  const rankPool = roomStat ? pool ?? 0 : insight?.rankPool ?? 0;
  const rate = insight?.startRate;
  const rateColor =
    rate == null
      ? "text-zinc-500"
      : rate >= 0.7
      ? "text-emerald-400"
      : rate >= 0.4
      ? "text-amber-400"
      : "text-red-400";
  return (
    <div className="flex shrink-0 gap-4 text-center">
      <div>
        <div className={`text-sm font-semibold ${rateColor}`}>
          {rate == null ? "—" : `${Math.round(rate * 100)}%`}
        </div>
        <div className="text-[10px] text-zinc-600">
          {insight && insight.rosteredGames > 0
            ? `${insight.startedGames}/${insight.rosteredGames}`
            : "started"}
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold text-white">
          {ppg != null ? ppg.toFixed(1) : "—"}
        </div>
        <div className="text-[10px] text-zinc-600">ppg</div>
      </div>
      <div>
        <div className="text-sm font-semibold text-zinc-200">
          {rank ? `${position}${rank}` : "—"}
        </div>
        <div className="text-[10px] text-zinc-600">
          {rank ? `of ${rankPool}` : "rank"}
        </div>
      </div>
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
