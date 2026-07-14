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
          Every team&rsquo;s position group ranked by the average league
          position rank of its players. Quality of the room, not quantity.
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
        Each rostered {`{QB,RB,WR,TE}`} with 3+ scoring games is ranked
        league-wide by PPG; a team&rsquo;s score is its players&rsquo; average
        rank (lower = better). Tenure-neutral, so rookies compare fairly.
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
          <span className="ml-1.5 text-zinc-600">rooms</span>
        </h3>
        <span className="text-[10px] uppercase tracking-wide text-zinc-600">
          Avg rank
        </span>
      </div>
      <div>
        {pos.teams.map((t, i) => (
          <RoomRow
            key={t.rosterId}
            t={t}
            rank={i + 1}
            total={n}
            pool={pos.pool}
            leagueId={leagueId}
            expanded={open.has(`${pos.position}-${t.rosterId}`)}
            onToggle={() => toggle(`${pos.position}-${t.rosterId}`)}
          />
        ))}
      </div>
    </div>
  );
}

function RoomRow({
  t,
  rank,
  total,
  pool,
  leagueId,
  expanded,
  onToggle,
}: {
  t: TeamRoom;
  rank: number;
  total: number;
  pool: number;
  leagueId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Fuller bar = better (lower average rank). Scale against the position pool.
  const pct =
    t.avgRank != null && pool > 0
      ? Math.max(2, ((pool - t.avgRank + 1) / pool) * 100)
      : 0;
  // Strength tier by rank: top third green, bottom third red, middle neutral.
  const third = Math.ceil(total / 3);
  const tier =
    rank <= third ? "emerald" : rank > total - third ? "red" : "zinc";
  const bar =
    tier === "emerald"
      ? "bg-emerald-500/70"
      : tier === "red"
      ? "bg-red-500/60"
      : "bg-zinc-500/50";
  const scoreColor =
    tier === "emerald"
      ? "text-emerald-400"
      : tier === "red"
      ? "text-red-400"
      : "text-zinc-300";

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
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-white">
              {t.handle}
            </span>
            {t.isMe && (
              <span className="shrink-0 rounded-full border border-sky-800 bg-sky-950/50 px-1.5 py-px text-[9px] uppercase tracking-wide text-sky-400">
                You
              </span>
            )}
            {rank === 1 && (
              <span className="shrink-0 rounded-full border border-emerald-900 bg-emerald-950/50 px-1.5 py-px text-[9px] uppercase tracking-wide text-emerald-400">
                Deepest
              </span>
            )}
            {rank === total && (
              <span className="shrink-0 rounded-full border border-red-900 bg-red-950/40 px-1.5 py-px text-[9px] uppercase tracking-wide text-red-400">
                Thinnest
              </span>
            )}
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full ${bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-sm font-bold tabular-nums ${scoreColor}`}>
            {t.avgRank != null ? t.avgRank.toFixed(1) : "—"}
          </div>
          <div className="text-[10px] text-zinc-600">
            {t.players.length} {t.players.length === 1 ? "player" : "players"}
          </div>
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
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs hover:bg-zinc-800/50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 rounded bg-zinc-800 py-0.5 text-center text-[10px] font-semibold tabular-nums text-zinc-400">
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
