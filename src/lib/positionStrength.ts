// ---------------------------------------------------------------------------
// League positional strength — rank every team's position group (QB/RB/WR/TE)
// against each other. "Who has the strongest QB room? The weakest RB depth?"
//
// Metric: each rostered player's league-wide PPG (points per game they scored
// in) — tenure-neutral, so a rookie season compares fairly to a veteran's.
// A team's room score for a position = the sum of its players' PPG. This is
// depth-inclusive on purpose: in dynasty, a deeper group of producers IS a
// stronger room (startable assets + trade capital).
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

// A player must have produced in at least this many games to count toward a
// room score, so 1–2 game flukes don't distort a group.
const MIN_GAMES = 3;

export type RoomPlayer = {
  id: string;
  name: string;
  team: string | null;
  ppg: number;
  games: number;
};

export type TeamRoom = {
  rosterId: number;
  handle: string;
  teamName: string;
  logo: string | null;
  isMe: boolean;
  score: number; // sum of PPG (room firepower)
  rank: number; // 1 = strongest
  players: RoomPlayer[]; // qualified contributors, best first
};

export type PositionStrength = {
  position: RankedPosition;
  teams: TeamRoom[]; // ranked, strongest first
  leagueMax: number; // for bar scaling
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

  // Build each team's room per position.
  const result: PositionStrength[] = RANKED_POSITIONS.map((position) => {
    const teams: TeamRoom[] = currentRosters.map((r) => {
      const u = r.owner_id ? byId.get(r.owner_id) : undefined;
      const players: RoomPlayer[] = (r.players ?? [])
        .filter((pid) => playerMap[pid]?.position === position)
        .map((pid) => ({
          id: pid,
          name: playerMap[pid]?.name ?? pid,
          team: playerMap[pid]?.team ?? null,
          ppg: ppgOf(pid),
          games: games.get(pid) ?? 0,
        }))
        .filter((p) => p.games >= MIN_GAMES)
        .sort((a, b) => b.ppg - a.ppg);
      const score = players.reduce((s, p) => s + p.ppg, 0);
      return {
        rosterId: r.roster_id,
        handle: u?.display_name || "unknown",
        teamName: u?.team_name || u?.display_name || "Unknown",
        logo: u?.teamAvatar ?? null,
        isMe: !!myUserId && r.owner_id === myUserId,
        score,
        rank: 0,
        players,
      };
    });
    teams.sort((a, b) => b.score - a.score);
    teams.forEach((t, i) => (t.rank = i + 1));
    const leagueMax = teams.length ? teams[0].score : 0;
    return { position, teams, leagueMax };
  });

  return result;
}
