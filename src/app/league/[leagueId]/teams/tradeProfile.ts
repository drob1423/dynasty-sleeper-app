// ---------------------------------------------------------------------------
// Trade profile: each team's positional NEEDS and STRENGTHS, for scouting.
//
// Needs (tier bands): a position's starters × teams carves the league-wide
// position rank into bands of width = #teams. With 10 teams, QB (2 starters)
// gives QB1 = rank 1–10 and QB2 = 11–20. A team "has" tier k if it rosters a
// player whose position rank lands in band k; an empty band is a NEED. When a
// team has fewer than 3 starter-tier needs, we surface the steepest depth gap
// (the next band beyond the starters) until they have three.
//
// Strengths: the team's overall room rank at a position (top few = strong).
// ---------------------------------------------------------------------------

import type { PositionRoom } from "@/lib/roomStrength";

export type PosNeed = { pos: string; tier: number; label: string };
export type PosStrength = { pos: string; rank: number };
export type TradeProfile = { needs: PosNeed[]; strengths: PosStrength[] };

const MIN_NEEDS = 3;
const POS_ORDER = ["QB", "RB", "WR", "TE", "FLEX"];

// Short display label — Flex is abbreviated to keep chips tidy.
export function shortPos(pos: string) {
  return pos === "FLEX" ? "FLX" : pos;
}

export function computeTradeProfiles(
  rooms: PositionRoom[]
): Map<number, TradeProfile> {
  const out = new Map<number, TradeProfile>();
  if (!rooms.length) return out;

  const teamCount = rooms[0].teams.length;
  // Top-third (capped at 3) counts as a strength at a position.
  const strongCut = Math.max(1, Math.min(3, Math.ceil(teamCount / 3)));

  for (const { rosterId } of rooms[0].teams) {
    out.set(rosterId, profileForTeam(rooms, rosterId, teamCount, strongCut));
  }
  return out;
}

function profileForTeam(
  rooms: PositionRoom[],
  rosterId: number,
  teamCount: number,
  strongCut: number
): TradeProfile {
  const starterNeeds: PosNeed[] = [];
  const depthGaps: (PosNeed & { cliff: number })[] = [];
  const strengths: PosStrength[] = [];

  for (const room of rooms) {
    const team = room.teams.find((t) => t.rosterId === rosterId);
    if (!team) continue;

    const label = shortPos(room.position);
    const ranks = team.players.map((p) => p.posRank).sort((a, b) => a - b);
    const inBand = (k: number) => {
      const lo = (k - 1) * teamCount + 1;
      const hi = k * teamCount;
      return ranks.some((r) => r >= lo && r <= hi);
    };

    // Empty starter tiers are the real needs.
    let allStartersFilled = true;
    for (let k = 1; k <= room.startersN; k++) {
      if (!inBand(k)) {
        starterNeeds.push({ pos: room.position, tier: k, label: `${label}${k}` });
        allStartersFilled = false;
      }
    }

    // If the starters are all there, note the next band as a depth candidate.
    if (allStartersFilled) {
      const k = room.startersN + 1;
      if (!inBand(k)) {
        const hi = room.startersN * teamCount;
        // How far their best deeper player sits below the band (bigger = steeper
        // drop-off = a more real depth need). No such player = the steepest.
        const nextBeyond = ranks.find((r) => r > hi);
        const cliff = nextBeyond ? nextBeyond - hi : Number.MAX_SAFE_INTEGER;
        depthGaps.push({ pos: room.position, tier: k, label: `${label}${k}`, cliff });
      }
    }

    // Strength = a top overall room rank at this position.
    if (team.starterPlacement != null && team.starterPlacement <= strongCut) {
      strengths.push({ pos: room.position, rank: team.starterPlacement });
    }
  }

  const needs = [...starterNeeds];
  if (needs.length < MIN_NEEDS) {
    depthGaps.sort((a, b) => b.cliff - a.cliff);
    for (const d of depthGaps) {
      if (needs.length >= MIN_NEEDS) break;
      needs.push({ pos: d.pos, tier: d.tier, label: d.label });
    }
  }

  needs.sort(
    (a, b) => a.tier - b.tier || POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos)
  );
  strengths.sort((a, b) => a.rank - b.rank);

  return { needs, strengths };
}
