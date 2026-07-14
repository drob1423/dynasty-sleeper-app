// ---------------------------------------------------------------------------
// Sleeper API helper
// ---------------------------------------------------------------------------
// Everything that talks to Sleeper's public API lives here, so the rest of the
// app never has to know the URLs or data shapes. Sleeper's API needs no login
// or key — it's fully public. Base URL: https://api.sleeper.app/v1
// ---------------------------------------------------------------------------

const BASE = "https://api.sleeper.app/v1";

// League "type" values Sleeper uses in league.settings.type
export const LEAGUE_TYPE = {
  REDRAFT: 0,
  KEEPER: 1,
  DYNASTY: 2,
} as const;

// The shape of a Sleeper user we care about
export type SleeperUser = {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
};

// The shape of a league, trimmed to what we use
export type SleeperLeague = {
  league_id: string;
  name: string;
  season: string;
  type: number; // 0 redraft, 1 keeper, 2 dynasty
  total_rosters: number;
  previous_league_id: string | null;
  avatar: string | null;
};

// Look up a user by their Sleeper username.
// Returns the user, or null if that username doesn't exist.
export async function getUser(username: string): Promise<SleeperUser | null> {
  const clean = username.trim();
  if (!clean) return null;

  const res = await fetch(`${BASE}/user/${encodeURIComponent(clean)}`);
  if (!res.ok) return null;

  const data = await res.json();
  // Sleeper returns null (not a 404) when the username isn't found
  if (!data || !data.user_id) return null;

  return {
    user_id: data.user_id,
    username: data.username,
    display_name: data.display_name,
    avatar: data.avatar ?? null,
  };
}

// Get all NFL leagues a user is in for a given season.
export async function getLeagues(
  userId: string,
  season: string
): Promise<SleeperLeague[]> {
  const res = await fetch(`${BASE}/user/${userId}/leagues/nfl/${season}`);
  if (!res.ok) return [];

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((l) => ({
    league_id: l.league_id,
    name: l.name,
    season: l.season,
    type: l.settings?.type ?? 0,
    total_rosters: l.total_rosters,
    previous_league_id: l.previous_league_id ?? null,
    avatar: l.avatar ?? null,
  }));
}

// Convenience: only the dynasty leagues for a user in a season.
export async function getDynastyLeagues(
  userId: string,
  season: string
): Promise<SleeperLeague[]> {
  const all = await getLeagues(userId, season);
  return all.filter((l) => l.type === LEAGUE_TYPE.DYNASTY);
}

// ---------------------------------------------------------------------------
// Players — the app's /api/players route serves a compact map (see that file).
// We cache it in memory so we only download it once per page-load session.
// ---------------------------------------------------------------------------
export type PlayerInfo = {
  name: string;
  position: string | null;
  team: string | null;
  age: number | null;
  yearsExp: number | null;
  fantasyPositions: string[];
};

type CompactPlayer = {
  n: string;
  p: string | null;
  t: string | null;
  a: number | null;
  e: number | null;
  f?: string[];
};

let playerCache: Record<string, PlayerInfo> | null = null;

export async function getPlayerMap(): Promise<Record<string, PlayerInfo>> {
  if (playerCache) return playerCache;

  const res = await fetch("/api/players");
  if (!res.ok) return {};

  const raw: Record<string, CompactPlayer> = await res.json();
  const map: Record<string, PlayerInfo> = {};
  for (const id in raw) {
    const c = raw[id];
    map[id] = {
      name: c.n,
      position: c.p,
      team: c.t,
      age: c.a,
      yearsExp: c.e,
      fantasyPositions: c.f ?? (c.p ? [c.p] : []),
    };
  }
  playerCache = map;
  return map;
}

// A roster with its player lists + this season's record/moves/FAAB.
export type FullRoster = {
  roster_id: number;
  owner_id: string | null;
  players: string[]; // all player_ids on the roster
  starters: string[]; // current starting lineup player_ids
  taxi: string[]; // taxi-squad player_ids
  reserve: string[]; // IR player_ids
  wins: number;
  losses: number;
  ties: number;
  totalMoves: number;
  waiverBudgetUsed: number;
};

export async function getFullRosters(leagueId: string): Promise<FullRoster[]> {
  const res = await fetch(`${BASE}/league/${leagueId}/rosters`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((r) => {
    const s = r.settings || {};
    return {
      roster_id: r.roster_id,
      owner_id: r.owner_id ?? null,
      players: r.players ?? [],
      starters: (r.starters ?? []).filter((p: string) => p && p !== "0"),
      taxi: r.taxi ?? [],
      reserve: r.reserve ?? [],
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      totalMoves: s.total_moves ?? 0,
      waiverBudgetUsed: s.waiver_budget_used ?? 0,
    };
  });
}

// Full detail for a single league (includes status + season + settings).
export type SleeperLeagueDetail = SleeperLeague & {
  status: string; // "pre_draft" | "drafting" | "in_season" | "complete"
  playoff_week_start: number;
  waiverBudget: number; // total FAAB budget for the season
  rosterPositions: string[]; // lineup slots, e.g. ["QB","QB","RB",...,"BN",...]
  scoringFormat: string; // e.g. "PPR · 2QB" — this league's scoring settings
};

export async function getLeague(
  leagueId: string
): Promise<SleeperLeagueDetail | null> {
  const res = await fetch(`${BASE}/league/${leagueId}`);
  if (!res.ok) return null;
  const l = await res.json();
  if (!l || !l.league_id) return null;
  return {
    league_id: l.league_id,
    name: l.name,
    season: l.season,
    type: l.settings?.type ?? 0,
    total_rosters: l.total_rosters,
    previous_league_id: l.previous_league_id ?? null,
    avatar: l.avatar ?? null,
    status: l.status,
    playoff_week_start: l.settings?.playoff_week_start ?? 15,
    waiverBudget: l.settings?.waiver_budget ?? 100,
    rosterPositions: Array.isArray(l.roster_positions)
      ? l.roster_positions
      : [],
    scoringFormat: deriveScoringFormat(l),
  };
}

// Human label for a league's scoring: PPR/Half/Standard, plus a 2QB/Superflex
// tag when applicable.
function deriveScoringFormat(l: {
  scoring_settings?: { rec?: number };
  roster_positions?: string[];
}): string {
  const rec = l.scoring_settings?.rec ?? 0;
  const ppr = rec >= 1 ? "PPR" : rec >= 0.5 ? "Half-PPR" : "Standard";
  const rp = l.roster_positions ?? [];
  const superflex =
    rp.includes("SUPER_FLEX") || rp.filter((s) => s === "QB").length >= 2;
  return superflex ? `${ppr} · 2QB` : ppr;
}

// Build a Sleeper avatar URL from an avatar id (thumb size).
export function sleeperAvatarUrl(id: string | null): string | null {
  return id ? `https://sleepercdn.com/avatars/thumbs/${id}` : null;
}

// Build a Sleeper league-logo URL from a league's avatar id.
export function leagueLogoUrl(avatar: string | null): string | null {
  return sleeperAvatarUrl(avatar);
}

// A manager in a league (owner of a roster).
export type SleeperManager = {
  user_id: string;
  display_name: string;
  team_name: string | null;
  avatar: string | null;
  teamAvatar: string | null; // ready-to-use logo URL (custom logo or user avatar)
  is_commissioner: boolean;
};

export async function getLeagueUsers(
  leagueId: string
): Promise<SleeperManager[]> {
  const res = await fetch(`${BASE}/league/${leagueId}/users`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((u) => {
    const meta = u.metadata || {};
    // Managers can upload a custom team logo (metadata.avatar = full URL).
    // Otherwise fall back to their Sleeper user avatar.
    const teamAvatar =
      typeof meta.avatar === "string" && meta.avatar.startsWith("http")
        ? meta.avatar
        : sleeperAvatarUrl(u.avatar ?? null);
    return {
      user_id: u.user_id,
      display_name: u.display_name,
      team_name: meta.team_name ?? null,
      avatar: u.avatar ?? null,
      teamAvatar,
      // Sleeper marks commissioners with is_owner on the league user record
      is_commissioner: u.is_owner === true,
    };
  });
}

// A roster with its season record (straight from Sleeper — nothing computed).
export type SleeperRoster = {
  roster_id: number;
  owner_id: string | null;
  wins: number;
  losses: number;
  ties: number;
  fpts: number; // points for (whole + decimal combined)
  fpts_against: number; // points against
  totalMoves: number; // adds/waivers made this season
  waiverBudgetUsed: number; // FAAB spent this season
};

export async function getRosters(leagueId: string): Promise<SleeperRoster[]> {
  const res = await fetch(`${BASE}/league/${leagueId}/rosters`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((r) => {
    const s = r.settings || {};
    return {
      roster_id: r.roster_id,
      owner_id: r.owner_id ?? null,
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      fpts: (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100,
      fpts_against: (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100,
      totalMoves: s.total_moves ?? 0,
      waiverBudgetUsed: s.waiver_budget_used ?? 0,
    };
  });
}

// A team's current win/loss streak, e.g. { type: "W", count: 3 }.
export type Streak = { type: "W" | "L" | "T"; count: number } | null;

// Compute each roster's chronological regular-season results (W/L/T) by
// comparing scores within each week's matchup. Used for streaks.
export async function getWeeklyResults(
  leagueId: string,
  throughWeek: number
): Promise<Map<number, ("W" | "L" | "T")[]>> {
  const weeks = Array.from({ length: Math.max(0, throughWeek) }, (_, i) => i + 1);
  const perWeek = await Promise.all(
    weeks.map((w) =>
      fetch(`${BASE}/league/${leagueId}/matchups/${w}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    )
  );

  const results = new Map<number, ("W" | "L" | "T")[]>();
  const push = (rid: number, res: "W" | "L" | "T") => {
    const arr = results.get(rid) ?? [];
    arr.push(res);
    results.set(rid, arr);
  };

  for (const ms of perWeek) {
    if (!Array.isArray(ms)) continue;
    // Group the week's entries by matchup_id (each matchup has two teams).
    const byMatch = new Map<number, { roster_id: number; points: number }[]>();
    for (const m of ms) {
      if (m.matchup_id == null || m.points == null) continue;
      const arr = byMatch.get(m.matchup_id) ?? [];
      arr.push({ roster_id: m.roster_id, points: m.points });
      byMatch.set(m.matchup_id, arr);
    }
    for (const pair of byMatch.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      if (a.points > b.points) {
        push(a.roster_id, "W");
        push(b.roster_id, "L");
      } else if (a.points < b.points) {
        push(a.roster_id, "L");
        push(b.roster_id, "W");
      } else {
        push(a.roster_id, "T");
        push(b.roster_id, "T");
      }
    }
  }
  return results;
}

// Turn a chronological results array into the current trailing streak.
export function trailingStreak(results: ("W" | "L" | "T")[]): Streak {
  if (results.length === 0) return null;
  const type = results[results.length - 1];
  let count = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === type; i--) count++;
  return { type, count };
}

// Per-roster transaction tallies for a season.
export type TxStats = { trades: number; moves: number };

// ---------------------------------------------------------------------------
// Head-to-head — one user's all-time record vs every other manager, split into
// regular season and playoffs. Opponents are keyed by owner (the person), so a
// manager's record follows them. Playoff games use the same "counts for a
// medal" rule as the playoff record (regular rounds + final + 3rd-place game).
// ---------------------------------------------------------------------------
export type H2HRecord = {
  regW: number;
  regL: number;
  regT: number;
  poW: number;
  poL: number;
  poT: number;
  myPtsFor: number; // total points I scored in our regular-season matchups
  oppPtsFor: number; // total points they scored in those matchups
  myPtsForPO: number; // my points in our postseason (medal) matchups
  oppPtsForPO: number; // their points in those postseason matchups
};

// Compute one season's H2H contribution for a user, keyed by opponent owner id.
async function seasonH2H(
  season: SleeperLeagueDetail,
  userId: string
): Promise<Map<string, H2HRecord>> {
  const out = new Map<string, H2HRecord>();
  const ensure = (oid: string) => {
    let e = out.get(oid);
    if (!e) {
      e = {
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
      };
      out.set(oid, e);
    }
    return e;
  };

  const rosters = await getRosters(season.league_id);
  const ownerByRoster = new Map<number, string | null>(
    rosters.map((r) => [r.roster_id, r.owner_id])
  );
  const userRoster = rosters.find((r) => r.owner_id === userId)?.roster_id;
  if (userRoster == null) return out;

  // Regular season
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
    const byMatch = new Map<number, { roster_id: number; points: number }[]>();
    for (const m of ms) {
      if (m.matchup_id == null || m.points == null) continue;
      const arr = byMatch.get(m.matchup_id) ?? [];
      arr.push({ roster_id: m.roster_id, points: m.points });
      byMatch.set(m.matchup_id, arr);
    }
    for (const pair of byMatch.values()) {
      if (pair.length !== 2) continue;
      const mine = pair.find((p) => p.roster_id === userRoster);
      const opp = pair.find((p) => p.roster_id !== userRoster);
      if (!mine || !opp) continue;
      const oppOwner = ownerByRoster.get(opp.roster_id);
      if (!oppOwner) continue;
      const e = ensure(oppOwner);
      e.myPtsFor += mine.points;
      e.oppPtsFor += opp.points;
      if (mine.points > opp.points) e.regW++;
      else if (mine.points < opp.points) e.regL++;
      else e.regT++;
    }
  }

  // Playoffs — championship bracket (games that matter) + their scores.
  // Bracket round r maps to week (playoff_week_start + r - 1); we pull those
  // weeks' matchups to get the points for each medal game.
  const pws = season.playoff_week_start || 15;
  const poWeeks = [pws, pws + 1, pws + 2];
  const [wb, ...poMs] = await Promise.all([
    fetch(`${BASE}/league/${season.league_id}/winners_bracket`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
    ...poWeeks.map((w) =>
      fetch(`${BASE}/league/${season.league_id}/matchups/${w}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    ),
  ]);
  const poByWeek = new Map<
    number,
    { roster_id: number; points: number | null }[]
  >();
  poWeeks.forEach((w, i) => poByWeek.set(w, Array.isArray(poMs[i]) ? poMs[i] : []));

  if (Array.isArray(wb)) {
    for (const m of wb) {
      const t1 = typeof m.t1 === "number" ? m.t1 : null;
      const t2 = typeof m.t2 === "number" ? m.t2 : null;
      if (t1 == null || t2 == null) continue;
      if (t1 !== userRoster && t2 !== userRoster) continue;
      const decidesMedal = m.p === 1 || m.p === 3;
      if (typeof m.p === "number" && !decidesMedal) continue; // skip 5th/7th
      const oppRoster = t1 === userRoster ? t2 : t1;
      const oppOwner = ownerByRoster.get(oppRoster);
      if (!oppOwner) continue;
      const w = typeof m.w === "number" ? m.w : null;
      const e = ensure(oppOwner);
      if (w === userRoster) e.poW++;
      else if (w === oppRoster) e.poL++;

      // Add this game's scores from the matching playoff week.
      const round = typeof m.r === "number" ? m.r : null;
      if (round != null) {
        const ms2 = poByWeek.get(pws + (round - 1)) ?? [];
        const mine = ms2.find((x) => x.roster_id === userRoster);
        const oppEntry = ms2.find((x) => x.roster_id === oppRoster);
        if (mine?.points != null && oppEntry?.points != null) {
          e.myPtsForPO += mine.points;
          e.oppPtsForPO += oppEntry.points;
        }
      }
    }
  }

  return out;
}

// A user's all-time H2H vs every opponent owner, across all played seasons.
export async function getUserH2H(
  chain: SleeperLeagueDetail[],
  userId: string
): Promise<Map<string, H2HRecord>> {
  const played = chain.filter(seasonHasData);
  const perSeason = await Promise.all(played.map((s) => seasonH2H(s, userId)));

  const merged = new Map<string, H2HRecord>();
  for (const m of perSeason) {
    for (const [oid, rec] of m) {
      const e =
        merged.get(oid) ??
        {
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
        };
      e.regW += rec.regW;
      e.regL += rec.regL;
      e.regT += rec.regT;
      e.poW += rec.poW;
      e.poL += rec.poL;
      e.poT += rec.poT;
      e.myPtsFor += rec.myPtsFor;
      e.oppPtsFor += rec.oppPtsFor;
      e.myPtsForPO += rec.myPtsForPO;
      e.oppPtsForPO += rec.oppPtsForPO;
      merged.set(oid, e);
    }
  }
  return merged;
}

// Count completed trades and roster moves (waiver + free-agent adds) per roster
// across a season by scanning the transaction log. Sleeper's roster
// `total_moves` field is unreliable, so we count from the source.
export async function getTransactionStatsForSeason(
  leagueId: string
): Promise<Map<number, TxStats>> {
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  const perWeek = await Promise.all(
    weeks.map((w) =>
      fetch(`${BASE}/league/${leagueId}/transactions/${w}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    )
  );

  const map = new Map<number, TxStats>();
  const ensure = (rid: number): TxStats => {
    let e = map.get(rid);
    if (!e) {
      e = { trades: 0, moves: 0 };
      map.set(rid, e);
    }
    return e;
  };

  for (const txs of perWeek) {
    if (!Array.isArray(txs)) continue;
    for (const t of txs) {
      if (t.status !== "complete") continue;
      const ids: number[] = t.roster_ids ?? [];
      if (t.type === "trade") {
        for (const rid of ids) ensure(rid).trades += 1;
      } else if (t.type === "waiver" || t.type === "free_agent") {
        for (const rid of ids) ensure(rid).moves += 1;
      }
    }
  }
  return map;
}

// One row of standings: a roster's record joined to its manager.
export type StandingRow = {
  roster_id: number;
  ownerId: string | null; // stable across seasons — used to track a manager
  managerName: string; // team name if set, else display name
  displayName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  isCommissioner: boolean;
};

// Build the standings for a league: join rosters to managers, sort by
// wins (then points for) — the standard fantasy tiebreak.
export async function getStandings(leagueId: string): Promise<StandingRow[]> {
  const [rosters, users] = await Promise.all([
    getRosters(leagueId),
    getLeagueUsers(leagueId),
  ]);

  const byId = new Map(users.map((u) => [u.user_id, u]));

  const rows: StandingRow[] = rosters.map((r) => {
    const u = r.owner_id ? byId.get(r.owner_id) : undefined;
    return {
      roster_id: r.roster_id,
      ownerId: r.owner_id,
      managerName: u?.team_name || u?.display_name || "Unknown",
      displayName: u?.display_name || "Unknown",
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      pointsFor: r.fpts,
      pointsAgainst: r.fpts_against,
      isCommissioner: u?.is_commissioner ?? false,
    };
  });

  rows.sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  return rows;
}

// Walk the previous_league_id chain and return every DYNASTY season, newest
// first. Stops at the first non-dynasty season (e.g. an old redraft year) or
// when the chain ends — so a league's pre-dynasty history drops off cleanly.
export async function getSeasonChain(
  leagueId: string
): Promise<SleeperLeagueDetail[]> {
  const chain: SleeperLeagueDetail[] = [];
  let currentId: string | null = leagueId;

  while (currentId) {
    const league: SleeperLeagueDetail | null = await getLeague(currentId);
    if (!league) break;
    if (league.type !== LEAGUE_TYPE.DYNASTY) break; // stop at non-dynasty
    chain.push(league);
    currentId = league.previous_league_id;
  }

  return chain;
}

// Has this season actually played games? (pre_draft / drafting have no data.)
export function seasonHasData(league: SleeperLeagueDetail): boolean {
  return league.status === "in_season" || league.status === "complete";
}

// ---------------------------------------------------------------------------
// Playoffs — derived from Sleeper's bracket endpoints.
// winners_bracket = championship side, losers_bracket = consolation side.
// Each match has t1/t2 (roster ids), w (winner), l (loser), and sometimes p
// (a placement game: p=1 crowns the champion, p=3 the 3rd-place game, etc.).
// ---------------------------------------------------------------------------
export type PlayoffResult = {
  inMain: boolean; // reached the championship bracket
  inConsolation: boolean; // played in the consolation bracket
  playoffWins: number; // wins in the championship bracket
  playoffLosses: number; // losses in the championship bracket
  place: number | null; // 1, 2, or 3 if they medaled; else null
};

async function fetchBracket(leagueId: string, which: "winners" | "losers") {
  const res = await fetch(`${BASE}/league/${leagueId}/${which}_bracket`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Compute each roster's postseason result for one season.
export async function getPlayoffResults(
  leagueId: string
): Promise<Map<number, PlayoffResult>> {
  const [winners, losers] = await Promise.all([
    fetchBracket(leagueId, "winners"),
    fetchBracket(leagueId, "losers"),
  ]);

  const map = new Map<number, PlayoffResult>();
  const ensure = (rid: number): PlayoffResult => {
    let e = map.get(rid);
    if (!e) {
      e = {
        inMain: false,
        inConsolation: false,
        playoffWins: 0,
        playoffLosses: 0,
        place: null,
      };
      map.set(rid, e);
    }
    return e;
  };

  // Championship bracket
  for (const m of winners) {
    const t1 = typeof m.t1 === "number" ? m.t1 : null;
    const t2 = typeof m.t2 === "number" ? m.t2 : null;
    if (t1 !== null) ensure(t1).inMain = true;
    if (t2 !== null) ensure(t2).inMain = true;

    const w = typeof m.w === "number" ? m.w : null;
    // Loser may be given as `l`, or inferred as the other team.
    let l = typeof m.l === "number" ? m.l : null;
    if (l === null && w !== null && t1 !== null && t2 !== null) {
      l = w === t1 ? t2 : t1;
    }

    // A game counts toward the playoff record if it's a regular round (no `p`)
    // OR it decides a medal — the championship final (`p === 1`) or the
    // 3rd-place game (`p === 3`). Games for 5th/7th/etc. (`p >= 5`) are played
    // after a team is out of medal contention, so they don't count.
    const decidesMedal = m.p === 1 || m.p === 3;
    const countsForRecord = typeof m.p !== "number" || decidesMedal;
    if (countsForRecord) {
      if (w !== null) ensure(w).playoffWins += 1;
      if (l !== null) ensure(l).playoffLosses += 1;
    }

    // Medals still come from the placement games (they decide the finish).
    if (m.p === 1 && w !== null) {
      ensure(w).place = 1;
      if (l !== null) ensure(l).place = 2;
    }
    if (m.p === 3 && w !== null) {
      ensure(w).place = 3;
    }
  }

  // Consolation bracket — appearance only (kept out of the playoff record)
  for (const m of losers) {
    const t1 = typeof m.t1 === "number" ? m.t1 : null;
    const t2 = typeof m.t2 === "number" ? m.t2 : null;
    if (t1 !== null) ensure(t1).inConsolation = true;
    if (t2 !== null) ensure(t2).inConsolation = true;
  }

  return map;
}

// A regular-season standings row enriched with that season's playoff result.
export type EnrichedRow = StandingRow & PlayoffResult;

// A season's enriched rows paired with its year label — the input to the
// aggregators below. Callers fetch standings + playoffs once and merge them.
export type SeasonStandings = {
  season: string;
  rows: EnrichedRow[];
};

// Merge a season's standings with its playoff results into enriched rows.
export function enrichRows(
  rows: StandingRow[],
  playoffs: Map<number, PlayoffResult>
): EnrichedRow[] {
  return rows.map((r) => {
    const p = playoffs.get(r.roster_id);
    return {
      ...r,
      inMain: p?.inMain ?? false,
      inConsolation: p?.inConsolation ?? false,
      playoffWins: p?.playoffWins ?? 0,
      playoffLosses: p?.playoffLosses ?? 0,
      place: p?.place ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// OWNER view: stats follow the person (ownerId). A manager who leaves keeps
// their record; a manager who takes over a team starts with a clean slate.
// ---------------------------------------------------------------------------
// A medal a team earned in a given season (place 1/2/3).
export type Medal = { season: string; place: number };

export type OwnerRow = {
  key: string; // ownerId
  managerName: string; // most recent team/display name for this person
  displayName: string;
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  playoffWins: number;
  playoffLosses: number;
  mainApps: number; // championship-bracket appearances
  consolationApps: number; // consolation-bracket appearances
  medals: Medal[];
  isCommissioner: boolean;
};

// `seasons` must be newest-first so the most recent name for a person wins.
export function aggregateByOwner(seasons: SeasonStandings[]): OwnerRow[] {
  const byOwner = new Map<string, OwnerRow>();

  seasons.forEach(({ season, rows }) => {
    rows.forEach((r) => {
      if (!r.ownerId) return;
      let e = byOwner.get(r.ownerId);
      if (!e) {
        e = {
          key: r.ownerId,
          managerName: r.managerName,
          displayName: r.displayName,
          seasons: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          playoffWins: 0,
          playoffLosses: 0,
          mainApps: 0,
          consolationApps: 0,
          medals: [],
          isCommissioner: false,
        };
        byOwner.set(r.ownerId, e);
      }
      e.seasons += 1;
      e.wins += r.wins;
      e.losses += r.losses;
      e.ties += r.ties;
      e.pointsFor += r.pointsFor;
      e.pointsAgainst += r.pointsAgainst;
      e.playoffWins += r.playoffWins;
      e.playoffLosses += r.playoffLosses;
      if (r.inMain) e.mainApps += 1;
      if (r.inConsolation) e.consolationApps += 1;
      if (r.place) e.medals.push({ season, place: r.place });
      e.isCommissioner = e.isCommissioner || r.isCommissioner;
    });
  });

  const rows = Array.from(byOwner.values());
  rows.sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  return rows;
}

// ---------------------------------------------------------------------------
// FRANCHISE view: stats follow the team slot (roster_id). The record spans
// every owner the franchise has ever had, labeled by its CURRENT owner, with
// an ownership timeline showing the handoffs.
// ---------------------------------------------------------------------------
export type FranchiseRow = {
  key: string; // roster_id as string
  currentManagerName: string; // current/most-recent owner's team name
  currentDisplayName: string;
  timeline: string; // e.g. "jaabeska (2024–2025) → nharris1996 (2026)"
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  playoffWins: number;
  playoffLosses: number;
  mainApps: number;
  consolationApps: number;
  medals: Medal[];
  isCommissioner: boolean;
};

// `statSeasons`: seasons whose records we sum (the ones with games played).
// `allSeasons`: the full chain newest-first, used only for the current owner
// label and the ownership timeline (so a brand-new owner still shows as the
// franchise's current steward even before they've played a game).
export function aggregateByFranchise(
  statSeasons: SeasonStandings[],
  allSeasons: SeasonStandings[]
): FranchiseRow[] {
  // Sum records per roster slot over the seasons that have data.
  type Acc = {
    seasons: number;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
    playoffWins: number;
    playoffLosses: number;
    mainApps: number;
    consolationApps: number;
    medals: Medal[];
    isCommissioner: boolean;
  };
  const stats = new Map<number, Acc>();

  statSeasons.forEach(({ season, rows }) => {
    rows.forEach((r) => {
      const a =
        stats.get(r.roster_id) ??
        {
          seasons: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          playoffWins: 0,
          playoffLosses: 0,
          mainApps: 0,
          consolationApps: 0,
          medals: [] as Medal[],
          isCommissioner: false,
        };
      a.seasons += 1;
      a.wins += r.wins;
      a.losses += r.losses;
      a.ties += r.ties;
      a.pointsFor += r.pointsFor;
      a.pointsAgainst += r.pointsAgainst;
      a.playoffWins += r.playoffWins;
      a.playoffLosses += r.playoffLosses;
      if (r.inMain) a.mainApps += 1;
      if (r.inConsolation) a.consolationApps += 1;
      if (r.place) a.medals.push({ season, place: r.place });
      a.isCommissioner = a.isCommissioner || r.isCommissioner;
      stats.set(r.roster_id, a);
    });
  });

  // Current owner = newest season's owner of that roster slot.
  const newest = allSeasons[0];
  const currentByRoster = new Map<number, StandingRow>();
  newest?.rows.forEach((r) => currentByRoster.set(r.roster_id, r));

  // Build every roster slot's ownership timeline (oldest → newest).
  const oldestFirst = [...allSeasons].reverse();
  const timelines = new Map<number, string>();
  const rosterIds = new Set<number>();
  allSeasons.forEach((s) => s.rows.forEach((r) => rosterIds.add(r.roster_id)));

  rosterIds.forEach((rid) => {
    const entries: { season: string; owner: string }[] = [];
    oldestFirst.forEach(({ season, rows }) => {
      const row = rows.find((r) => r.roster_id === rid);
      if (row) entries.push({ season, owner: row.displayName });
    });
    timelines.set(rid, buildTimeline(entries));
  });

  const rows: FranchiseRow[] = [];
  stats.forEach((a, rid) => {
    const current = currentByRoster.get(rid);
    rows.push({
      key: String(rid),
      currentManagerName: current?.managerName ?? "Unknown",
      currentDisplayName: current?.displayName ?? "unknown",
      timeline: timelines.get(rid) ?? "",
      ...a,
    });
  });

  rows.sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  return rows;
}

// Collapse consecutive same-owner seasons into ranges, e.g.
// [(2024,jaabeska),(2025,jaabeska),(2026,nharris1996)] ->
// "jaabeska (2024–2025) → nharris1996 (2026)"
function buildTimeline(entries: { season: string; owner: string }[]): string {
  if (entries.length === 0) return "";
  const segments: string[] = [];
  let owner = entries[0].owner;
  let start = entries[0].season;
  let end = entries[0].season;

  const push = () => {
    segments.push(
      start === end ? `${owner} (${start})` : `${owner} (${start}–${end})`
    );
  };

  for (let i = 1; i < entries.length; i++) {
    if (entries[i].owner === owner) {
      end = entries[i].season;
    } else {
      push();
      owner = entries[i].owner;
      start = entries[i].season;
      end = entries[i].season;
    }
  }
  push();
  return segments.join(" → ");
}

// Given a league that might be pre-draft (no games yet), walk back through
// previous_league_id until we find a season that actually has played games.
// Returns the league detail to display, or the original if none found.
export async function resolvePlayedLeague(
  leagueId: string
): Promise<SleeperLeagueDetail | null> {
  let current = await getLeague(leagueId);
  const original = current;

  // "pre_draft" / "drafting" means no games played yet — step back a season.
  while (current && current.status !== "in_season" && current.status !== "complete") {
    if (!current.previous_league_id) return original; // nothing older
    current = await getLeague(current.previous_league_id);
  }

  return current ?? original;
}
