// Trigger a league sync. Runs server-side with the service-role key.
// During dev, hit it directly: GET /api/sync/<leagueId> on localhost:3001.
// The first full backfill is heavy (weeks of stats + history), so run it on
// localhost (no function timeout); afterward reads are instant everywhere.

import { NextResponse } from "next/server";
import { syncLeague } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(leagueId: string) {
  const result = await syncLeague(leagueId);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(_req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await ctx.params;
  return run(leagueId);
}

export async function GET(_req: Request, ctx: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await ctx.params;
  return run(leagueId);
}
