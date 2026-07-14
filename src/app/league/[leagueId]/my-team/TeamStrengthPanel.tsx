"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getRoomStrength } from "@/lib/roomStrength";

type Row = { pos: string; label: string; st: number | null; bn: number | null; total: number };

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
        rooms.map((r) => {
          const me = r.teams.find((t) => t.isMe);
          return {
            pos: r.position,
            label: r.label,
            st: me?.starterPlacement ?? null,
            bn: me?.benchPlacement ?? null,
            total,
          };
        })
      );
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

  const n = rows.length;
  const cx = 140;
  const cy = 96;
  const R = 62;
  const angle = (i: number) => ((-90 + i * (360 / n)) * Math.PI) / 180;
  const pt = (v: number, i: number, rr = R): [number, number] => {
    const a = angle(i);
    return [cx + v * rr * Math.cos(a), cy + v * rr * Math.sin(a)];
  };
  const strength = (rank: number | null, total: number) => (rank ? (total - rank + 1) / total : 0);
  const poly = (vals: number[]) =>
    vals.map((v, i) => pt(v, i).map((x) => x.toFixed(1)).join(",")).join(" ");
  const stVals = rows.map((r) => strength(r.st, r.total));
  const bnVals = rows.map((r) => strength(r.bn, r.total));

  return (
    <div className="flex h-full flex-col justify-center rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 pb-3 pt-2.5">
      <div className="mb-1 flex items-center justify-between">
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

      <svg viewBox="0 0 280 196" className="mx-auto block w-full max-w-[320px]">
        {[0.25, 0.5, 0.75, 1].map((lv, k) => (
          <polygon key={k} points={poly(rows.map(() => lv))} fill="none" stroke="#27272a" strokeWidth="1" />
        ))}
        {rows.map((_, i) => {
          const [x, y] = pt(1, i);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#27272a" strokeWidth="1" />;
        })}
        {/* bench (dashed) */}
        <polygon points={poly(bnVals)} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.85" />
        {bnVals.map((v, i) => {
          const [x, y] = pt(v, i);
          return <circle key={i} cx={x} cy={y} r="2" fill="#38bdf8" opacity="0.85" />;
        })}
        {/* starters (filled) */}
        <polygon points={poly(stVals)} fill="rgba(52,211,153,0.18)" stroke="#34d399" strokeWidth="2" />
        {stVals.map((v, i) => {
          const [x, y] = pt(v, i);
          return (
            <circle key={i} cx={x} cy={y} r="3" fill="#34d399">
              <title>{`${rows[i].label} — starters #${rows[i].st ?? "—"}, bench #${rows[i].bn ?? "—"}`}</title>
            </circle>
          );
        })}
        {/* axis labels */}
        {rows.map((r, i) => {
          const [x, y] = pt(1, i, R * 1.36);
          const c = Math.cos(angle(i));
          const anchor = c > 0.3 ? "start" : c < -0.3 ? "end" : "middle";
          return (
            <text key={i} x={x} y={y + 3.5} textAnchor={anchor} fill="#a1a1aa" fontSize="11" fontWeight="600">
              {r.pos}
            </text>
          );
        })}
      </svg>

      <div className="flex items-center justify-center gap-5 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Starters
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-sky-400" /> Bench
        </span>
        <span className="text-zinc-700">outer = stronger</span>
      </div>
    </div>
  );
}
