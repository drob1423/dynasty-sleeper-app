// ---------------------------------------------------------------------------
// League positional strength — rank every team's position group (QB/RB/WR/TE)
// against each other. "Who has the strongest QB room? The weakest RB depth?"
//
// Metric: every player's league-wide PPG (points per game they scored in) —
// tenure-neutral, so a rookie compares fairly to a veteran. A team's room is
// scored by the SUM of the PPG of just its startable core — the top-N players
// that would actually fill the lineup (N from the league's starting slots).
// This weights by production (elite studs dominate), caps depth (hoarding
// replaceable bodies doesn't help), and doesn't penalize a deep bench.
// ---------------------------------------------------------------------------

import {
  getSeasonChain,
  getFullRosters,
  getLeagueUsers,
  getPlayerMap,
  seasonHasData,
  type PlayerInfo,
} from "./sleeper";

const BASE = "https://api.sleeper.app/v1";

// Groups we rank, in display order. FLEX pools all skill positions into one
// combined ranking (best overall RB/WR/TE corps).
export const RANKED_GROUPS = [
  { key: "QB", positions: ["QB"] },
  { key: "RB", positions: ["RB"] },
  { key: "WR", positions: ["WR"] },
  { key: "TE", positions: ["TE"] },
  { key: "FLEX", positions: ["RB", "WR", "TE"] },
] as const;
export type RankedPosition = (typeof RANKED_GROUPS)[number]["key"];

// A player must have produced in at least this many games to be ranked, so
// 1–2 game flukes don't distort the pool.
const MIN_GAMES = 3;

export type RoomPlayer = {
  id: string;
  name: string;
  team: string | null;
  ppg: number;
  games: number;
  posRank: number; // league-wide positional rank (1 = best)
  isStarter: boolean; // counts toward the room score (top-N)
};

export type TeamRoom = {
  rosterId: number;
  handle: string;
  teamName: string;
  logo: string | null;
  isMe: boolean;
  starterAvgRank: number | null; // avg league positional rank of the top-N (lower = better)
  depthAvgRank: number | null; // avg league positional rank of the bench (lower = better)
  rank: number; // team's rank (by starter avg rank) for this position
  starterCount: number; // how many players counted as starters (≤ N)
  depthCount: number; // how many bench players counted toward depth
  players: RoomPlayer[]; // ranked contributors, best first; starters flagged
};

export type PositionStrength = {
  position: RankedPosition;
  teams: TeamRoom[]; // ranked by starter strength, strongest first
  starters: number; // starting slots at this position (N)
  starterBest: number; // lowest (best) starter avg rank in the league
  starterWorst: number; // highest (worst) starter avg rank in the league
  depthBest: number; // lowest (best) bench avg rank in the league
  depthWorst: number; // highest (worst) bench avg rank in the league
};

export async function getPositionStrength(
  leagueId: string,
  myUserId?: string | null
): Promise<PositionStrength[]> {
  const [chain, currentRosters, users, playerMap] = await Promise.all([
    getSeasonChain(leagueId),
    getFullRosters(leagueId),
    getLeagueUsers(leagueId),
    getPlayerMap(),
  ]);
  const played = chain.filter(seasonHasData);

  // League-wide scoring: total points + games-scored per player, in one pass
  // over every season's matchups.
  const totalPts = new Map<string, number>();
  const games = new Map<string, number>();
  for (const season of played) {
    const throughWeek = (season.playoff_week_start || 15) - 1;
    const weeks = Array.from({ length: throughWeek }, (_, i) => i + 1);
    const perWeek = await Promise.all(
      weeks.map((w) =>
        fetch(`${BASE}/league/${season.league_id}/matchups/${w}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    );
    for (const ms of perWeek) {
      if (!Array.isArray(ms)) continue;
      for (const m of ms) {
        const pp: Record<string, number> = m.players_points ?? {};
        for (const pid in pp) {
          const pts = pp[pid] || 0;
          totalPts.set(pid, (totalPts.get(pid) ?? 0) + pts);
          if (pts > 0) games.set(pid, (games.get(pid) ?? 0) + 1);
        }
      }
    }
  }

  const ppgOf = (pid: string) => {
    const g = games.get(pid) ?? 0;
    return g > 0 ? (totalPts.get(pid) ?? 0) / g : 0;
  };

  const byId = new Map(users.map((u) => [u.user_id, u]));

  // Currently-rostered players by roster.
  const rosterPlayers = new Map<number, string[]>(
    currentRosters.map((r) => [r.roster_id, r.players ?? []])
  );

  // Starting-lineup slots drive N (how many players count per room). Derived
  // from the league's roster_positions so it adapts to any format.
  const slots = chain[0]?.rosterPositions ?? [];
  const count = (p: string) => slots.filter((s) => s === p).length;
  const flexSlots =
    count("FLEX") + count("WRRB_FLEX") + count("REC_FLEX") + count("WRRB_WRT");
  // N = the players you actually start at the position. Everything productive
  // beyond N is depth.
  const nFor = (key: RankedPosition): number => {
    switch (key) {
      case "QB":
        return Math.max(1, count("QB"));
      case "RB":
        return Math.max(1, count("RB"));
      case "WR":
        return Math.max(1, count("WR"));
      case "TE":
        return Math.max(1, count("TE"));
      // Flex = just the flex slots — filled by the best flex-eligible players
      // AFTER each team's RB/WR/TE starters are set aside (below).
      case "FLEX":
        return Math.max(1, flexSlots);
    }
  };

  // Each team's dedicated RB/WR/TE starters (top-N by PPG at each position).
  // These anchor their own position cards, so the Flex card excludes them —
  // Flex measures the flex pieces behind the studs, not the studs again.
  const dedicatedByRoster = new Map<number, Set<string>>();
  for (const r of currentRosters) {
    const set = new Set<string>();
    for (const pos of ["RB", "WR", "TE"] as const) {
      (r.players ?? [])
        .filter(
          (pid) =>
            playerMap[pid]?.position === pos &&
            (games.get(pid) ?? 0) >= MIN_GAMES
        )
        .sort((a, b) => ppgOf(b) - ppgOf(a))
        .slice(0, nFor(pos))
        .forEach((pid) => set.add(pid));
    }
    dedicatedByRoster.set(r.roster_id, set);
  }

  const result: PositionStrength[] = RANKED_GROUPS.map((group) => {
    const position = group.key;
    const eligible = new Set<string>(group.positions);
    const N = nFor(position);

    // Rank every qualifying rostered player in this group, league-wide.
    const ranked = currentRosters
      .flatMap((r) => r.players ?? [])
      .filter(
        (pid) =>
          eligible.has(playerMap[pid]?.position ?? "") &&
          (games.get(pid) ?? 0) >= MIN_GAMES
      )
      .map((pid) => ({ pid, ppg: ppgOf(pid) }))
      .sort((a, b) => b.ppg - a.ppg);
    const posRankOf = new Map<string, number>();
    ranked.forEach((x, i) => posRankOf.set(x.pid, i + 1));

    const teams: TeamRoom[] = currentRosters.map((r) => {
      const u = r.owner_id ? byId.get(r.owner_id) : undefined;
      const dedicated =
        position === "FLEX"
          ? dedicatedByRoster.get(r.roster_id) ?? new Set<string>()
          : new Set<string>();
      const players: RoomPlayer[] = (rosterPlayers.get(r.roster_id) ?? [])
        .filter((pid) => posRankOf.has(pid) && !dedicated.has(pid))
        .map((pid) => ({
          id: pid,
          name: playerMap[pid]?.name ?? pid,
          team: playerMap[pid]?.team ?? null,
          ppg: ppgOf(pid),
          games: games.get(pid) ?? 0,
          posRank: posRankOf.get(pid)!,
          isStarter: false,
        }))
        .sort((a, b) => b.ppg - a.ppg);
      // The top-N producers are the startable core; the rest is depth.
      players.forEach((p, i) => (p.isStarter = i < N));
      const core = players.slice(0, N);
      const bench = players.slice(N);
      // Both metrics are average league positional rank (lower = better). The
      // top-N starters gauge lineup quality; the bench gauges depth quality —
      // so a few quality backups beat a pile of replaceable bodies.
      const avgRank = (arr: RoomPlayer[]) =>
        arr.length > 0
          ? arr.reduce((s, p) => s + p.posRank, 0) / arr.length
          : null;
      return {
        rosterId: r.roster_id,
        handle: u?.display_name || "unknown",
        teamName: u?.team_name || u?.display_name || "Unknown",
        logo: u?.teamAvatar ?? null,
        isMe: !!myUserId && r.owner_id === myUserId,
        starterAvgRank: avgRank(core),
        depthAvgRank: avgRank(bench),
        rank: 0,
        starterCount: core.length,
        depthCount: bench.length,
        players,
      };
    });

    // Rank by starter quality (lowest avg rank = best); teams with no starter
    // sink to the bottom.
    teams.sort(
      (a, b) => (a.starterAvgRank ?? Infinity) - (b.starterAvgRank ?? Infinity)
    );
    teams.forEach((t, i) => (t.rank = i + 1));
    const spread = (pick: (t: TeamRoom) => number | null) => {
      const vals = teams
        .map(pick)
        .filter((x): x is number => x != null);
      return {
        best: vals.length ? Math.min(...vals) : 0,
        worst: vals.length ? Math.max(...vals) : 0,
      };
    };
    const st = spread((t) => t.starterAvgRank);
    const dp = spread((t) => t.depthAvgRank);
    return {
      position,
      teams,
      starters: N,
      starterBest: st.best,
      starterWorst: st.worst,
      depthBest: dp.best,
      depthWorst: dp.worst,
    };
  });

  return result;
}
