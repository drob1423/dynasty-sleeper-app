// ---------------------------------------------------------------------------
// Roster insights — per-player stats for a team's roster, from the current
// owner's perspective: start rate, PPG, league positional rank, and how the
// player was acquired (with full trade details when it was a trade).
// ---------------------------------------------------------------------------

import {
  getSeasonChain,
  getFullRosters,
  getRosters,
  getLeagueUsers,
  seasonHasData,
  type PlayerInfo,
} from "./sleeper";

const BASE = "https://api.sleeper.app/v1";

export type TradeSide = { handle: string; received: string[] };
export type TradeDetail = {
  season: string;
  week: number;
  sides: TradeSide[];
};

export type Acquisition = {
  method: "draft" | "trade" | "waiver" | "free_agent" | "unknown";
  label: string; // compact, e.g. "Draft R5.42", "Trade", "Waiver $11"
  week?: number; // NFL week (for in-season adds)
  dateMs?: number; // when the add processed
  trade?: TradeDetail;
};

export type PlayerInsight = {
  startRate: number | null; // 0..1
  startedGames: number;
  rosteredGames: number;
  ppg: number | null; // per started game
  rank: number | null; // positional rank in the league
  rankPool: number; // # rostered at that position
  acquisition: Acquisition;
};

export async function getRosterInsights(
  leagueId: string,
  rosterId: number,
  playerMap: Record<string, PlayerInfo>
): Promise<Record<string, PlayerInsight>> {
  const chain = await getSeasonChain(leagueId);
  const played = chain.filter(seasonHasData);
  const oldestFirst = [...played].reverse();

  // Current roster + its owner.
  const currentRosters = await getFullRosters(leagueId);
  const roster = currentRosters.find((r) => r.roster_id === rosterId);
  const ownerId = roster?.owner_id ?? null;
  const rosterPlayers = roster?.players ?? [];
  const rosterSet = new Set(rosterPlayers);

  // Accumulators
  const totalPtsAll = new Map<string, number>(); // every player's total pts (for rank)
  const usage = new Map<string, { rostered: number; started: number; pts: number }>();
  const zeroWeeks = new Map<string, Set<number>>(); // playerId -> weeks scored 0 while on owner's roster (season-scoped below)
  const acqEvents = new Map<
    string,
    { order: number; acq: Acquisition }
  >();

  const noteAcq = (pid: string, order: number, acq: Acquisition) => {
    const cur = acqEvents.get(pid);
    if (!cur || order >= cur.order) acqEvents.set(pid, { order, acq });
  };

  // Pre-pass: fetch every season's draft. Builds (a) draft acquisitions for the
  // current owner, and (b) a lookup to resolve traded picks to their slot +
  // the player selected (keyed by season-round-originalRoster).
  const draftPickLookup = new Map<
    string,
    { slot: number; playerId: string | null; pickedBy: string | null }
  >();
  // Include every season in the chain (even the upcoming pre-draft one, whose
  // ORDER is set even though no picks are made yet).
  const draftSeasons = [...chain].reverse();
  for (let si = 0; si < draftSeasons.length; si++) {
    const season = draftSeasons[si];
    try {
      const drafts = await fetch(`${BASE}/league/${season.league_id}/drafts`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
      for (const d of drafts) {
        const rounds: number = d.settings?.rounds ?? 0;
        const kind = rounds >= 10 ? "Startup" : "Rookie";
        const yy = season.season.slice(2);
        const picks = await fetch(`${BASE}/draft/${d.draft_id}/picks`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []);

        if (picks.length > 0) {
          // Completed draft — resolve slot + the player selected.
          for (const pk of picks) {
            if (pk.roster_id != null && pk.round != null) {
              draftPickLookup.set(
                `${season.season}-${pk.round}-${pk.roster_id}`,
                {
                  slot: pk.draft_slot ?? pk.pick_no ?? 0,
                  playerId: pk.player_id ?? null,
                  pickedBy: pk.picked_by ?? null,
                }
              );
            }
            if (
              pk.player_id &&
              rosterSet.has(pk.player_id) &&
              pk.picked_by === ownerId
            ) {
              noteAcq(pk.player_id, si * 100, {
                method: "draft",
                label: `${kind} '${yy} · R${pk.round}.${pk.pick_no}`,
              });
            }
          }
        } else if (d.draft_order) {
          // Upcoming draft — order set, no picks. Resolve each roster's slot.
          const rosters = await getRosters(season.league_id);
          const numTeams = rosters.length;
          const isSnake = d.type === "snake";
          for (const r of rosters) {
            const baseSlot: number | undefined = r.owner_id
              ? d.draft_order[r.owner_id]
              : undefined;
            if (baseSlot == null) continue;
            for (let round = 1; round <= rounds; round++) {
              const slot =
                isSnake && round % 2 === 0 ? numTeams + 1 - baseSlot : baseSlot;
              draftPickLookup.set(`${season.season}-${round}-${r.roster_id}`, {
                slot,
                playerId: null,
                pickedBy: null,
              });
            }
          }
        }
      }
    } catch {}
  }

  for (let si = 0; si < oldestFirst.length; si++) {
    const season = oldestFirst[si];
    const lid = season.league_id;
    const throughWeek = (season.playoff_week_start || 15) - 1;

    const [rosters, users] = await Promise.all([
      getRosters(lid),
      getLeagueUsers(lid),
    ]);
    const ownerByRoster = new Map(rosters.map((r) => [r.roster_id, r.owner_id]));
    const handleByOwner = new Map(users.map((u) => [u.user_id, u.display_name]));
    // The roster the current owner held this season (may differ from rosterId).
    const ownerRosterId = ownerId
      ? rosters.find((r) => r.owner_id === ownerId)?.roster_id ?? null
      : null;

    // Weekly matchups → total points (rank) + owner's usage of current players.
    const weeks = Array.from({ length: throughWeek }, (_, i) => i + 1);
    const perWeek = await Promise.all(
      weeks.map((w) =>
        fetch(`${BASE}/league/${lid}/matchups/${w}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    );
    perWeek.forEach((ms, wi) => {
      if (!Array.isArray(ms)) return;
      const week = wi + 1;
      for (const m of ms) {
        const pp: Record<string, number> = m.players_points ?? {};
        for (const pid in pp) {
          totalPtsAll.set(pid, (totalPtsAll.get(pid) ?? 0) + (pp[pid] || 0));
        }
        if (ownerRosterId != null && m.roster_id === ownerRosterId) {
          const st = new Set<string>(m.starters ?? []);
          for (const pid of m.players ?? []) {
            if (!rosterSet.has(pid)) continue;
            const pts = pp[pid] ?? 0;
            if (pts === 0) {
              const s = zeroWeeks.get(pid) ?? new Set<number>();
              s.add(si * 100 + week);
              zeroWeeks.set(pid, s);
              continue; // provisionally skip; confirmed as bye below
            }
            const u = usage.get(pid) ?? { rostered: 0, started: 0, pts: 0 };
            u.rostered += 1;
            if (st.has(pid)) {
              u.started += 1;
              u.pts += pts;
            }
            usage.set(pid, u);
          }
        }
      }
    });

    // Transaction acquisitions (trade / waiver / free agent) landing on the
    // current owner's roster.
    const txWeeks = Array.from({ length: 19 }, (_, i) => i);
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
        for (const pid in adds) {
          if (!rosterSet.has(pid)) continue;
          if (ownerByRoster.get(adds[pid]) !== ownerId) continue;
          const order = si * 100 + wi;
          const dateMs = t.status_updated ?? t.created ?? undefined;
          if (t.type === "trade") {
            noteAcq(pid, order, {
              method: "trade",
              label: "Trade",
              week: wi,
              dateMs,
              trade: buildTrade(
                t,
                season.season,
                wi,
                ownerByRoster,
                handleByOwner,
                playerMap,
                draftPickLookup
              ),
            });
          } else if (t.type === "waiver") {
            const bid = t.settings?.waiver_bid;
            noteAcq(pid, order, {
              method: "waiver",
              label: bid ? `Waiver $${bid}` : "Waiver",
              week: wi,
              dateMs,
            });
          } else {
            noteAcq(pid, order, {
              method: "free_agent",
              label: "Free agent",
              week: wi,
              dateMs,
            });
          }
        }
      }
    });
  }

  // Confirm byes: a 0-week only counts as "didn't play" if the player is
  // absent from that week's stats. Fetch stats for the union of 0-weeks.
  const weekKeys = new Set<number>();
  zeroWeeks.forEach((s) => s.forEach((k) => weekKeys.add(k)));
  const statsByKey = new Map<number, Record<string, unknown>>();
  await Promise.all(
    [...weekKeys].map(async (k) => {
      const si = Math.floor(k / 100);
      const week = k % 100;
      const season = oldestFirst[si];
      if (!season) return;
      const st = await fetch(
        `${BASE}/stats/nfl/regular/${season.season}/${week}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (st) statsByKey.set(k, st);
    })
  );
  // Add back the 0-weeks where the player DID play (present in stats).
  zeroWeeks.forEach((weeksSet, pid) => {
    weeksSet.forEach((k) => {
      const st = statsByKey.get(k);
      if (st && st[pid] !== undefined) {
        const u = usage.get(pid) ?? { rostered: 0, started: 0, pts: 0 };
        u.rostered += 1; // played but scored 0, benched (0 pts adds nothing)
        usage.set(pid, u);
      }
    });
  });

  // Positional rank among currently-rostered players (by total points).
  const byPos = new Map<string, { pid: string; pts: number }[]>();
  const allRostered = new Set<string>();
  currentRosters.forEach((r) => (r.players ?? []).forEach((p) => allRostered.add(p)));
  allRostered.forEach((pid) => {
    const pos = playerMap[pid]?.position;
    if (!pos) return;
    const arr = byPos.get(pos) ?? [];
    arr.push({ pid, pts: totalPtsAll.get(pid) ?? 0 });
    byPos.set(pos, arr);
  });
  const rankByPlayer = new Map<string, { rank: number; pool: number }>();
  byPos.forEach((arr) => {
    arr.sort((a, b) => b.pts - a.pts);
    arr.forEach((x, i) => rankByPlayer.set(x.pid, { rank: i + 1, pool: arr.length }));
  });

  // Assemble
  const out: Record<string, PlayerInsight> = {};
  for (const pid of rosterPlayers) {
    const u = usage.get(pid);
    const r = rankByPlayer.get(pid);
    out[pid] = {
      startRate: u && u.rostered ? u.started / u.rostered : null,
      startedGames: u?.started ?? 0,
      rosteredGames: u?.rostered ?? 0,
      ppg: u && u.started ? u.pts / u.started : null,
      rank: r?.rank ?? null,
      rankPool: r?.pool ?? 0,
      acquisition: acqEvents.get(pid)?.acq ?? { method: "unknown", label: "—" },
    };
  }
  return out;
}

// Reconstruct a trade into readable sides (who received what).
function buildTrade(
  t: {
    adds?: Record<string, number>;
    draft_picks?: {
      season: string;
      round: number;
      roster_id: number; // original owner of the pick (determines the slot)
      owner_id: number; // roster that received it in this trade
    }[];
    roster_ids?: number[];
  },
  season: string,
  week: number,
  ownerByRoster: Map<number, string | null>,
  handleByOwner: Map<string, string>,
  playerMap: Record<string, PlayerInfo>,
  draftPickLookup: Map<
    string,
    { slot: number; playerId: string | null; pickedBy: string | null }
  >
): TradeDetail {
  const sides: TradeSide[] = [];
  const rosterIds = t.roster_ids ?? [];
  const handleOf = (rid: number) => {
    const oid = ownerByRoster.get(rid);
    return (oid && handleByOwner.get(oid)) || "?";
  };
  for (const rid of rosterIds) {
    const received: string[] = [];
    for (const pid in t.adds ?? {}) {
      if (t.adds![pid] === rid) received.push(playerMap[pid]?.name ?? pid);
    }
    for (const pk of t.draft_picks ?? []) {
      if (pk.owner_id !== rid) continue;
      const yy = pk.season.slice(2);
      const slot = draftPickLookup.get(
        `${pk.season}-${pk.round}-${pk.roster_id}`
      );
      const slotStr = slot
        ? `R${pk.round}.${String(slot.slot).padStart(2, "0")}`
        : `R${pk.round}`;
      // Whoever RECEIVED this pick in the trade:
      const receiverUser = ownerByRoster.get(rid) ?? null;
      if (slot?.playerId && slot.pickedBy === receiverUser) {
        // The receiver kept it and drafted the player.
        received.push(
          `'${yy} ${slotStr} → ${playerMap[slot.playerId]?.name ?? "pick"}`
        );
      } else if (slot?.playerId) {
        // Drafted, but by someone else — receiver flipped this pick later.
        received.push(`'${yy} ${slotStr} pick`);
      } else if (slot) {
        received.push(`'${yy} ${slotStr} (TBD)`); // order set, not drafted yet
      } else {
        received.push(`'${yy} R${pk.round} pick`);
      }
    }
    sides.push({ handle: handleOf(rid), received });
  }
  return { season, week, sides };
}
