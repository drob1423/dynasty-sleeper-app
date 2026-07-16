import { supabase } from "@/lib/supabase";
import { getMemberSleeperIds } from "@/lib/members";
import {
  getFullRosters,
  getLeagueUsers,
  getPlayerMap,
  getSeasonChain,
  getRosters,
  getPlayoffResults,
  getWeeklyResults,
  getSeasonLuck,
  getTransactionStatsForSeason,
  getUserH2H,
  trailingStreak,
  seasonHasData,
  type SleeperManager,
  type PlayerInfo,
  type Streak,
  type H2HRecord,
} from "@/lib/sleeper";

// One season's line for a team — regular-season + playoff record and PF/PA
// (with that season's rank). Powers the "By Season" selector.
export type SeasonLine = {
  season: string;
  regW: number;
  regL: number;
  poW: number;
  poL: number;
  pf: number;
  pa: number;
  pfRank: number | null;
  paRank: number | null;
};

export type TeamCard = {
  rosterId: number;
  ownerId: string | null; // Sleeper user id of the current owner
  teamName: string;
  handle: string;
  logo: string | null;
  lastSeason: string | null;
  lastRank: number | null;
  place: number | null; // medal
  dynastyW: number; // regular-season wins across the dynasty
  dynastyL: number;
  playoffW: number; // meaningful playoff wins across the dynasty
  playoffL: number;
  currentW: number;
  currentL: number;
  streak: Streak;
  form: ("W" | "L" | "T")[]; // last 5 regular-season results, oldest→newest
  h2h: H2HRecord | null; // logged-in user's record vs this team (null on own team)
  isMe: boolean; // this is the logged-in user's team
  isMember: boolean; // this owner has an app account
  newOwner: boolean; // current owner just took over the slot (hasn't played)
  tookOverFrom: string | null; // handle of the previous owner
  trades: number;
  moves: number;
  faab: number | null;
  pf: number | null; // points for, last completed season
  pfRank: number | null; // rank by PF that season
  pa: number | null; // points against, last completed season
  paRank: number | null; // rank by PA that season (most points-against = 1st)
  allTimePf: number | null; // all-time regular-season points for (total)
  allTimePa: number | null; // all-time regular-season points against (total)
  allTimePfRank: number | null; // all-time regular-season PF rank (most = 1st)
  allTimePaRank: number | null; // all-time regular-season PA rank (most = 1st)
  currentPfRank: number | null; // current-season PF rank (null until games play)
  currentPaRank: number | null; // current-season PA rank (null until games play)
  luck: number | null; // actual − expected wins across the dynasty
  expWins: number | null; // expected wins (for the sub label)
  games: number | null; // total regular-season games (for expected record)
  rings: number; // championships (1st-place finishes)
  silver: number; // 2nd-place finishes
  bronze: number; // 3rd-place finishes
  medalSeasons: { g: string[]; s: string[]; b: string[] }; // years each medal happened
  bestFinish: number | null; // best final placement across the dynasty (1 = title)
  bestFinishSeasons: string[]; // every year that best finish happened
  leagueSize: number; // teams in the league (denominator for a finish)
  seasons: SeasonLine[]; // per-season lines, most recent first
};

// Load every team's scorecard data for a league. Shared by the Rivals tab and
// the My Team tab so the stat logic lives in one place.
export async function loadTeamCards(
  leagueId: string
): Promise<{
  cards: TeamCard[];
  lastSeason: string | null;
  currentSeason: string | null;
}> {
  const [auth, currentFull, users, players, chain] = await Promise.all([
    supabase.auth.getUser(),
    getFullRosters(leagueId),
    getLeagueUsers(leagueId),
    getPlayerMap(),
    getSeasonChain(leagueId),
  ]);
  // Which of this league's owners are on the app (indexed lookup by owner id).
  const memberIds = await getMemberSleeperIds(
    currentFull.map((r) => r.owner_id)
  );
  const byId = new Map(users.map((u: SleeperManager) => [u.user_id, u]));
  const myUserId = auth.data.user?.user_metadata?.sleeper_user_id as
    | string
    | undefined;
  const currentLeague = chain[0];
  const faabBudget = currentLeague?.waiverBudget ?? 0;
  const lastPlayedIndex = chain.findIndex(seasonHasData);
  const lastPlayed = lastPlayedIndex >= 0 ? chain[lastPlayedIndex] : null;

  const playedOldestFirst = [...chain].filter(seasonHasData).reverse();

  const [
    perSeasonRosters,
    txStatsPerSeason,
    lastPlayoffs,
    weeklyPerSeason,
    h2hMap,
    lastPlayedUsers,
    luckPerSeason,
    playoffsPerSeason,
  ] = await Promise.all([
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
    lastPlayed
      ? getLeagueUsers(lastPlayed.league_id)
      : Promise.resolve([] as SleeperManager[]),
    Promise.all(
      playedOldestFirst.map((s) =>
        getSeasonLuck(s.league_id, (s.playoff_week_start || 15) - 1)
      )
    ),
    Promise.all(playedOldestFirst.map((s) => getPlayoffResults(s.league_id))),
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

  // All-time regular-season points for/against, summed across every season and
  // ranked most-first (same convention as the standings: most PF is 1st; most
  // PA is 1st — a can't-control bragging right). Sleeper's roster fpts are the
  // regular-season totals.
  const rankDesc = (m: Map<number, number>) => {
    const out = new Map<number, number>();
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([rid], i) => out.set(rid, i + 1));
    return out;
  };
  const pfAll = new Map<number, number>();
  const paAll = new Map<number, number>();
  perSeasonRosters.forEach((rosters) =>
    rosters.forEach((r) => {
      pfAll.set(r.roster_id, (pfAll.get(r.roster_id) ?? 0) + r.fpts);
      paAll.set(r.roster_id, (paAll.get(r.roster_id) ?? 0) + r.fpts_against);
    })
  );
  const allTimePfRankMap = rankDesc(pfAll);
  const allTimePaRankMap = rankDesc(paAll);

  // Current season's PF/PA ranks — empty until the season actually kicks off.
  const curRosters = perSeasonRosters[0] ?? [];
  const curHasData = curRosters.some((r) => r.fpts > 0);
  const curPfRankMap = new Map<number, number>();
  const curPaRankMap = new Map<number, number>();
  if (curHasData) {
    [...curRosters]
      .sort((a, b) => b.fpts - a.fpts)
      .forEach((r, i) => curPfRankMap.set(r.roster_id, i + 1));
    [...curRosters]
      .sort((a, b) => b.fpts_against - a.fpts_against)
      .forEach((r, i) => curPaRankMap.set(r.roster_id, i + 1));
  }

  // Per-season lines (record, playoff record, PF/PA with that year's rank) for
  // the "By Season" selector. chain is newest→oldest, so lines come out most
  // recent first.
  const playoffBySeason = new Map(
    playedOldestFirst.map((s, i) => [s.season, playoffsPerSeason[i]])
  );
  const seasonLinesByRoster = new Map<number, SeasonLine[]>();
  chain.forEach((s, ci) => {
    const rosters = perSeasonRosters[ci] ?? [];
    if (!rosters.length) return;
    const hasData = rosters.some((r) => r.fpts > 0);
    const pfR = new Map<number, number>();
    const paR = new Map<number, number>();
    if (hasData) {
      [...rosters]
        .sort((a, b) => b.fpts - a.fpts)
        .forEach((r, i) => pfR.set(r.roster_id, i + 1));
      [...rosters]
        .sort((a, b) => b.fpts_against - a.fpts_against)
        .forEach((r, i) => paR.set(r.roster_id, i + 1));
    }
    const po = playoffBySeason.get(s.season);
    rosters.forEach((r) => {
      const pr = po?.get(r.roster_id);
      const arr = seasonLinesByRoster.get(r.roster_id) ?? [];
      arr.push({
        season: s.season,
        regW: r.wins,
        regL: r.losses,
        poW: pr?.playoffWins ?? 0,
        poL: pr?.playoffLosses ?? 0,
        pf: r.fpts,
        pa: r.fpts_against,
        pfRank: hasData ? pfR.get(r.roster_id) ?? null : null,
        paRank: hasData ? paR.get(r.roster_id) ?? null : null,
      });
      seasonLinesByRoster.set(r.roster_id, arr);
    });
  });

  // Sum luck (actual vs all-play expected wins) across the dynasty.
  const luckAgg = new Map<number, { actual: number; expected: number; games: number }>();
  luckPerSeason.forEach((m) =>
    m.forEach((v, rid) => {
      const o = luckAgg.get(rid) ?? { actual: 0, expected: 0, games: 0 };
      o.actual += v.actual;
      o.expected += v.expected;
      o.games += v.games;
      luckAgg.set(rid, o);
    })
  );

  // Tally podium finishes + meaningful playoff records across the dynasty.
  const medals = new Map<number, { g: number; s: number; b: number }>();
  const medalYears = new Map<number, { g: string[]; s: string[]; b: string[] }>();
  const poRec = new Map<number, { w: number; l: number }>();
  playoffsPerSeason.forEach((m, i) => {
    const season = playedOldestFirst[i]?.season ?? "";
    m.forEach((v, rid) => {
      const o = medals.get(rid) ?? { g: 0, s: 0, b: 0 };
      const y = medalYears.get(rid) ?? { g: [], s: [], b: [] };
      if (v.place === 1) {
        o.g += 1;
        y.g.push(season);
      } else if (v.place === 2) {
        o.s += 1;
        y.s.push(season);
      } else if (v.place === 3) {
        o.b += 1;
        y.b.push(season);
      }
      medals.set(rid, o);
      medalYears.set(rid, y);
      const p = poRec.get(rid) ?? { w: 0, l: 0 };
      p.w += v.playoffWins;
      p.l += v.playoffLosses;
      poRec.set(rid, p);
    });
  });

  // Best final placement across the dynasty. The bracket gives finishes for the
  // teams it placed; any team a season didn't place (e.g. missed the playoffs
  // entirely) fills the remaining spots by that season's regular-season order,
  // so every team gets a finish and "best" is the lowest number they've hit.
  const rostersByLeagueId = new Map(
    chain.map((s, i) => [s.league_id, perSeasonRosters[i]])
  );
  const perSeasonRostersPlayed = playedOldestFirst.map(
    (s) => rostersByLeagueId.get(s.league_id) ?? []
  );
  const bestFinish = new Map<number, { place: number; seasons: string[] }>();
  playoffsPerSeason.forEach((pr, i) => {
    const season = playedOldestFirst[i]?.season ?? "";
    const seasonRosters = perSeasonRostersPlayed[i] ?? [];
    const finishes = new Map<number, number>();
    let maxPlaced = 0;
    pr.forEach((v, rid) => {
      if (v.finish != null) {
        finishes.set(rid, v.finish);
        maxPlaced = Math.max(maxPlaced, v.finish);
      }
    });
    seasonRosters
      .filter((r) => !finishes.has(r.roster_id))
      .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
      .forEach((r, k) => finishes.set(r.roster_id, maxPlaced + k + 1));
    // Track the best placement AND every season it happened (chronological,
    // since we iterate oldest→newest): a better place resets the year list, a
    // repeat of the best place appends its year.
    finishes.forEach((place, rid) => {
      const cur = bestFinish.get(rid);
      if (!cur || place < cur.place) {
        bestFinish.set(rid, { place, seasons: [season] });
      } else if (place === cur.place) {
        cur.seasons.push(season);
      }
    });
  });

  // Last completed season: points for + rank by PF.
  const pfByRoster = new Map<number, number>();
  const pfRankByRoster = new Map<number, number>();
  const paByRoster = new Map<number, number>();
  const paRankByRoster = new Map<number, number>();
  if (lastPlayedIndex >= 0) {
    perSeasonRosters[lastPlayedIndex].forEach((r) => {
      pfByRoster.set(r.roster_id, r.fpts);
      paByRoster.set(r.roster_id, r.fpts_against);
    });
    [...perSeasonRosters[lastPlayedIndex]]
      .sort((a, b) => b.fpts - a.fpts)
      .forEach((r, i) => pfRankByRoster.set(r.roster_id, i + 1));
    // Most points-against ranks 1st (a bragging right — you can't control it).
    [...perSeasonRosters[lastPlayedIndex]]
      .sort((a, b) => b.fpts_against - a.fpts_against)
      .forEach((r, i) => paRankByRoster.set(r.roster_id, i + 1));
  }

  // Sum trades + moves from the transaction log.
  const trades = new Map<number, number>();
  const moves = new Map<number, number>();
  txStatsPerSeason.forEach((m) =>
    m.forEach((v, k) => {
      trades.set(k, (trades.get(k) ?? 0) + v.trades);
      moves.set(k, (moves.get(k) ?? 0) + v.moves);
    })
  );

  // Last season rank (by record) + who owned each slot then (for new-owner
  // detection).
  const rankByRoster = new Map<number, number>();
  const prevOwnerByRoster = new Map<number, string | null>();
  if (lastPlayedIndex >= 0) {
    [...perSeasonRosters[lastPlayedIndex]]
      .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
      .forEach((r, i) => rankByRoster.set(r.roster_id, i + 1));
    perSeasonRosters[lastPlayedIndex].forEach((r) =>
      prevOwnerByRoster.set(r.roster_id, r.owner_id)
    );
  }
  const prevHandleById = new Map(
    lastPlayedUsers.map((u) => [u.user_id, u.display_name])
  );

  const cards: TeamCard[] = currentFull.map((r) => {
    const u = r.owner_id ? byId.get(r.owner_id) : undefined;
    const d = dyn.get(r.roster_id) ?? { w: 0, l: 0 };
    const isMe = !!myUserId && r.owner_id === myUserId;
    const isMember = !!r.owner_id && memberIds.has(r.owner_id);
    const prevOwner = prevOwnerByRoster.get(r.roster_id) ?? null;
    const newOwner = !!prevOwner && !!r.owner_id && prevOwner !== r.owner_id;
    const tookOverFrom = newOwner ? prevHandleById.get(prevOwner) ?? null : null;
    void players; // player map reserved for future roster-value stats
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id ?? null,
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
      playoffW: poRec.get(r.roster_id)?.w ?? 0,
      playoffL: poRec.get(r.roster_id)?.l ?? 0,
      currentW: r.wins,
      currentL: r.losses,
      streak: trailingStreak(formByRoster.get(r.roster_id) ?? []),
      form: (formByRoster.get(r.roster_id) ?? []).slice(-5),
      // Franchise-based H2H: your record vs this TEAM SLOT (keyed by roster_id),
      // spanning every owner it's had. 0-0 if you've never faced it.
      h2h: isMe
        ? null
        : h2hMap.get(String(r.roster_id)) ?? {
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
          },
      isMe,
      isMember,
      newOwner,
      tookOverFrom,
      trades: trades.get(r.roster_id) ?? 0,
      moves: moves.get(r.roster_id) ?? 0,
      pf: pfByRoster.get(r.roster_id) ?? null,
      pfRank: pfRankByRoster.get(r.roster_id) ?? null,
      pa: paByRoster.get(r.roster_id) ?? null,
      paRank: paRankByRoster.get(r.roster_id) ?? null,
      allTimePf: pfAll.get(r.roster_id) ?? null,
      allTimePa: paAll.get(r.roster_id) ?? null,
      allTimePfRank: allTimePfRankMap.get(r.roster_id) ?? null,
      allTimePaRank: allTimePaRankMap.get(r.roster_id) ?? null,
      currentPfRank: curPfRankMap.get(r.roster_id) ?? null,
      currentPaRank: curPaRankMap.get(r.roster_id) ?? null,
      luck: (() => {
        const l = luckAgg.get(r.roster_id);
        return l ? l.actual - l.expected : null;
      })(),
      expWins: luckAgg.get(r.roster_id)?.expected ?? null,
      games: luckAgg.get(r.roster_id)?.games ?? null,
      rings: medals.get(r.roster_id)?.g ?? 0,
      silver: medals.get(r.roster_id)?.s ?? 0,
      bronze: medals.get(r.roster_id)?.b ?? 0,
      medalSeasons: medalYears.get(r.roster_id) ?? { g: [], s: [], b: [] },
      bestFinish: bestFinish.get(r.roster_id)?.place ?? null,
      bestFinishSeasons: bestFinish.get(r.roster_id)?.seasons ?? [],
      leagueSize: currentFull.length,
      seasons: seasonLinesByRoster.get(r.roster_id) ?? [],
      faab: faabBudget > 0 ? faabBudget - r.waiverBudgetUsed : null,
    };
  });

  return {
    cards,
    lastSeason: lastPlayed?.season ?? null,
    currentSeason: currentLeague?.season ?? null,
  };
}
