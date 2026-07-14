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
  score: number; // Σ PPG of the startable core (higher = stronger)
  rank: number; // team's rank among the league for this position
  starters: number; // how many players counted toward the score (N)
  players: RoomPlayer[]; // ranked contributors, best first; starters flagged
};

export type PositionStrength = {
  position: RankedPosition;
  teams: TeamRoom[]; // ranked, strongest first
  starters: number; // # of players that count toward the score (N)
  leagueMax: number; // best score in the league (for bar scaling)
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
  const nFor = (key: RankedPosition): number => {
    switch (key) {
      case "QB":
        return Math.max(1, count("QB"));
      // Single positions: dedicated slots + one, so a startable backup counts.
      case "RB":
        return Math.max(1, count("RB")) + 1;
      case "WR":
        return Math.max(1, count("WR")) + 1;
      case "TE":
        return Math.max(1, count("TE")) + 1;
      // Flex = the whole skill-position starting lineup.
      case "FLEX":
        return Math.max(
          1,
          count("RB") + count("WR") + count("TE") + flexSlots
        );
    }
  };

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
      const players: RoomPlayer[] = (rosterPlayers.get(r.roster_id) ?? [])
        .filter((pid) => posRankOf.has(pid))
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
      // The top-N producers are the startable core that scores the room.
      players.forEach((p, i) => (p.isStarter = i < N));
      const core = players.slice(0, N);
      const score = core.reduce((s, p) => s + p.ppg, 0);
      return {
        rosterId: r.roster_id,
        handle: u?.display_name || "unknown",
        teamName: u?.team_name || u?.display_name || "Unknown",
        logo: u?.teamAvatar ?? null,
        isMe: !!myUserId && r.owner_id === myUserId,
        score,
        rank: 0,
        starters: core.length,
        players,
      };
    });

    // Sort by startable firepower (higher = stronger).
    teams.sort((a, b) => b.score - a.score);
    teams.forEach((t, i) => (t.rank = i + 1));
    const leagueMax = teams.length ? teams[0].score : 0;
    return { position, teams, starters: N, leagueMax };
  });

  return result;
}
