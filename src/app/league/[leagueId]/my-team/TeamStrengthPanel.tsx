"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getRoomStrength } from "@/lib/roomStrength";

const POS_CHIP: Record<string, string> = {
  QB: "border-rose-500/30 bg-rose-500/15 text-rose-300",
  RB: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  WR: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  TE: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  FLEX: "border-violet-500/30 bg-violet-500/15 text-violet-300",
};

type Row = { pos: string; label: string; rank: number | null; total: number };

function tier(rank: number | null, total: number): "hi" | "mid" | "lo" | "na" {
  if (rank == null) return "na";
  const third = Math.ceil(total / 3);
  if (rank <= third) return "hi";
  if (rank > total - third) return "lo";
  return "mid";
}
const TIER_TEXT = { hi: "text-emerald-400", mid: "text-amber-300", lo: "text-red-400", na: "text-zinc-500" };
const TIER_BAR = { hi: "bg-emerald-500", mid: "bg-amber-400", lo: "bg-red-500", na: "bg-zinc-700" };

export function TeamStrengthPanel({ leagueId }: { leagueId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [overall, setOverall] = useState<{ rank: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      const auth = await supabase.auth.getUser();
      const myUserId = auth.data.user?.user_metadata?.sleeper_user_id as string | undefined;
      const { rooms } = await getRoomStrength(leagueId, myUserId);
      if (!alive) return;
      if (!rooms.length) {
        setLoading(false);
        return;
      }
      const total = rooms[0].teams.length;
      setRows(
        rooms.map((r) => ({
          pos: r.position,
          label: r.label,
          rank: r.teams.find((t) => t.isMe)?.starterPlacement ?? null,
          total,
        }))
      );
      // Overall = rank teams by their average position placement.
      const agg = new Map<number, { sum: number; n: number; isMe: boolean }>();
      rooms.forEach((r) =>
        r.teams.forEach((t) => {
          if (t.starterPlacement == null) return;
          const e = agg.get(t.rosterId) ?? { sum: 0, n: 0, isMe: false };
          e.sum += t.starterPlacement;
          e.n += 1;
          e.isMe = e.isMe || t.isMe;
          agg.set(t.rosterId, e);
        })
      );
      const ranked = [...agg.values()].sort((a, b) => a.sum / a.n - b.sum / b.n);
      const idx = ranked.findIndex((x) => x.isMe);
      if (idx >= 0) setOverall({ rank: idx + 1, total: ranked.length });
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [leagueId]);

  if (loading || !rows.length) return null;

  const ranked = rows.filter((r) => r.rank != null) as (Row & { rank: number })[];
  const best = ranked.length ? ranked.reduce((a, b) => (b.rank < a.rank ? b : a)) : null;
  const worst = ranked.length ? ranked.reduce((a, b) => (b.rank > a.rank ? b : a)) : null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Team Strength</h3>
        {overall && (
          <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-white">
            #{overall.rank} of {overall.total} overall
          </span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {rows.map((r) => {
          const t = tier(r.rank, r.total);
          return (
            <div key={r.pos} className="rounded-xl bg-zinc-950/50 p-3 text-center">
              <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${POS_CHIP[r.pos] ?? "border-zinc-600 text-zinc-300"}`}>
                {r.pos}
              </span>
              <div className={`mt-2 text-2xl font-bold tabular-nums ${TIER_TEXT[t]}`}>
                {r.rank ? `#${r.rank}` : "—"}
              </div>
              <div className="text-[10px] text-zinc-600">of {r.total}</div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full ${TIER_BAR[t]}`}
                  style={{ width: r.rank ? `${((r.total - r.rank + 1) / r.total) * 100}%` : "0%" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {best && worst && best.pos !== worst.pos && (
        <div className="mt-4 text-xs text-zinc-500">
          Strongest <span className="font-semibold text-emerald-400">{best.label} (#{best.rank})</span>
          <span className="mx-2 text-zinc-700">·</span>
          Weakest <span className="font-semibold text-red-400">{worst.label} (#{worst.rank})</span>
        </div>
      )}
    </div>
  );
}
