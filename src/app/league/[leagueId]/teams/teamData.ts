import { supabase } from "@/lib/supabase";
import {
  getFullRosters,
  getLeagueUsers,
  getPlayerMap,
  getSeasonChain,
  getRosters,
  getPlayoffResults,
  getWeeklyResults,
  getTransactionStatsForSeason,
  getUserH2H,
  trailingStreak,
  seasonHasData,
  type SleeperManager,
  type PlayerInfo,
  type Streak,
  type H2HRecord,
} from "@/lib/sleeper";

export type TeamCard = {
  rosterId: number;
  teamName: string;
  handle: string;
  logo: string | null;
  lastSeason: string | null;
  lastRank: number | null;
  place: number | null; // medal
  dynastyW: number;
  dynastyL: number;
  currentW: number;
  currentL: number;
  streak: Streak;
  form: ("W" | "L" | "T")[]; // last 5 regular-season results, oldest→newest
  h2h: H2HRecord | null; // logged-in user's record vs this team (null on own team)
  isMe: boolean; // this is the logged-in user's team
  trades: number;
  moves: number;
  faab: number | null;
};

// Load every team's scorecard data for a league. Shared by the Rivals tab and
// the My Team tab so the stat logic lives in one place.
export async function loadTeamCards(
  leagueId: string
): Promise<{ cards: TeamCard[]; lastSeason: string | null }> {
  const [auth, currentFull, users, players, chain] = await Promise.all([
    supabase.auth.getUser(),
    getFullRosters(leagueId),
    getLeagueUsers(leagueId),
    getPlayerMap(),
    getSeasonChain(leagueId),
  ]);
  const byId = new Map(users.map((u: SleeperManager) => [u.user_id, u]));
  const myUserId = auth.data.user?.user_metadata?.sleeper_user_id as
    | string
    | undefined;
  const currentLeague = chain[0];
  const faabBudget = currentLeague?.waiverBudget ?? 0;
  const lastPlayedIndex = chain.findIndex(seasonHasData);
  const lastPlayed = lastPlayedIndex >= 0 ? chain[lastPlayedIndex] : null;

  const playedOldestFirst = [...chain].filter(seasonHasData).reverse();

  const [perSeasonRosters, txStatsPerSeason, lastPlayoffs, weeklyPerSeason, h2hMap] =
    await Promise.all([
      Promise.all(chain.map((s) => getRosters(s.league_id))),
      Promise.all(chain.map((s) => getTransactionStatsForSeason(s.league_id))),
      lastPlayed
        ? getPlayoffResults(lastPlayed.league_id)
        : Promise.resolve(new Map()),
      Promise.all(
        playedOldestFirst.map((s) =>
          getWeeklyResults(s.league_id, (s.playoff_week_start || 15) - 1)
        )
      ),
      myUserId
        ? getUserH2H(chain, myUserId)
        : Promise.resolve(new Map<string, H2HRecord>()),
    ]);

  // Chain each roster's regular-season results across all seasons.
  const formByRoster = new Map<number, ("W" | "L" | "T")[]>();
  weeklyPerSeason.forEach((m) =>
    m.forEach((arr, rid) => {
      const cur = formByRoster.get(rid) ?? [];
      cur.push(...arr);
      formByRoster.set(rid, cur);
    })
  );

  // Sum dynasty records across all seasons.
  const dyn = new Map<number, { w: number; l: number }>();
  perSeasonRosters.forEach((rosters) =>
    rosters.forEach((r) => {
      const d = dyn.get(r.roster_id) ?? { w: 0, l: 0 };
      d.w += r.wins;
      d.l += r.losses;
      dyn.set(r.roster_id, d);
    })
  );

  // Sum trades + moves from the transaction log.
  const trades = new Map<number, number>();
  const moves = new Map<number, number>();
  txStatsPerSeason.forEach((m) =>
    m.forEach((v, k) => {
      trades.set(k, (trades.get(k) ?? 0) + v.trades);
      moves.set(k, (moves.get(k) ?? 0) + v.moves);
    })
  );

  // Last season rank (by record).
  const rankByRoster = new Map<number, number>();
  if (lastPlayedIndex >= 0) {
    [...perSeasonRosters[lastPlayedIndex]]
      .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
      .forEach((r, i) => rankByRoster.set(r.roster_id, i + 1));
  }

  const cards: TeamCard[] = currentFull.map((r) => {
    const u = r.owner_id ? byId.get(r.owner_id) : undefined;
    const d = dyn.get(r.roster_id) ?? { w: 0, l: 0 };
    void players; // player map reserved for future roster-value stats
    return {
      rosterId: r.roster_id,
      teamName: u?.team_name || u?.display_name || "Unknown",
      handle: u?.display_name || "unknown",
      logo: u?.teamAvatar ?? null,
      lastSeason: lastPlayed?.season ?? null,
      lastRank: rankByRoster.get(r.roster_id) ?? null,
      place:
        (lastPlayoffs.get(r.roster_id) as { place?: number } | undefined)
          ?.place ?? null,
      dynastyW: d.w,
      dynastyL: d.l,
      currentW: r.wins,
      currentL: r.losses,
      streak: trailingStreak(formByRoster.get(r.roster_id) ?? []),
      form: (formByRoster.get(r.roster_id) ?? []).slice(-5),
      // Rivals always get an H2H record (0-0 if you've never played them, e.g.
      // a brand-new manager) so every card keeps the same layout. Only your
      // own team has no H2H.
      h2h:
        r.owner_id && r.owner_id !== myUserId
          ? h2hMap.get(r.owner_id) ?? {
              regW: 0,
              regL: 0,
              regT: 0,
              poW: 0,
              poL: 0,
              poT: 0,
              myPtsFor: 0,
              oppPtsFor: 0,
              myPtsForPO: 0,
              oppPtsForPO: 0,
            }
          : null,
      isMe: !!myUserId && r.owner_id === myUserId,
      trades: trades.get(r.roster_id) ?? 0,
      moves: moves.get(r.roster_id) ?? 0,
      faab: faabBudget > 0 ? faabBudget - r.waiverBudgetUsed : null,
    };
  });

  return { cards, lastSeason: lastPlayed?.season ?? null };
}
