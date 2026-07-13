import { NextResponse } from "next/server";

// Cache this route's response for a day — the player list barely changes.
export const revalidate = 86400;

// Sleeper's full player file is ~14MB. We download it server-side (cached 24h),
// trim it to the few fields the app needs, and return a compact map keyed by
// player_id. Short keys keep the payload small: n=name, p=position, t=team,
// a=age, e=years of experience.
type Compact = { n: string; p: string | null; t: string | null; a: number | null; e: number | null };

export async function GET() {
  const res = await fetch("https://api.sleeper.app/v1/players/nfl", {
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }

  const all: Record<string, Record<string, unknown>> = await res.json();
  const out: Record<string, Compact> = {};

  for (const id in all) {
    const p = all[id];
    if (!p) continue;

    const position = (p.position as string) ?? null;
    // Team defenses have no full_name — build one from the team abbreviation.
    const name =
      (p.full_name as string) ||
      (position === "DEF" && p.team
        ? `${p.team as string} D/ST`
        : `${(p.first_name as string) ?? ""} ${(p.last_name as string) ?? ""}`.trim()) ||
      "Unknown";

    out[id] = {
      n: name,
      p: position,
      t: (p.team as string) ?? null,
      a: (p.age as number) ?? null,
      e: (p.years_exp as number) ?? null,
    };
  }

  return NextResponse.json(out);
}
