// ---------------------------------------------------------------------------
// Sync engine (server-only). Pulls Sleeper data into our own database:
//   • shared NFL player catalog + immutable weekly stat archive
//   • per-league chain: settings, matchups, transactions, drafts, brackets
//   • computed player game-logs scored in each league's own rules
//
// Immutable history is written once and never re-fetched. The heavy work lives
// here so browsers just read the results. Uses the service-role admin client.
// ---------------------------------------------------------------------------

import { getAdminClient } from "./supabaseAdmin";
import { scorePlayerWeek, type ScoringSettings } from "./scoring";

const BASE = "https://api.sleeper.app/v1";
const STATS_WEEKS = 18; // NFL regular-season weeks

// Resilient fetch: short timeout + a couple retries, so a Sleeper hiccup
// doesn't abort a whole sync.
async function sfetch(path: string, tries = 3): Promise<unknown> {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return null;
}

type LeagueDetail = {
  league_id: string;
  season: string;
  status: string;
  previous_league_id: string | null;
  scoring_settings: ScoringSettings;
  roster_positions: string[];
  settings: { playoff_week_start?: number; last_scored_leg?: number; waiver_budget?: number };
};

// Walk previous_league_id to get every season of a dynasty, newest first.
async function getChain(leagueId: string): Promise<LeagueDetail[]> {
  const out: LeagueDetail[] = [];
  let cur: string | null = leagueId;
  while (cur && out.length < 20) {
    const l = (await sfetch(`/league/${cur}`)) as LeagueDetail | null;
    if (!l) break;
    if (Number(l.season) < 2024) break; // dynasty starts 2024; exclude redraft seasons
    out.push(l);
    cur = l.previous_league_id;
  }
  return out;
}

// Last NFL week worth archiving for a season: full 18 once complete, else only
// the weeks already scored.
function maxWeekFor(l: LeagueDetail): number {
  if (l.status === "complete") return STATS_WEEKS;
  return Math.min(STATS_WEEKS, l.settings?.last_scored_leg ?? 0);
}

type Admin = ReturnType<typeof getAdminClient>;

// --- Shared: NFL player catalog (one row for the whole app) ----------------
async function syncPlayerCatalog(admin: Admin): Promise<void> {
  const all = (await sfetch(`/players/nfl`)) as Record<string, Record<string, unknown>> | null;
  if (!all) return;
  const trimmed: Record<string, unknown> = {};
  for (const id in all) {
    const p = all[id];
    trimmed[id] = {
      name: p.full_name ?? p.last_name ?? id,
      position: p.position ?? null,
      team: p.team ?? null,
      age: p.age ?? null,
      years_exp: p.years_exp ?? null,
      fantasy_positions: p.fantasy_positions ?? [],
    };
  }
  await admin.from("nfl_players").upsert({ id: true, payload: trimmed, updated_at: new Date().toISOString() });
}

// --- Shared: immutable weekly stat archive ---------------------------------
// Fetch each (season, week) only if we don't already have it.
async function syncWeeklyStats(admin: Admin, chain: LeagueDetail[]): Promise<void> {
  const bySeason = new Map<string, number>();
  for (const l of chain) bySeason.set(l.season, Math.max(bySeason.get(l.season) ?? 0, maxWeekFor(l)));

  const { data: have } = await admin.from("nfl_stats_weekly").select("season, week");
  const haveSet = new Set((have ?? []).map((r) => `${r.season}-${r.week}`));

  for (const [season, maxWeek] of bySeason) {
    for (let week = 1; week <= maxWeek; week++) {
      if (haveSet.has(`${season}-${week}`)) continue; // immutable — already stored
      const stats = await sfetch(`/stats/nfl/regular/${season}/${week}`);
      if (stats && typeof stats === "object") {
        await admin.from("nfl_stats_weekly").upsert({
          season, week, payload: stats, updated_at: new Date().toISOString(),
        });
      }
    }
  }
}

// --- Per-league chain: settings + frozen history ---------------------------
async function syncLeagueChain(admin: Admin, chain: LeagueDetail[]): Promise<void> {
  for (const l of chain) {
    const users = await sfetch(`/league/${l.league_id}/users`);
    await admin.from("league_meta").upsert({
      league_id: l.league_id,
      season: l.season,
      previous_league_id: l.previous_league_id,
      status: l.status,
      playoff_week_start: l.settings?.playoff_week_start ?? 15,
      waiver_budget: l.settings?.waiver_budget ?? 0,
      scoring_settings: l.scoring_settings,
      roster_positions: l.roster_positions,
      users,
      updated_at: new Date().toISOString(),
    });

    const lastWeek = maxWeekFor(l);
    // Matchups + transactions per week (frozen once the week is final).
    for (let week = 1; week <= Math.max(lastWeek, 1); week++) {
      const m = await sfetch(`/league/${l.league_id}/matchups/${week}`);
      if (Array.isArray(m) && m.length) {
        await admin.from("league_matchups").upsert({ league_id: l.league_id, week, payload: m, updated_at: new Date().toISOString() });
      }
      const t = await sfetch(`/league/${l.league_id}/transactions/${week}`);
      if (Array.isArray(t) && t.length) {
        await admin.from("league_transactions").upsert({ league_id: l.league_id, week, payload: t, updated_at: new Date().toISOString() });
      }
    }

    // Drafts + traded picks.
    const drafts = (await sfetch(`/league/${l.league_id}/drafts`)) as Array<{ draft_id: string }> | null;
    for (const d of drafts ?? []) {
      const [picks, traded] = await Promise.all([
        sfetch(`/draft/${d.draft_id}/picks`),
        sfetch(`/draft/${d.draft_id}/traded_picks`),
      ]);
      await admin.from("league_drafts").upsert({
        draft_id: d.draft_id, league_id: l.league_id, meta: d, picks, traded_picks: traded, updated_at: new Date().toISOString(),
      });
    }

    // Playoff brackets.
    const [winners, losers] = await Promise.all([
      sfetch(`/league/${l.league_id}/winners_bracket`),
      sfetch(`/league/${l.league_id}/losers_bracket`),
    ]);
    if (winners || losers) {
      await admin.from("league_brackets").upsert({ league_id: l.league_id, winners, losers, updated_at: new Date().toISOString() });
    }
  }
}

// --- Compute: each player's game-log stats, scored in this league's rules ---
function quantile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const k = (sorted.length - 1) * p;
  const f = Math.floor(k);
  const c = Math.min(f + 1, sorted.length - 1);
  return sorted[f] + (sorted[c] - sorted[f]) * (k - f);
}

export type PlayerStat = {
  gp: number;      // games played (weeks the player was active)
  mean: number;    // average points per game
  median: number;
  min: number; q1: number; q3: number; max: number;
};

async function computeLeaguePlayerStats(admin: Admin, chain: LeagueDetail[]): Promise<void> {
  const head = chain[0];
  const scoring = head.scoring_settings;
  const seasons = new Set(chain.map((l) => l.season));

  const { data: weeks } = await admin
    .from("nfl_stats_weekly")
    .select("season, payload")
    .in("season", [...seasons]);

  // Collect each player's weekly fantasy scores across their real games.
  const scores = new Map<string, number[]>();
  for (const row of weeks ?? []) {
    const payload = row.payload as Record<string, Record<string, number>>;
    for (const pid in payload) {
      const raw = payload[pid];
      if ((raw.gp ?? 1) < 1) continue; // count only weeks the player was active
      const pts = scorePlayerWeek(raw, scoring);
      const arr = scores.get(pid) ?? [];
      arr.push(pts);
      scores.set(pid, arr);
    }
  }

  const stats: Record<string, PlayerStat> = {};
  scores.forEach((arr, pid) => {
    if (!arr.length) return;
    const sorted = [...arr].sort((a, b) => a - b);
    const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
    stats[pid] = {
      gp: arr.length,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(quantile(sorted, 0.5) * 100) / 100,
      min: sorted[0],
      q1: Math.round(quantile(sorted, 0.25) * 100) / 100,
      q3: Math.round(quantile(sorted, 0.75) * 100) / 100,
      max: sorted[sorted.length - 1],
    };
  });

  await admin.from("league_cache").upsert({
    league_id: head.league_id,
    cache_key: "player_stats",
    payload: stats,
    updated_at: new Date().toISOString(),
  });
}

// --- Orchestrator ----------------------------------------------------------
export async function syncLeague(leagueId: string): Promise<{ ok: boolean; detail: string }> {
  const admin = getAdminClient();
  const now = () => new Date().toISOString();
  try {
    await admin.from("sync_state").upsert({ league_id: leagueId, status: "running", detail: "", updated_at: now() });
    const chain = await getChain(leagueId);
    if (!chain.length) throw new Error("league not found on Sleeper");

    await syncPlayerCatalog(admin);
    await syncWeeklyStats(admin, chain);
    await syncLeagueChain(admin, chain);
    await computeLeaguePlayerStats(admin, chain);

    const detail = `${chain.length} seasons synced`;
    await admin.from("sync_state").upsert({ league_id: leagueId, status: "ok", detail, last_synced_at: now(), updated_at: now() });
    return { ok: true, detail };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown error";
    await admin.from("sync_state").upsert({ league_id: leagueId, status: "error", detail, updated_at: now() });
    return { ok: false, detail };
  }
}
