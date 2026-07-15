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
    const S = room.startersN;
    const ranks = team.players.map((p) => p.posRank).sort((a, b) => a - b);

    // Assign players to starter slots. A player can start any slot at or below
    // their tier band (a WR1 can fill the WR2 slot), so go best-first and each
    // takes the lowest free slot it qualifies for; leftover slots = needs.
    // Dedicated positions use one tier per team (QB1 = rank 1–10). Flex draws
    // from a much deeper pool, so its tiers are 2× wide (FLX1 = 1–20, FLX2 =
    // 21–40) — a team's surplus starters and a solid #22 flex both register.
    const bandWidth = room.position === "FLEX" ? 2 * teamCount : teamCount;
    const bands = ranks.map((r) => Math.ceil(r / bandWidth));
    const openSlots = Array.from({ length: S }, (_, i) => i + 1);
    const unusedBands: number[] = [];
    for (const b of bands) {
      const i = openSlots.findIndex((slot) => slot >= b);
      if (i >= 0) openSlots.splice(i, 1);
      else unusedBands.push(b);
    }
    for (const k of openSlots) {
      starterNeeds.push({ pos: room.position, tier: k, label: `${label}${k}` });
    }

    // Depth need (the next band past the starters) — dedicated spots only. Flex
    // is already the depth slot, so we don't chase flex depth.
    if (room.position !== "FLEX" && openSlots.length === 0) {
      const hasDepth = unusedBands.some((b) => b <= S + 1);
      if (!hasDepth) {
        const hi = S * teamCount;
        const nextBeyond = ranks.find((r) => r > hi);
        const cliff = nextBeyond ? nextBeyond - hi : Number.MAX_SAFE_INTEGER;
        depthGaps.push({
          pos: room.position,
          tier: S + 1,
          label: `${label}${S + 1}`,
          cliff,
        });
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
