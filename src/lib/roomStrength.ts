// ---------------------------------------------------------------------------
// Positional strength (read path). Combines the CACHED player game-log stats
// (heavy, precomputed by the sync) with LIVE current rosters, so roster moves
// reflect instantly while the expensive scoring stays cached.
//
// Each position room is ranked by placement (1..N teams) for both the starting
// core and the bench, and every player carries its box-plot summary.
// ---------------------------------------------------------------------------

import { supabase } from "./supabase";
import {
  getFullRosters,
  getLeague,
  getLeagueUsers,
  getPlayerMap,
  type PlayerInfo,
} from "./sleeper";

export const ROOM_GROUPS = [
  { key: "QB", label: "Quarterback", positions: ["QB"] },
  { key: "RB", label: "Running back", positions: ["RB"] },
  { key: "WR", label: "Wide receiver", positions: ["WR"] },
  { key: "TE", label: "Tight end", positions: ["TE"] },
  { key: "FLEX", label: "Flex", positions: ["RB", "WR", "TE"] },
] as const;

const MIN_GAMES = 4; // enough real games to be ranked

export type PlayerStat = {
  gp: number; mean: number; median: number;
  min: number; q1: number; q3: number; max: number;
};

export type RoomPlayer = PlayerStat & {
  id: string;
  name: string;
  team: string | null;
  posRank: number;   // rank within the position pool, by PPG (1 = best)
  isStarter: boolean; // part of the top-N core
};

export type RoomTeam = {
  rosterId: number;
  handle: string;
  teamName: string;
  logo: string | null;
  isMe: boolean;
  starterPlacement: number | null; // 1..N among teams (1 = strongest starters)
  benchPlacement: number | null;   // 1..N among teams (1 = best bench)
  starterCount: number;
  benchCount: number;
  players: RoomPlayer[]; // ranked best-first; core flagged
};

export type PositionRoom = {
  position: string;
  label: string;
  startersN: number;
  teams: RoomTeam[]; // sorted by starter placement, strongest first
};

// Read the cached game-log stats for a league (null if not synced yet).
export async function getCachedPlayerStats(
  leagueId: string
): Promise<Record<string, PlayerStat> | null> {
  const { data, error } = await supabase
    .from("league_cache")
    .select("payload")
    .eq("league_id", leagueId)
    .eq("cache_key", "player_stats")
    .maybeSingle();
  if (error || !data) return null;
  return data.payload as Record<string, PlayerStat>;
}

function slotCount(rosterPositions: string[], slot: string) {
  return rosterPositions.filter((s) => s === slot).length;
}

export async function getRoomStrength(
  leagueId: string,
  myUserId?: string | null
): Promise<{ rooms: PositionRoom[]; synced: boolean }> {
  const [stats, rosters, users, league, playerMap] = await Promise.all([
    getCachedPlayerStats(leagueId),
    getFullRosters(leagueId),
    getLeagueUsers(leagueId),
    getLeague(leagueId),
    getPlayerMap(),
  ]);
  if (!stats) return { rooms: [], synced: false };

  const byOwner = new Map(users.map((u) => [u.user_id, u]));
  const rp = league?.rosterPositions ?? [];
  const flexSlots =
    slotCount(rp, "FLEX") + slotCount(rp, "WRRB_FLEX") + slotCount(rp, "REC_FLEX") + slotCount(rp, "WRRB_WRT");
  const nFor: Record<string, number> = {
    QB: Math.max(1, slotCount(rp, "QB")),
    RB: Math.max(1, slotCount(rp, "RB")),
    WR: Math.max(1, slotCount(rp, "WR")),
    TE: Math.max(1, slotCount(rp, "TE")),
    FLEX: Math.max(1, flexSlots),
  };

  const ppg = (pid: string) => stats[pid]?.mean ?? 0;
  const qualified = (pid: string) => (stats[pid]?.gp ?? 0) >= MIN_GAMES;
  const posOf = (pid: string) => playerMap[pid]?.position ?? "";

  // Each team's dedicated RB/WR/TE starters — excluded from the Flex room.
  const dedicated = new Map<number, Set<string>>();
  for (const r of rosters) {
    const set = new Set<string>();
    for (const pos of ["RB", "WR", "TE"] as const) {
      (r.players ?? [])
        .filter((pid) => posOf(pid) === pos && qualified(pid))
        .sort((a, b) => ppg(b) - ppg(a))
        .slice(0, nFor[pos])
        .forEach((pid) => set.add(pid));
    }
    dedicated.set(r.roster_id, set);
  }

  const rooms: PositionRoom[] = ROOM_GROUPS.map((g) => {
    const eligible = new Set<string>(g.positions);
    const N = nFor[g.key];

    // League-wide pool rank at this position (by PPG).
    const pool = rosters
      .flatMap((r) => r.players ?? [])
      .filter((pid) => eligible.has(posOf(pid)) && qualified(pid))
      .map((pid) => ({ pid, ppg: ppg(pid) }))
      .sort((a, b) => b.ppg - a.ppg);
    const posRankOf = new Map<string, number>();
    pool.forEach((x, i) => posRankOf.set(x.pid, i + 1));

    const teams = rosters.map((r) => {
      const u = r.owner_id ? byOwner.get(r.owner_id) : undefined;
      const ded = g.key === "FLEX" ? dedicated.get(r.roster_id) ?? new Set() : new Set<string>();
      const players: RoomPlayer[] = (r.players ?? [])
        .filter((pid) => posRankOf.has(pid) && !ded.has(pid))
        .map((pid) => ({
          id: pid,
          name: playerMap[pid]?.name ?? pid,
          team: playerMap[pid]?.team ?? null,
          posRank: posRankOf.get(pid)!,
          isStarter: false,
          ...stats[pid],
        }))
        .sort((a, b) => b.mean - a.mean);
      players.forEach((p, i) => (p.isStarter = i < N));
      const core = players.slice(0, N);
      const bench = players.slice(N);
      const avg = (arr: RoomPlayer[]) =>
        arr.length ? arr.reduce((s, p) => s + p.posRank, 0) / arr.length : null;
      return {
        rosterId: r.roster_id,
        handle: u?.display_name || "unknown",
        teamName: u?.team_name || u?.display_name || "Unknown",
        logo: u?.teamAvatar ?? null,
        isMe: !!myUserId && r.owner_id === myUserId,
        _starterAvg: avg(core),
        _benchAvg: avg(bench),
        starterPlacement: null as number | null,
        benchPlacement: null as number | null,
        starterCount: core.length,
        benchCount: bench.length,
        players,
      };
    });

    // Placement = rank among teams (lower avg posRank = better).
    const place = (key: "_starterAvg" | "_benchAvg", out: "starterPlacement" | "benchPlacement") => {
      [...teams]
        .sort((a, b) => (a[key] ?? Infinity) - (b[key] ?? Infinity))
        .forEach((t, i) => {
          t[out] = t[key] == null ? null : i + 1;
        });
    };
    place("_starterAvg", "starterPlacement");
    place("_benchAvg", "benchPlacement");

    teams.sort((a, b) => (a.starterPlacement ?? 99) - (b.starterPlacement ?? 99));
    return {
      position: g.key,
      label: g.label,
      startersN: N,
      teams: teams.map(({ _starterAvg, _benchAvg, ...t }) => {
        void _starterAvg; void _benchAvg;
        return t;
      }),
    };
  });

  return { rooms, synced: true };
}
