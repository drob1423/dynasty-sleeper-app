"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getSeasonChain,
  getPlayerMap,
  type PlayerInfo,
} from "@/lib/sleeper";
import {
  getPlayerProfile,
  type PlayerProfile,
  type OwnerStint,
} from "@/lib/playerProfile";
import { PlayerTimeline } from "./PlayerTimeline";

// Owner colors for the timeline + ownership band (avoids green/red, which mean
// started/benched).
const OWNER_COLORS = [
  "#f59e0b",
  "#a78bfa",
  "#38bdf8",
  "#f472b6",
  "#fb923c",
  "#22d3ee",
];

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const playerId = params.playerId as string;

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<PlayerInfo | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [scoringFormat, setScoringFormat] = useState<string>("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const [chain, players] = await Promise.all([
        getSeasonChain(leagueId),
        getPlayerMap(),
      ]);
      setScoringFormat(chain[0]?.scoringFormat ?? "");
      const pInfo = players[playerId] ?? null;
      setInfo(pInfo);
      const prof = await getPlayerProfile(
        chain,
        playerId,
        pInfo?.fantasyPositions ?? (pInfo?.position ? [pInfo.position] : [])
      );
      setProfile(prof);
      setLoading(false);
    }
    load();
  }, [leagueId, playerId, router]);

  if (loading) {
    return <p className="py-10 text-center text-zinc-400">Building profile…</p>;
  }

  const name = info?.name ?? `Player ${playerId}`;
  const isDef = info?.position === "DEF";
  const photo =
    isDef && info?.team
      ? `https://sleepercdn.com/images/team_logos/nfl/${info.team.toLowerCase()}.png`
      : `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`;

  const stints = profile?.stints ?? [];
  const colorByOwner: Record<string, string> = {};
  stints.forEach((s, i) => {
    colorByOwner[s.ownerId] = OWNER_COLORS[i % OWNER_COLORS.length];
  });

  // Season groups for the axis labels (preserve chronological order).
  const seasonGroups: { season: string; count: number }[] = [];
  (profile?.timeline ?? []).forEach((t) => {
    const last = seasonGroups[seasonGroups.length - 1];
    if (last && last.season === t.seasonLabel) last.count += 1;
    else seasonGroups.push({ season: t.seasonLabel, count: 1 });
  });

  const hasData = (profile?.timeline.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.back()}
        className="text-sm text-zinc-500 hover:text-zinc-300"
      >
        ← Back
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
          <img
            src={photo}
            alt=""
            className={isDef ? "h-9 w-9 object-contain" : "h-14 w-14 object-cover"}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-white">{name}</h1>
          <p className="text-sm text-zinc-500">
            {info?.position ?? "?"}
            {info?.team && ` · ${info.team}`}
            {info?.age != null && ` · ${info.age} yrs`}
            {info?.yearsExp != null &&
              ` · ${info.yearsExp === 0 ? "Rookie" : `${info.yearsExp} exp`}`}
          </p>
        </div>
        {profile && (
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
              In-league
            </div>
            <div className="text-sm font-medium text-white">
              {profile.ownerCount} owner{profile.ownerCount !== 1 && "s"} ·{" "}
              {profile.totalRosteredPts.toFixed(0)} pts
            </div>
            {scoringFormat && (
              <div className="text-[11px] text-zinc-500">{scoringFormat}</div>
            )}
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
          No games played yet for this player in the league.
        </div>
      ) : (
        <>
          {/* Timeline */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-2 flex justify-between text-[11px] uppercase tracking-wide text-zinc-500">
              <span>Points per game</span>
              <span>
                <span
                  style={{ background: "rgba(52,211,153,0.5)" }}
                  className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                />
                started
                <span
                  style={{ background: "rgba(248,113,113,0.55)" }}
                  className="ml-2 mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                />
                benched
              </span>
            </div>
            <PlayerTimeline
              timeline={profile!.timeline}
              colorByOwner={colorByOwner}
            />
            {/* Ownership band */}
            <div className="mt-2 flex gap-1 pl-[26px]">
              {stints.map((s) => (
                <div
                  key={s.ownerId}
                  style={{
                    flexGrow: s.rosteredGames,
                    borderColor: colorByOwner[s.ownerId],
                  }}
                  className="min-w-0 overflow-hidden rounded-md border px-2 py-1"
                >
                  <span
                    className="block truncate text-[11px] font-medium"
                    style={{ color: colorByOwner[s.ownerId] }}
                  >
                    {s.name}
                  </span>
                </div>
              ))}
            </div>
            {/* Season labels */}
            <div className="mt-1 flex pl-[26px] text-[11px] text-zinc-600">
              {seasonGroups.map((g, i) => (
                <div key={i} style={{ flexGrow: g.count }} className="text-center">
                  {g.season}
                </div>
              ))}
            </div>
          </div>

          {/* Per-manager cards */}
          <div className="space-y-3">
            {stints.map((s) => (
              <StintCard
                key={s.ownerId}
                stint={s}
                color={colorByOwner[s.ownerId]}
              />
            ))}
          </div>

          <p className="text-xs text-zinc-600">
            All points use this league&apos;s scoring. In-league pts = everything
            he scored while rostered (started + benched). Pts benched = points
            scored on the bench · Cost you = marginal points lost (weeks he&apos;d
            have outscored the lineup guy he replaced). Regular season only.
          </p>
        </>
      )}
    </div>
  );
}

function StintCard({ stint, color }: { stint: OwnerStint; color: string }) {
  const s = stint;
  return (
    <div
      className="rounded-2xl border bg-zinc-900 p-4"
      style={{
        borderColor: s.isCurrent ? "#059669" : "#27272a",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="h-4 w-4 shrink-0 rounded-full"
            style={{ background: color }}
          />
          <span className="truncate font-medium text-white">{s.name}</span>
          <span className="shrink-0 text-xs text-zinc-500">@{s.handle}</span>
          <span className="shrink-0 text-xs text-zinc-600">
            {s.firstLabel} – {s.isCurrent ? "now" : s.lastLabel}
          </span>
        </div>
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[11px] uppercase",
            s.isCurrent
              ? "bg-emerald-950 text-emerald-400"
              : "bg-zinc-800 text-zinc-400",
          ].join(" ")}
        >
          {s.isCurrent ? "Current" : "Former"}
        </span>
      </div>
      <div className="mb-3 text-xs text-zinc-400">
        <span className="text-zinc-600">Acquired:</span> {s.acquisition}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat
          label="Start rate"
          value={`${Math.round(s.startRate * 100)}%`}
          color={
            s.startRate >= 0.6
              ? "text-emerald-400"
              : s.startRate < 0.35
              ? "text-red-400"
              : "text-white"
          }
          sub={`${s.startedGames}/${s.rosteredGames}`}
        />
        <Stat label="Rec started" value={`${s.recStartedW}-${s.recStartedL}`} />
        <Stat label="PPG" value={s.ppgStarted.toFixed(1)} />
        <Stat label="Pts benched" value={s.rawBenchPts.toFixed(0)} />
        <Stat
          label="Cost you"
          value={s.marginalBenchPts.toFixed(0)}
          color={s.marginalBenchPts >= 20 ? "text-red-400" : "text-white"}
          sub={
            s.shouldHaveStarted > 0
              ? `${s.shouldHaveStarted} bad sit${s.shouldHaveStarted !== 1 ? "s" : ""}`
              : "—"
          }
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-950/60 p-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`text-base font-semibold ${color ?? "text-white"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-zinc-600">{sub}</div>}
    </div>
  );
}
