"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getRoomStrength } from "@/lib/roomStrength";

const POS_CHIP: Record<string, string> = {
  QB: "bg-rose-500/10 text-rose-300/90",
  RB: "bg-emerald-500/10 text-emerald-300/90",
  WR: "bg-sky-500/10 text-sky-300/90",
  TE: "bg-amber-500/10 text-amber-300/90",
  FLEX: "bg-violet-500/10 text-violet-300/90",
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

  return (
    <div className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Positional strength
        </span>
        {overall && (
          <span className="text-[10px] font-bold text-zinc-200">
            #{overall.rank}
            <span className="font-normal text-zinc-600"> of {overall.total} overall</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {rows.map((r) => {
          const t = tier(r.rank, r.total);
          return (
            <div key={r.pos} className="overflow-hidden rounded-lg bg-zinc-900">
              <div className={`py-1.5 text-center text-[9px] font-bold ${POS_CHIP[r.pos] ?? "text-zinc-400"}`}>
                {r.pos}
              </div>
              <div className={`pb-1.5 text-center text-base font-bold tabular-nums ${TIER_TEXT[t]}`}>
                {r.rank ? `#${r.rank}` : "—"}
              </div>
              <div className={`h-1 ${TIER_BAR[t]}`} style={{ opacity: r.rank ? 1 : 0.2 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
