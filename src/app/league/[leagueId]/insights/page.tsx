"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  getRoomStrength,
  type PositionRoom,
  type RoomTeam,
  type RoomPlayer,
} from "@/lib/roomStrength";

function ord(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function InsightsTab() {
  const params = useParams();
  const leagueId = params.leagueId as string;

  const [state, setState] = useState<"loading" | "building" | "ready" | "empty">("loading");
  const [rooms, setRooms] = useState<PositionRoom[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    async function load() {
      const auth = await supabase.auth.getUser();
      const myUserId = auth.data.user?.user_metadata?.sleeper_user_id as string | undefined;
      let res = await getRoomStrength(leagueId, myUserId);
      if (!res.synced) {
        if (alive) setState("building");
        await fetch(`/api/sync/${leagueId}`, { method: "POST" }).catch(() => {});
        res = await getRoomStrength(leagueId, myUserId);
      }
      if (!alive) return;
      setRooms(res.rooms);
      setState(res.rooms.length ? "ready" : "empty");
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

  if (state === "loading" || state === "building") {
    return (
      <p className="py-10 text-center text-zinc-400">
        {state === "building"
          ? "Building your league for the first time (one-time, ~30s)…"
          : "Loading positional strength…"}
      </p>
    );
  }
  if (state === "empty") {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
        No positional data yet for this league.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Positional Strength</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Where each team&rsquo;s <span className="text-emerald-400">starters</span> and{" "}
          <span className="text-sky-400">bench</span> rank in the league. Expand a team to
          see each player&rsquo;s weekly range — the average, the typical week, and the
          boom/bust outliers.
        </p>
      </div>

      {rooms.map((room) => (
        <RoomCard key={room.position} room={room} open={open} toggle={toggle} leagueId={leagueId} />
      ))}

      <p className="pt-1 text-xs text-zinc-600">
        Ranked by starter strength — the combined weekly scoring of the players who fill each
        lineup slot (Flex = your best 2 skill players behind your RB/WR/TE starters). Every
        player&rsquo;s stats come from their real games, scored in your league&rsquo;s rules.
        4+ games to be ranked.
      </p>
    </div>
  );
}

function RoomCard({
  room,
  open,
  toggle,
  leagueId,
}: {
  room: PositionRoom;
  open: Set<string>;
  toggle: (k: string) => void;
  leagueId: string;
}) {
  const total = room.teams.length;
  // Shared box-plot scale across the whole card, for comparability.
  const scaleMax = Math.max(
    20,
    ...room.teams.flatMap((t) => t.players.map((p) => p.max))
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="flex items-baseline justify-between border-b border-zinc-800 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
          {room.label}
          <span className="ml-1.5 text-zinc-600">
            · {room.startersN} starter{room.startersN === 1 ? "" : "s"}
          </span>
        </h3>
        <span className="flex gap-3 text-[10px] uppercase tracking-wide">
          <span className="text-emerald-500/80">Starters</span>
          <span className="text-sky-500/80">Bench</span>
        </span>
      </div>
      <div>
        {room.teams.map((t, i) => (
          <TeamRow
            key={t.rosterId}
            t={t}
            rank={i + 1}
            total={total}
            scaleMax={scaleMax}
            leagueId={leagueId}
            expanded={open.has(`${room.position}-${t.rosterId}`)}
            onToggle={() => toggle(`${room.position}-${t.rosterId}`)}
          />
        ))}
      </div>
    </div>
  );
}

function placementColor(p: number | null, total: number) {
  if (p == null) return "text-zinc-600";
  const third = Math.ceil(total / 3);
  if (p <= third) return "text-emerald-400";
  if (p > total - third) return "text-red-400";
  return "text-zinc-300";
}
function barFill(p: number | null, total: number) {
  if (p == null) return 0;
  return Math.max(3, ((total - p + 1) / total) * 100);
}

function TeamRow({
  t,
  rank,
  total,
  scaleMax,
  leagueId,
  expanded,
  onToggle,
}: {
  t: RoomTeam;
  rank: number;
  total: number;
  scaleMax: number;
  leagueId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`border-t border-zinc-800/60 ${t.isMe ? "bg-sky-950/20 ring-1 ring-inset ring-sky-900/50" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-800/40">
        <span className="w-5 shrink-0 text-center text-xs font-semibold text-zinc-500">{rank}</span>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
          {t.logo && (
            <img src={t.logo} alt="" className="h-7 w-7 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 truncate text-sm font-medium text-white">{t.handle}</div>
          <div className="flex flex-col gap-1">
            <PlaceBar label="ST" placement={t.starterPlacement} total={total} barClass="bg-emerald-500/70" />
            <PlaceBar label="BN" placement={t.benchPlacement} total={total} barClass="bg-sky-500/60" count={t.benchCount} />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-1 px-4 pb-3">
          {t.players.length === 0 ? (
            <p className="text-xs text-zinc-600">No qualifying producers.</p>
          ) : (
            t.players.map((p) => <PlayerBox key={p.id} p={p} scaleMax={scaleMax} leagueId={leagueId} />)
          )}
        </div>
      )}
    </div>
  );
}

function PlaceBar({
  label,
  placement,
  total,
  barClass,
  count,
}: {
  label: string;
  placement: number | null;
  total: number;
  barClass: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 shrink-0 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${barFill(placement, total)}%` }} />
      </div>
      <span className={`w-16 shrink-0 text-right text-xs font-semibold ${placementColor(placement, total)}`}>
        {placement ? ord(placement) : "—"}
        {count != null && placement != null && <span className="text-zinc-600"> ·{count}</span>}
      </span>
    </div>
  );
}

// Box-and-whisker of a player's weekly scores, on a shared 0..scaleMax axis.
function PlayerBox({ p, scaleMax, leagueId }: { p: RoomPlayer; scaleMax: number; leagueId: string }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100))}%`;
  const small = p.gp < 4;
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-zinc-800/40">
      <span
        className={`w-6 shrink-0 rounded py-0.5 text-center text-[10px] font-semibold ${
          p.isStarter ? "bg-emerald-950/60 text-emerald-400" : "bg-zinc-800 text-zinc-500"
        }`}
      >
        {p.posRank}
      </span>
      <Link href={`/league/${leagueId}/player/${p.id}`} className="w-28 shrink-0 truncate text-xs text-zinc-300 hover:text-white">
        {p.name}
        <span className="block text-[10px] text-zinc-600">
          {p.team ?? "FA"} · {p.gp} gp{small && " ·small"}
        </span>
      </Link>

      <div className="relative h-6 flex-1">
        {[0.25, 0.5, 0.75].map((f) => (
          <div key={f} className="absolute top-0 bottom-0 w-px bg-zinc-800" style={{ left: `${f * 100}%` }} />
        ))}
        <div className="absolute top-1/2 h-px -translate-y-1/2 bg-zinc-600" style={{ left: pct(p.min), width: `calc(${pct(p.max)} - ${pct(p.min)})` }} />
        <div
          className={`absolute top-1/2 h-3.5 -translate-y-1/2 rounded border ${
            p.isStarter ? "border-emerald-800 bg-emerald-500/25" : "border-sky-900 bg-sky-500/20"
          }`}
          style={{ left: pct(p.q1), width: `calc(${pct(p.q3)} - ${pct(p.q1)})` }}
        />
        <div className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-zinc-100" style={{ left: pct(p.median) }} title={`median ${p.median}`} />
        <div
          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white bg-zinc-900"
          style={{ left: pct(p.mean) }}
          title={`average ${p.mean}`}
        />
      </div>

      <span className="w-16 shrink-0 text-right text-xs">
        <span className="font-semibold text-white">{p.mean.toFixed(1)}</span>
        <span className="text-zinc-600"> avg</span>
        <span className="block text-[10px] text-zinc-500">med {p.median.toFixed(1)}</span>
      </span>
    </div>
  );
}
