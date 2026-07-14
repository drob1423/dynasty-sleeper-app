"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  getPositionStrength,
  type PositionStrength,
  type TeamRoom,
} from "@/lib/positionStrength";

const POS_LABEL: Record<string, string> = {
  QB: "Quarterback",
  RB: "Running Back",
  WR: "Wide Receiver",
  TE: "Tight End",
  FLEX: "Flex · RB/WR/TE",
};

export default function InsightsTab() {
  const params = useParams();
  const leagueId = params.leagueId as string;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PositionStrength[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    async function load() {
      const auth = await supabase.auth.getUser();
      const myUserId = auth.data.user?.user_metadata?.sleeper_user_id as
        | string
        | undefined;
      const res = await getPositionStrength(leagueId, myUserId);
      if (alive) {
        setData(res);
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [leagueId]);

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) {
    return (
      <p className="py-10 text-center text-zinc-400">
        Crunching every roster&rsquo;s scoring…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Positional Strength</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Every team&rsquo;s position group split into two — the average league
          rank of its <span className="text-emerald-400">starters</span> and of
          its <span className="text-sky-400">bench</span> behind them (lower =
          better). Ranked by starter quality.
        </p>
      </div>

      {data.map((pos) => (
        <PositionCard
          key={pos.position}
          pos={pos}
          leagueId={leagueId}
          open={open}
          toggle={toggle}
        />
      ))}

      <p className="pt-1 text-xs text-zinc-600">
        <span className="text-emerald-500/80">Starters (ST)</span> = average
        league rank of the players that fill the lineup slots (QB 2, RB 2, WR 2,
        TE 1; Flex = the full 7-man RB/WR/TE lineup) — cards rank by this.{" "}
        <span className="text-sky-500/80">Bench (BN)</span> = average league
        rank of everyone behind them (·N = how many), so quality depth beats a
        pile of replaceable bodies. Lower is better. Only players with 3+
        scoring games count; tenure-neutral, so rookies compare fairly.
      </p>
    </div>
  );
}

function PositionCard({
  pos,
  leagueId,
  open,
  toggle,
}: {
  pos: PositionStrength;
  leagueId: string;
  open: Set<string>;
  toggle: (k: string) => void;
}) {
  const n = pos.teams.length;
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="flex items-baseline justify-between border-b border-zinc-800 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
          {POS_LABEL[pos.position] ?? pos.position}
          <span className="ml-1.5 text-zinc-600">
            · {pos.starters} starter{pos.starters === 1 ? "" : "s"}
          </span>
        </h3>
        <span className="flex gap-3 text-[10px] uppercase tracking-wide">
          <span className="text-emerald-500/80">Starters</span>
          <span className="text-sky-500/80">Bench</span>
          <span className="text-zinc-600">avg rank</span>
        </span>
      </div>
      <div>
        {pos.teams.map((t, i) => (
          <RoomRow
            key={t.rosterId}
            t={t}
            rank={i + 1}
            total={n}
            starterBest={pos.starterBest}
            starterWorst={pos.starterWorst}
            depthBest={pos.depthBest}
            depthWorst={pos.depthWorst}
            leagueId={leagueId}
            expanded={open.has(`${pos.position}-${t.rosterId}`)}
            onToggle={() => toggle(`${pos.position}-${t.rosterId}`)}
          />
        ))}
      </div>
    </div>
  );
}

// One labeled metric bar (Starters / Depth) with its value at the end.
function BarLine({
  label,
  pct,
  barClass,
  valueClass,
  text,
  sub,
}: {
  label: string;
  pct: number;
  barClass: string;
  valueClass: string;
  text: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 shrink-0 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`w-16 shrink-0 text-right text-xs font-semibold tabular-nums ${valueClass}`}
      >
        {text}
        {sub && <span className="text-zinc-600"> {sub}</span>}
      </span>
    </div>
  );
}

function RoomRow({
  t,
  rank,
  total,
  starterBest,
  starterWorst,
  depthBest,
  depthWorst,
  leagueId,
  expanded,
  onToggle,
}: {
  t: TeamRoom;
  rank: number;
  total: number;
  starterBest: number;
  starterWorst: number;
  depthBest: number;
  depthWorst: number;
  leagueId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Both bars: fuller = better (lower avg rank). Scaled between the league's
  // best and worst for contrast within the card.
  const rankPct = (
    v: number | null,
    best: number,
    worst: number
  ): number =>
    v == null
      ? 0
      : worst > best
      ? Math.max(2, ((worst - v) / (worst - best)) * 100)
      : 100;
  const startPct = rankPct(t.starterAvgRank, starterBest, starterWorst);
  const depthPct = rankPct(t.depthAvgRank, depthBest, depthWorst);

  return (
    <div
      className={`border-t border-zinc-800/60 ${
        t.isMe ? "bg-sky-950/20 ring-1 ring-inset ring-sky-900/50" : ""
      }`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-800/40"
      >
        <span className="w-5 shrink-0 text-center text-xs font-semibold text-zinc-500">
          {rank}
        </span>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
          {t.logo && (
            <img
              src={t.logo}
              alt=""
              className="h-7 w-7 object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-white">
              {t.handle}
            </span>
            {rank === 1 && (
              <span className="shrink-0 rounded-full border border-emerald-900 bg-emerald-950/50 px-1.5 py-px text-[9px] uppercase tracking-wide text-emerald-400">
                Best starters
              </span>
            )}
            {rank === total && (
              <span className="shrink-0 rounded-full border border-red-900 bg-red-950/40 px-1.5 py-px text-[9px] uppercase tracking-wide text-red-400">
                Weakest
              </span>
            )}
          </div>
          <BarLine
            label="ST"
            pct={startPct}
            barClass="bg-emerald-500/70"
            valueClass="text-emerald-300"
            text={t.starterAvgRank != null ? t.starterAvgRank.toFixed(1) : "—"}
          />
          <BarLine
            label="BN"
            pct={depthPct}
            barClass="bg-sky-500/60"
            valueClass="text-sky-300/90"
            text={t.depthAvgRank != null ? t.depthAvgRank.toFixed(1) : "—"}
            sub={t.depthCount > 0 ? `·${t.depthCount}` : undefined}
          />
        </div>
      </button>

      {expanded && (
        <div className="space-y-1 px-4 pb-3 pl-12">
          {t.players.length === 0 ? (
            <p className="text-xs text-zinc-600">No qualifying producers.</p>
          ) : (
            t.players.map((p) => (
              <Link
                key={p.id}
                href={`/league/${leagueId}/player/${p.id}`}
                className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs hover:bg-zinc-800/50 ${
                  p.isStarter ? "" : "opacity-45"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`w-6 shrink-0 rounded py-0.5 text-center text-[10px] font-semibold tabular-nums ${
                      p.isStarter
                        ? "bg-emerald-950/60 text-emerald-400"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {p.posRank}
                  </span>
                  <span className="truncate text-zinc-300">
                    {p.name}
                    {p.team && (
                      <span className="text-zinc-600"> · {p.team}</span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-zinc-400">
                  {p.ppg.toFixed(1)} <span className="text-zinc-600">ppg</span>
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
