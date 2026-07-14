// ---------------------------------------------------------------------------
// Player profile — a player's full history within one league: who has owned
// him, how they got him, and how they used him (start rate, record when
// started, points, and MARGINAL points left on the bench).
//
// Marginal bench points = the key stat. Raw bench points overstate a benching
// (a manager may have started better players). Marginal only counts weeks the
// benched player would have OUT-scored the worst eligible starter he'd have
// replaced — i.e. points the benching actually cost.
// ---------------------------------------------------------------------------

import {
  getRosters,
  getLeagueUsers,
  getFullRosters,
  seasonHasData,
  type SleeperLeagueDetail,
  type PlayerInfo,
} from "./sleeper";

const BASE = "https://api.sleeper.app/v1";

export type OwnerStint = {
  ownerId: string;
  name: string;
  handle: string;
  avatar: string | null;
  isCurrent: boolean;
  firstLabel: string;
  lastLabel: string;
  acquisition: string;
  rosteredGames: number;
  startedGames: number;
  startRate: number; // 0..1
  ppgStarted: number;
  recStartedW: number;
  recStartedL: number;
  rawBenchPts: number;
  marginalBenchPts: number;
  shouldHaveStarted: number; // # benched weeks where starting him would've helped
  badSits: BadSit[]; // the specific weeks it cost points
};

// A week where benching the player actually cost points: he outscored the
// lineup guy he would've replaced.
export type BadSit = {
  seasonLabel: string;
  week: number;
  playerPts: number; // what the benched player scored
  replacedId: string | null; // the starter he'd have replaced (worst eligible)
  replacedPts: number;
  gain: number; // points the swap would have added
  oppName: string; // opponent that week
  oppHandle: string;
  myScore: number; // your team's score that week
  oppScore: number;
  wouldHaveWon: boolean; // a loss that starting him would have flipped to a win
};

export type TimelinePoint = {
  seasonLabel: string;
  week: number;
  pts: number;
  started: boolean;
  ownerId: string;
};

export type PlayerProfile = {
  totalRosteredPts: number; // all points scored while on a roster (started + benched)
  totalStartedPts: number; // points that counted (while in a lineup)
  ppg: number; // per game when started
  ownerCount: number;
  stints: OwnerStint[]; // chronological (oldest first)
  timeline: TimelinePoint[]; // chronological (oldest first)
};

// Can a player with these fantasy positions fill this lineup slot?
function slotEligible(fpos: string[], slot: string): boolean {
  const s = slot.toUpperCase();
  if (fpos.includes(s)) return true;
  const has = (arr: string[]) => fpos.some((p) => arr.includes(p));
  if (s === "FLEX" || s === "WRRB_FLEX" || s === "REC_FLEX" || s === "W_R_T")
    return has(["RB", "WR", "TE"]);
  if (s === "SUPER_FLEX" || s === "SF" || s === "OP" || s === "Q_W_R_T")
    return has(["QB", "RB", "WR", "TE"]);
  return false;
}

// The optimal starting lineup for a week: greedily fill the most restrictive
// slots first (base positions, then FLEX, then SUPER_FLEX) with the highest
// scorer still available. Returns the set of player ids that WOULD start.
function optimalStarters(
  rosterPositions: string[],
  rostered: { id: string; pts: number; fpos: string[] }[]
): Set<string> {
  const slots = rosterPositions.filter((s) => {
    const u = s.toUpperCase();
    return u !== "BN" && u !== "IR" && u !== "TAXI";
  });
  const rank = (s: string) => {
    const u = s.toUpperCase();
    if (u === "SUPER_FLEX" || u === "SF" || u === "OP") return 2;
    if (u === "FLEX" || u === "WRRB_FLEX" || u === "REC_FLEX" || u === "W_R_T")
      return 1;
    return 0;
  };
  const ordered = [...slots].sort((a, b) => rank(a) - rank(b));
  const used = new Set<string>();
  const chosen = new Set<string>();
  for (const slot of ordered) {
    let best: { id: string; pts: number } | null = null;
    for (const p of rostered) {
      if (used.has(p.id)) continue;
      if (slotEligible(p.fpos, slot) && (!best || p.pts > best.pts)) best = p;
    }
    if (best) {
      used.add(best.id);
      chosen.add(best.id);
    }
  }
  return chosen;
}

// Marginal points for one benched week: how much better the benched player was
// than the WORST eligible starter he could have replaced (0 if none), plus who
// that starter was.
function marginalForWeek(
  rosterPositions: string[],
  starters: string[],
  playersPoints: Record<string, number>,
  benchedPts: number,
  fpos: string[]
): { gain: number; replacedId: string | null; replacedPts: number } {
  let worstId: string | null = null;
  let worstPts = Infinity;
  for (let k = 0; k < starters.length; k++) {
    const slot = (rosterPositions[k] || "").toUpperCase();
    if (!slot || slot === "BN" || slot === "IR" || slot === "TAXI") continue;
    if (slotEligible(fpos, slot)) {
      const sp = starters[k];
      if (sp && sp !== "0") {
        const pts = playersPoints[sp] ?? 0;
        if (pts < worstPts) {
          worstPts = pts;
          worstId = sp;
        }
      }
    }
  }
  if (worstId === null) return { gain: 0, replacedId: null, replacedPts: 0 };
  return {
    gain: Math.max(0, benchedPts - worstPts),
    replacedId: worstId,
    replacedPts: worstPts,
  };
}

type Acc = {
  rostered: number;
  started: number;
  ptsStarted: number;
  recW: number;
  recL: number;
  rawBench: number;
  marginal: number;
  shouldStart: number;
  badSits: BadSit[];
  firstOrder: number | null;
  firstLabel: string;
  lastLabel: string;
};

type AcqEvent = { order: number; label: string };

export async function getPlayerProfile(
  chain: SleeperLeagueDetail[],
  playerId: string,
  fantasyPositions: string[],
  playerMap: Record<string, PlayerInfo>
): Promise<PlayerProfile> {
  const played = chain.filter(seasonHasData);
  const oldestFirst = [...played].reverse();

  // Who currently holds him (from the newest league's live roster).
  let currentOwnerId: string | null = null;
  if (chain[0]) {
    const cur = await getFullRosters(chain[0].league_id);
    currentOwnerId =
      cur.find((r) => r.players.includes(playerId))?.owner_id ?? null;
  }

  const perOwner = new Map<string, Acc>();
  const ensure = (oid: string): Acc => {
    let a = perOwner.get(oid);
    if (!a) {
      a = {
        rostered: 0,
        started: 0,
        ptsStarted: 0,
        recW: 0,
        recL: 0,
        rawBench: 0,
        marginal: 0,
        shouldStart: 0,
        badSits: [],
        firstOrder: null,
        firstLabel: "",
        lastLabel: "",
      };
      perOwner.set(oid, a);
    }
    return a;
  };

  const timeline: TimelinePoint[] = [];
  const names = new Map<
    string,
    { name: string; handle: string; avatar: string | null }
  >();
  const acqByOwner = new Map<string, AcqEvent>();
  const noteAcq = (oid: string, order: number, label: string) => {
    const cur = acqByOwner.get(oid);
    if (!cur || order < cur.order) acqByOwner.set(oid, { order, label });
  };

  for (let si = 0; si < oldestFirst.length; si++) {
    const season = oldestFirst[si];
    const lid = season.league_id;
    const rosterPositions = season.rosterPositions;
    const throughWeek = (season.playoff_week_start || 15) - 1;

    const [rosters, users] = await Promise.all([
      getRosters(lid),
      getLeagueUsers(lid),
    ]);
    const ownerByRoster = new Map<number, string | null>(
      rosters.map((r) => [r.roster_id, r.owner_id])
    );
    users.forEach((u) =>
      names.set(u.user_id, {
        name: u.team_name || u.display_name,
        handle: u.display_name,
        avatar: u.teamAvatar,
      })
    );
    const nameOf = (oid: string | null | undefined) =>
      (oid && names.get(oid)?.name) || "a rival";

    // Draft acquisition
    try {
      const drafts = await fetch(`${BASE}/league/${lid}/drafts`).then((r) =>
        r.ok ? r.json() : []
      );
      for (const d of drafts) {
        const picks = await fetch(`${BASE}/draft/${d.draft_id}/picks`).then(
          (r) => (r.ok ? r.json() : [])
        );
        const pk = picks.find(
          (p: { player_id?: string }) => p.player_id === playerId
        );
        if (pk?.picked_by) {
          noteAcq(
            pk.picked_by,
            si * 1000,
            `Drafted · R${pk.round}.${pk.pick_no} (${season.season})`
          );
        }
      }
    } catch {}

    // Weekly regular season — stats + timeline
    const weeks = Array.from({ length: throughWeek }, (_, i) => i + 1);
    const perWeek = await Promise.all(
      weeks.map((w) =>
        fetch(`${BASE}/league/${lid}/matchups/${w}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    );

    // For weeks where the player scored 0 while rostered, confirm whether he
    // actually played via the weekly stats endpoint (absent = bye/inactive).
    // Only these few weeks need the extra fetch.
    const zeroWeeks: number[] = [];
    perWeek.forEach((ms, wi) => {
      if (!Array.isArray(ms)) return;
      for (const m of ms) {
        const roster: string[] = m.players ?? [];
        if (roster.includes(playerId)) {
          if (((m.players_points ?? {})[playerId] ?? 0) === 0)
            zeroWeeks.push(wi + 1);
          break;
        }
      }
    });
    const didNotPlay = new Set<number>();
    if (zeroWeeks.length > 0) {
      const checks = await Promise.all(
        zeroWeeks.map((w) =>
          fetch(`${BASE}/stats/nfl/regular/${season.season}/${w}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
            .then((st) => ({ w, played: !!(st && st[playerId]) }))
        )
      );
      checks.forEach(({ w, played }) => {
        if (!played) didNotPlay.add(w);
      });
    }

    perWeek.forEach((ms, wi) => {
      if (!Array.isArray(ms)) return;
      const week = wi + 1;
      // Group by matchup_id for win/loss lookup.
      const byMatch = new Map<
        number,
        { roster_id: number; points: number }[]
      >();
      for (const m of ms) {
        if (m.matchup_id == null || m.points == null) continue;
        const arr = byMatch.get(m.matchup_id) ?? [];
        arr.push({ roster_id: m.roster_id, points: m.points });
        byMatch.set(m.matchup_id, arr);
      }

      for (const m of ms) {
        const roster: string[] = m.players ?? [];
        if (!roster.includes(playerId)) continue;
        const startersArr: string[] = m.starters ?? [];
        const pp: Record<string, number> = m.players_points ?? {};
        const ownerId = ownerByRoster.get(m.roster_id);
        if (!ownerId) continue;

        const started = startersArr.includes(playerId);
        const pts = pp[playerId] ?? 0;

        // Skip only true bye/inactive weeks (0 pts AND absent from the weekly
        // stats). A player who played and got blanked still counts.
        if (pts === 0 && didNotPlay.has(week)) continue;

        const order = si * 1000 + week;
        const label = `${season.season} wk${week}`;

        timeline.push({
          seasonLabel: season.season,
          week,
          pts,
          started,
          ownerId,
        });

        const a = ensure(ownerId);
        a.rostered += 1;
        if (a.firstOrder == null) {
          a.firstOrder = order;
          a.firstLabel = label;
        }
        a.lastLabel = label;

        if (started) {
          a.started += 1;
          a.ptsStarted += pts;
          const pair = byMatch.get(m.matchup_id);
          if (pair && pair.length === 2) {
            const opp = pair.find((x) => x.roster_id !== m.roster_id);
            if (opp) {
              if (m.points > opp.points) a.recW += 1;
              else if (m.points < opp.points) a.recL += 1;
            }
          }
        } else {
          a.rawBench += pts;
          // A benching only "costs" points if the player would have been in
          // the OPTIMAL lineup — i.e. he was genuinely one of the best options,
          // not just barely better than the single worst starter.
          const rostered = roster.map((id) => ({
            id,
            pts: pp[id] ?? 0,
            fpos: playerMap[id]?.fantasyPositions ?? [],
          }));
          const optimal = optimalStarters(rosterPositions, rostered);
          if (optimal.has(playerId)) {
            const mr = marginalForWeek(
              rosterPositions,
              startersArr,
              pp,
              pts,
              fantasyPositions
            );
            if (mr.gain > 0) {
              a.marginal += mr.gain;
              a.shouldStart += 1;

              // Opponent + score that week, and whether starting him would
              // have flipped a loss into a win.
              let myScore = m.points ?? 0;
              let oppScore = 0;
              let oppName = "opponent";
              let oppHandle = "";
              const pair = byMatch.get(m.matchup_id);
              if (pair && pair.length === 2) {
                const oppEntry = pair.find((x) => x.roster_id !== m.roster_id);
                if (oppEntry) {
                  oppScore = oppEntry.points;
                  const oppOwner = ownerByRoster.get(oppEntry.roster_id);
                  const nm = oppOwner ? names.get(oppOwner) : undefined;
                  oppName = nm?.name ?? "opponent";
                  oppHandle = nm?.handle ?? "";
                }
              }
              const wouldHaveWon =
                myScore < oppScore && myScore + mr.gain > oppScore;

              a.badSits.push({
                seasonLabel: season.season,
                week,
                playerPts: pts,
                replacedId: mr.replacedId,
                replacedPts: mr.replacedPts,
                gain: mr.gain,
                oppName,
                oppHandle,
                myScore,
                oppScore,
                wouldHaveWon,
              });
            }
          }
        }
      }
    });

    // Transactions — acquisition (trade / waiver / free agent)
    const txWeeks = Array.from({ length: 19 }, (_, i) => i); // 0..18
    const perTx = await Promise.all(
      txWeeks.map((w) =>
        fetch(`${BASE}/league/${lid}/transactions/${w}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    );
    perTx.forEach((txs, wi) => {
      if (!Array.isArray(txs)) return;
      for (const t of txs) {
        if (t.status !== "complete") continue;
        const adds: Record<string, number> = t.adds ?? {};
        if (!(playerId in adds)) continue;
        const ownerId = ownerByRoster.get(adds[playerId]);
        if (!ownerId) continue;
        const order = si * 1000 + wi;
        let label: string;
        if (t.type === "trade") {
          const drops: Record<string, number> = t.drops ?? {};
          const from = ownerByRoster.get(drops[playerId]);
          label = `Trade from ${nameOf(from)} (${season.season} wk${wi})`;
        } else if (t.type === "waiver") {
          const bid = t.settings?.waiver_bid;
          label = `Waiver${bid ? ` · $${bid}` : ""} (${season.season} wk${wi})`;
        } else {
          label = `Free agent (${season.season} wk${wi})`;
        }
        noteAcq(ownerId, order, label);
      }
    });
  }

  // Build chronological stints.
  const stints: OwnerStint[] = [];
  perOwner.forEach((a, ownerId) => {
    if (a.rostered === 0) return;
    const nm = names.get(ownerId);
    stints.push({
      ownerId,
      name: nm?.name ?? "Unknown",
      handle: nm?.handle ?? "unknown",
      avatar: nm?.avatar ?? null,
      isCurrent: ownerId === currentOwnerId,
      firstLabel: a.firstLabel,
      lastLabel: a.lastLabel,
      acquisition: acqByOwner.get(ownerId)?.label ?? "Unknown",
      rosteredGames: a.rostered,
      startedGames: a.started,
      startRate: a.rostered ? a.started / a.rostered : 0,
      ppgStarted: a.started ? a.ptsStarted / a.started : 0,
      recStartedW: a.recW,
      recStartedL: a.recL,
      rawBenchPts: a.rawBench,
      marginalBenchPts: a.marginal,
      shouldHaveStarted: a.shouldStart,
      badSits: a.badSits,
    });
  });
  stints.sort(
    (x, y) =>
      (perOwner.get(x.ownerId)?.firstOrder ?? 0) -
      (perOwner.get(y.ownerId)?.firstOrder ?? 0)
  );

  const totalStartedPts = stints.reduce((s, x) => s + x.ppgStarted * x.startedGames, 0);
  const totalStartedGames = stints.reduce((s, x) => s + x.startedGames, 0);
  const totalRosteredPts = timeline.reduce((s, t) => s + t.pts, 0);

  return {
    totalRosteredPts,
    totalStartedPts,
    ppg: totalStartedGames ? totalStartedPts / totalStartedGames : 0,
    ownerCount: stints.length,
    stints,
    timeline,
  };
}
