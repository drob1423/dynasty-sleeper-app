// ---------------------------------------------------------------------------
// League positional strength — rank every team's position group (QB/RB/WR/TE)
// against each other. "Who has the strongest QB room? The weakest RB depth?"
//
// Metric: every rostered player at a position is ranked league-wide by PPG
// (points per game they scored in) — tenure-neutral, so a rookie compares
// fairly to a veteran. A team's room is then scored by the AVERAGE positional
// rank of its players (lower = stronger). This measures quality of the room,
// not quantity — hoarding replaceable bodies doesn't inflate a team.
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

// Positions we rank, in display order.
export const RANKED_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export type RankedPosition = (typeof RANKED_POSITIONS)[number];

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
};

export type TeamRoom = {
  rosterId: number;
  handle: string;
  teamName: string;
  logo: string | null;
  isMe: boolean;
  avgRank: number | null; // average positional rank of the room (lower = better)
  rank: number; // team's rank among the league for this position
  players: RoomPlayer[]; // ranked contributors, best first
};

export type PositionStrength = {
  position: RankedPosition;
  teams: TeamRoom[]; // ranked, strongest first
  pool: number; // # of ranked players at this position (for bar scaling)
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

  const result: PositionStrength[] = RANKED_POSITIONS.map((position) => {
    // Rank every qualifying rostered player at this position, league-wide.
    const ranked = currentRosters
      .flatMap((r) => r.players ?? [])
      .filter(
        (pid) =>
          playerMap[pid]?.position === position &&
          (games.get(pid) ?? 0) >= MIN_GAMES
      )
      .map((pid) => ({ pid, ppg: ppgOf(pid) }))
      .sort((a, b) => b.ppg - a.ppg);
    const posRankOf = new Map<string, number>();
    ranked.forEach((x, i) => posRankOf.set(x.pid, i + 1));
    const pool = ranked.length;

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
        }))
        .sort((a, b) => a.posRank - b.posRank);
      const avgRank =
        players.length > 0
          ? players.reduce((s, p) => s + p.posRank, 0) / players.length
          : null;
      return {
        rosterId: r.roster_id,
        handle: u?.display_name || "unknown",
        teamName: u?.team_name || u?.display_name || "Unknown",
        logo: u?.teamAvatar ?? null,
        isMe: !!myUserId && r.owner_id === myUserId,
        avgRank,
        rank: 0,
        players,
      };
    });

    // Sort by average rank (lower = stronger); teams with no qualifying player
    // sink to the bottom.
    teams.sort(
      (a, b) => (a.avgRank ?? Infinity) - (b.avgRank ?? Infinity)
    );
    teams.forEach((t, i) => (t.rank = i + 1));
    return { position, teams, pool };
  });

  return result;
}
