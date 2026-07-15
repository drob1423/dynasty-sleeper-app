// ---------------------------------------------------------------------------
// Team-overview data. Three reads that power the team detail "Overview" tab:
//   1. getRivalH2HGrid   — this team's all-time record vs every league member
//   2. getRecentTransactions — this team's last N moves (adds/drops/trades)
//   3. getMatchupLog     — the viewer's detailed game-by-game history vs this team
//      (score, week, each team's running record at the time, top scorers)
//
// Everything is franchise-based (keyed by roster_id, the team slot) to match the
// rest of the app, so a manager's history follows the slot across seasons.
// ---------------------------------------------------------------------------

import {
  getSeasonChain,
  getRosters,
  getLeagueUsers,
  getPlayerMap,
  getUserH2H,
  seasonHasData,
  type PlayerInfo,
  type H2HRecord,
  type SleeperLeagueDetail,
} from "./sleeper";

const BASE = "https://api.sleeper.app/v1";

const jget = (url: string) =>
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

// A single starter's line in one game.
export type TopPlayer = {
  name: string;
  pos: string | null;
  team: string | null;
  points: number;
};

// A player in a full lineup — starters carry their slot label, bench don't.
export type LineupPlayer = TopPlayer & { slot: string | null };
export type Lineup = { starters: LineupPlayer[]; bench: LineupPlayer[] };

// ---------------------------------------------------------------------------
// 1. H2H vs the whole league
// ---------------------------------------------------------------------------
export type RivalH2H = {
  rosterId: number;
  handle: string;
  logo: string | null;
  rec: H2HRecord;
};

// This team's all-time head-to-head vs every other current franchise.
export async function getRivalH2HGrid(
  leagueId: string,
  ownerId: string | null,
  selfRosterId: number
): Promise<RivalH2H[]> {
  if (!ownerId) return [];
  const [chain, rosters, users] = await Promise.all([
    getSeasonChain(leagueId),
    getRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);
  const h2h = await getUserH2H(chain, ownerId);
  const userById = new Map(users.map((u) => [u.user_id, u]));

  return rosters
    .filter((r) => r.roster_id !== selfRosterId)
    .map((r) => {
      const u = r.owner_id ? userById.get(r.owner_id) : undefined;
      return {
        rosterId: r.roster_id,
        handle: u?.display_name || "unknown",
        logo: u?.teamAvatar ?? null,
        rec:
          h2h.get(String(r.roster_id)) ??
          ({
            regW: 0, regL: 0, regT: 0, poW: 0, poL: 0, poT: 0,
            myPtsFor: 0, oppPtsFor: 0, myPtsForPO: 0, oppPtsForPO: 0,
          } as H2HRecord),
      };
    })
    .sort((a, b) => {
      // Highest win pct first; teams you've never faced sink to the bottom,
      // ties broken by games played.
      const ga = a.rec.regW + a.rec.regL + a.rec.regT;
      const gb = b.rec.regW + b.rec.regL + b.rec.regT;
      if ((ga === 0) !== (gb === 0)) return ga === 0 ? 1 : -1;
      const pa = ga ? a.rec.regW / ga : 0;
      const pb = gb ? b.rec.regW / gb : 0;
      if (pb !== pa) return pb - pa;
      return gb - ga;
    });
}

// ---------------------------------------------------------------------------
// 2. Recent transactions
// ---------------------------------------------------------------------------
export type TxItem = {
  type: "trade" | "waiver" | "free_agent" | "commissioner" | "other";
  ts: number; // created (ms)
  season: string;
  adds: TopPlayerLite[]; // players this roster acquired (non-trade)
  drops: TopPlayerLite[]; // players this roster gave up (non-trade)
  faab: number | null; // waiver bid, or net FAAB in a trade
  partners: string[]; // other managers involved (trades)
  picks: number; // draft picks involved (trades)
  sides?: TradeSide[]; // full both-sides breakdown for trades
};
type TopPlayerLite = { name: string; pos: string | null; team: string | null };

// A draft pick changing hands, e.g. { season: "2026", round: 1 }.
export type TxPick = {
  season: string;
  round: number;
  originalHandle: string | null; // set when the pick didn't originate with the acquirer
};

// One manager's haul in a trade — what they walked away with.
export type TradeSide = {
  rosterId: number;
  handle: string;
  acquired: TopPlayerLite[];
  picks: TxPick[];
  faab: number; // FAAB received in the deal
};

// This franchise's most recent N transactions, newest first, walking back
// through the dynasty chain until we have enough (or run out of seasons).
export async function getRecentTransactions(
  leagueId: string,
  rosterId: number,
  limit = 5
): Promise<TxItem[]> {
  const [chain, players] = await Promise.all([
    getSeasonChain(leagueId),
    getPlayerMap(),
  ]);
  const nameOf = (pid: string): TopPlayerLite => {
    const p = players[pid];
    return { name: p?.name ?? pid, pos: p?.position ?? null, team: p?.team ?? null };
  };

  const out: TxItem[] = [];
  for (const season of chain) {
    const users = await getLeagueUsers(season.league_id);
    const rosters = await getRosters(season.league_id);
    const handleByRoster = new Map<number, string>();
    const userById = new Map(users.map((u) => [u.user_id, u]));
    rosters.forEach((r) =>
      handleByRoster.set(
        r.roster_id,
        (r.owner_id ? userById.get(r.owner_id)?.display_name : null) || "unknown"
      )
    );

    const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
    const perWeek = await Promise.all(
      weeks.map((w) => jget(`${BASE}/league/${season.league_id}/transactions/${w}`))
    );

    for (const txs of perWeek) {
      if (!Array.isArray(txs)) continue;
      for (const t of txs) {
        if (t.status !== "complete") continue;
        const ids: number[] = t.roster_ids ?? [];
        if (!ids.includes(rosterId)) continue;

        const adds: TopPlayerLite[] = [];
        const drops: TopPlayerLite[] = [];
        for (const [pid, rid] of Object.entries(t.adds ?? {}))
          if (rid === rosterId) adds.push(nameOf(pid));
        for (const [pid, rid] of Object.entries(t.drops ?? {}))
          if (rid === rosterId) drops.push(nameOf(pid));

        // FAAB: waiver bid, or net budget moved for this roster in a trade.
        let faab: number | null = null;
        if (t.type === "waiver") faab = t.settings?.waiver_bid ?? null;
        else if (Array.isArray(t.waiver_budget) && t.waiver_budget.length) {
          const net = t.waiver_budget.reduce(
            (s: number, b: { sender: number; receiver: number; amount: number }) =>
              s + (b.receiver === rosterId ? b.amount : 0) - (b.sender === rosterId ? b.amount : 0),
            0
          );
          faab = net || null;
        }

        const partners = ids
          .filter((id) => id !== rosterId)
          .map((id) => handleByRoster.get(id) || "unknown");
        const rawPicks: {
          season: string | number;
          round: number;
          roster_id?: number;
          owner_id?: number;
        }[] = Array.isArray(t.draft_picks) ? t.draft_picks : [];
        const picks = rawPicks.length;

        // For trades, break out what EACH roster acquired (players, picks, FAAB)
        // so the full deal is visible — not just the viewed team's side. The
        // viewed roster is listed first.
        let sides: TradeSide[] | undefined;
        if (t.type === "trade") {
          const budget: { sender: number; receiver: number; amount: number }[] =
            Array.isArray(t.waiver_budget) ? t.waiver_budget : [];
          sides = [...ids]
            .sort((a, b) => (a === rosterId ? -1 : b === rosterId ? 1 : 0))
            .map((rid) => ({
              rosterId: rid,
              handle: handleByRoster.get(rid) || "unknown",
              acquired: Object.entries(t.adds ?? {})
                .filter(([, r]) => r === rid)
                .map(([pid]) => nameOf(pid)),
              picks: rawPicks
                .filter((p) => p.owner_id === rid)
                .map((p) => ({
                  season: String(p.season),
                  round: p.round,
                  originalHandle:
                    p.roster_id != null && p.roster_id !== rid
                      ? handleByRoster.get(p.roster_id) ?? null
                      : null,
                })),
              faab: budget
                .filter((b) => b.receiver === rid)
                .reduce((s, b) => s + b.amount, 0),
            }));
        }

        const type: TxItem["type"] =
          t.type === "trade" || t.type === "waiver" || t.type === "free_agent"
            ? t.type
            : t.type === "commissioner"
            ? "commissioner"
            : "other";

        out.push({
          type,
          ts: t.created ?? 0,
          season: season.season,
          adds,
          drops,
          faab,
          partners,
          picks,
          sides,
        });
      }
    }

    out.sort((a, b) => b.ts - a.ts);
    if (out.length >= limit) break;
  }

  return out.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

// ---------------------------------------------------------------------------
// 3. Detailed matchup log (viewer vs this team)
// ---------------------------------------------------------------------------
export type H2HGame = {
  season: string;
  week: number;
  isPlayoff: boolean;
  round: string | null; // playoff round label, e.g. "Championship"
  myScore: number;
  theirScore: number;
  result: "W" | "L" | "T";
  myRecord: string; // my regular-season record through this game, "5-2"
  theirRecord: string;
  myTop: TopPlayer[];
  theirTop: TopPlayer[];
  myLineup: Lineup; // full starters + bench for this game
  theirLineup: Lineup;
};

type RawEntry = {
  roster_id: number;
  matchup_id: number | null;
  points: number | null;
  starters?: string[];
  starters_points?: number[];
  players?: string[];
  players_points?: Record<string, number>;
};

const BENCH_SLOTS = new Set(["BN", "IR", "TAXI"]);

// Tidy a Sleeper roster-slot code into a short lineup label.
function prettySlot(s: string): string {
  switch (s) {
    case "SUPER_FLEX": return "SFLX";
    case "WRRB_FLEX":
    case "REC_FLEX":
    case "WRRB_WRT":
    case "FLEX": return "FLEX";
    case "IDP_FLEX": return "IDP";
    default: return s;
  }
}

// Build a full lineup (ordered starters with slot labels + bench by points)
// from one team's raw matchup entry.
function buildLineup(
  m: RawEntry | undefined,
  players: Record<string, PlayerInfo>,
  rosterPositions: string[]
): Lineup {
  if (!m) return { starters: [], bench: [] };
  const starterIds = Array.isArray(m.starters) ? m.starters : [];
  const sp = Array.isArray(m.starters_points) ? m.starters_points : null;
  const pp = m.players_points ?? {};
  const slots = rosterPositions.filter((s) => !BENCH_SLOTS.has(s));

  const line = (pid: string, pts: number, slot: string | null): LineupPlayer => {
    const p = players[pid];
    return {
      name: p?.name ?? pid,
      pos: p?.position ?? null,
      team: p?.team ?? null,
      points: pts,
      slot,
    };
  };

  const starters = starterIds
    .map((pid, i) => ({ pid, pts: sp ? sp[i] ?? 0 : pp[pid] ?? 0, slot: prettySlot(slots[i] ?? "") }))
    .filter((x) => x.pid && x.pid !== "0")
    .map((x) => line(x.pid, x.pts, x.slot));

  const startSet = new Set(starterIds);
  const bench = (Array.isArray(m.players) ? m.players : [])
    .filter((pid) => pid && pid !== "0" && !startSet.has(pid))
    .map((pid) => line(pid, pp[pid] ?? 0, null))
    .sort((a, b) => b.points - a.points);

  return { starters, bench };
}

function topStarters(lineup: Lineup, n = 3): TopPlayer[] {
  return [...lineup.starters].sort((a, b) => b.points - a.points).slice(0, n);
}

const fmtRec = (w: number, l: number, t: number) =>
  t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;

// One season's head-to-head games between two roster slots, with each team's
// running regular-season record at the time and the top scorers per side.
async function seasonMatchupLog(
  season: SleeperLeagueDetail,
  mine: number,
  theirs: number,
  players: Record<string, PlayerInfo>
): Promise<H2HGame[]> {
  const games: H2HGame[] = [];
  const pws = season.playoff_week_start || 15;
  const throughWeek = pws - 1;

  const regWeeks = Array.from({ length: throughWeek }, (_, i) => i + 1);
  const reg = await Promise.all(
    regWeeks.map((w) => jget(`${BASE}/league/${season.league_id}/matchups/${w}`))
  );

  // Running regular-season records for both teams as the season unfolds.
  let mw = 0, ml = 0, mt = 0, tw = 0, tl = 0, tt = 0;
  const resultFor = (ms: RawEntry[], rid: number): "W" | "L" | "T" | null => {
    const me = ms.find((x) => x.roster_id === rid);
    if (!me || me.matchup_id == null || me.points == null) return null;
    const opp = ms.find(
      (x) => x.matchup_id === me.matchup_id && x.roster_id !== rid && x.points != null
    );
    if (!opp || opp.points == null) return null;
    return me.points > opp.points ? "W" : me.points < opp.points ? "L" : "T";
  };

  regWeeks.forEach((week, i) => {
    const ms: RawEntry[] = Array.isArray(reg[i]) ? reg[i] : [];
    if (!ms.length) return;

    // Advance both running records for this week.
    const rm = resultFor(ms, mine);
    if (rm === "W") mw++; else if (rm === "L") ml++; else if (rm === "T") mt++;
    const rt = resultFor(ms, theirs);
    if (rt === "W") tw++; else if (rt === "L") tl++; else if (rt === "T") tt++;

    // Did the two meet this week?
    const meEntry = ms.find((x) => x.roster_id === mine);
    const themEntry = ms.find((x) => x.roster_id === theirs);
    if (
      meEntry?.matchup_id != null &&
      themEntry?.matchup_id != null &&
      meEntry.matchup_id === themEntry.matchup_id &&
      meEntry.points != null &&
      themEntry.points != null
    ) {
      const myLineup = buildLineup(meEntry, players, season.rosterPositions);
      const theirLineup = buildLineup(themEntry, players, season.rosterPositions);
      games.push({
        season: season.season,
        week,
        isPlayoff: false,
        round: null,
        myScore: meEntry.points,
        theirScore: themEntry.points,
        result:
          meEntry.points > themEntry.points ? "W" : meEntry.points < themEntry.points ? "L" : "T",
        myRecord: fmtRec(mw, ml, mt),
        theirRecord: fmtRec(tw, tl, tt),
        myTop: topStarters(myLineup),
        theirTop: topStarters(theirLineup),
        myLineup,
        theirLineup,
      });
    }
  });

  // Playoffs — any bracket game where the two met (all rounds, not just medals).
  const poWeeks = [pws, pws + 1, pws + 2];
  const [wb, ...poMs] = await Promise.all([
    jget(`${BASE}/league/${season.league_id}/winners_bracket`),
    ...poWeeks.map((w) => jget(`${BASE}/league/${season.league_id}/matchups/${w}`)),
  ]);
  const poByWeek = new Map<number, RawEntry[]>();
  poWeeks.forEach((w, i) => poByWeek.set(w, Array.isArray(poMs[i]) ? poMs[i] : []));

  if (Array.isArray(wb)) {
    for (const bm of wb) {
      const t1 = typeof bm.t1 === "number" ? bm.t1 : null;
      const t2 = typeof bm.t2 === "number" ? bm.t2 : null;
      if (t1 == null || t2 == null) continue;
      const meets = (t1 === mine && t2 === theirs) || (t1 === theirs && t2 === mine);
      if (!meets) continue;
      const round = typeof bm.r === "number" ? bm.r : null;
      if (round == null) continue;
      const week = pws + (round - 1);
      const ms = poByWeek.get(week) ?? [];
      const meEntry = ms.find((x) => x.roster_id === mine);
      const themEntry = ms.find((x) => x.roster_id === theirs);
      if (meEntry?.points == null || themEntry?.points == null) continue;
      const myLineup = buildLineup(meEntry, players, season.rosterPositions);
      const theirLineup = buildLineup(themEntry, players, season.rosterPositions);
      games.push({
        season: season.season,
        week,
        isPlayoff: true,
        round: bm.p === 1 ? "Championship" : bm.p === 3 ? "3rd place" : `Playoffs R${round}`,
        myScore: meEntry.points,
        theirScore: themEntry.points,
        result:
          meEntry.points > themEntry.points ? "W" : meEntry.points < themEntry.points ? "L" : "T",
        myRecord: fmtRec(mw, ml, mt), // final regular-season record entering the playoffs
        theirRecord: fmtRec(tw, tl, tt),
        myTop: topStarters(myLineup),
        theirTop: topStarters(theirLineup),
        myLineup,
        theirLineup,
      });
    }
  }

  return games;
}

// The viewer's full head-to-head game log vs one team, newest game first.
export async function getMatchupLog(
  leagueId: string,
  myRosterId: number,
  theirRosterId: number
): Promise<H2HGame[]> {
  const [chain, players] = await Promise.all([
    getSeasonChain(leagueId),
    getPlayerMap(),
  ]);
  const played = chain.filter(seasonHasData);
  const perSeason = await Promise.all(
    played.map((s) => seasonMatchupLog(s, myRosterId, theirRosterId, players))
  );
  const all = perSeason.flat();
  // Newest first: by season desc, then week desc.
  return all.sort(
    (a, b) => Number(b.season) - Number(a.season) || b.week - a.week
  );
}
