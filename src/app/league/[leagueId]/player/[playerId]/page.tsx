"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getSeasonChain,
  getPlayerMap,
  getFullRosters,
  type PlayerInfo,
} from "@/lib/sleeper";
import {
  getPlayerProfile,
  type PlayerProfile,
  type OwnerStint,
} from "@/lib/playerProfile";
import { getCachedPlayerStats, type PlayerStat } from "@/lib/roomStrength";
import { teamColor, teamLogoUrl } from "@/lib/nflTeams";
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
  const [playerMap, setPlayerMap] = useState<Record<string, PlayerInfo>>({});
  const [pstat, setPstat] = useState<PlayerStat | null>(null);
  const [tab, setTab] = useState("overview");
  const [heat, setHeat] = useState<number | null>(null); // 0 (worst) .. 1 (best) at position
  const [rankLabel, setRankLabel] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const [chain, players, cachedStats, rosters] = await Promise.all([
        getSeasonChain(leagueId),
        getPlayerMap(),
        getCachedPlayerStats(leagueId),
        getFullRosters(leagueId),
      ]);
      setScoringFormat(chain[0]?.scoringFormat ?? "");
      setPlayerMap(players);
      const stat = cachedStats?.[playerId] ?? null;
      setPstat(stat);

      // Heat = where this PPG ranks among rostered players at his position.
      // Qualified peers (4+ games) form the pool; the viewed player is always
      // slotted in by his PPG even on a small sample.
      const pos = players[playerId]?.position;
      if (stat && pos && cachedStats && stat.gp >= 1) {
        const pool = rosters
          .flatMap((r) => r.players ?? [])
          .filter(
            (pid) =>
              players[pid]?.position === pos &&
              ((cachedStats[pid]?.gp ?? 0) >= 4 || pid === playerId)
          )
          .map((pid) => cachedStats[pid].mean);
        const better = pool.filter((v) => v > stat.mean).length; // 0 = best
        setHeat(pool.length > 1 ? 1 - better / (pool.length - 1) : 0.5);
        setRankLabel(`${pos}${better + 1} of ${pool.length}`);
      } else {
        setHeat(null);
        setRankLabel("");
      }
      const pInfo = players[playerId] ?? null;
      setInfo(pInfo);
      const prof = await getPlayerProfile(
        chain,
        playerId,
        pInfo?.fantasyPositions ?? (pInfo?.position ? [pInfo.position] : []),
        players
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

  const tabs: { key: string; label: string }[] = [
    { key: "overview", label: "Overview" },
  ];
  if (pstat?.log?.length) tabs.push({ key: "log", label: "Game Log" });
  if (hasData) tabs.push({ key: "league", label: "In League" });
  const active = tabs.some((t) => t.key === tab) ? tab : "overview";

  const acc = posAccent(info?.position);
  const tc = teamColor(info?.team);

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Back
      </button>

      {/* Header banner */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        {/* team-color gradient */}
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(105deg, ${tc} 0%, ${tc}55 26%, transparent 62%)` }}
        />
        {/* big team logo watermark, darkened behind the name */}
        {info?.team && (
          <img
            src={teamLogoUrl(info.team)}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 top-1/2 h-56 w-56 -translate-y-1/2 object-contain opacity-[0.18] brightness-90 saturate-150"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        )}
        {/* legibility darkening */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/70 via-zinc-900/30 to-transparent" />

        <div className="relative flex items-center gap-4 p-5">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 ring-2 ring-zinc-700">
            <img
              src={photo}
              alt=""
              className={isDef ? "h-14 w-14 object-contain" : "h-24 w-24 object-cover"}
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${acc.badge}`}>
                {info?.position ?? "?"}
              </span>
              {info?.team && <span className="text-xs font-medium text-zinc-400">{info.team}</span>}
            </div>
            <h1 className="mt-1 truncate text-2xl font-bold text-white">{name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {info?.age != null && <MetaPill>{info.age} yrs</MetaPill>}
              {info?.yearsExp != null && (
                <MetaPill>{info.yearsExp === 0 ? "Rookie" : `${info.yearsExp} yr exp`}</MetaPill>
              )}
              {profile && profile.ownerCount > 0 && (
                <MetaPill>
                  {profile.ownerCount} owner{profile.ownerCount !== 1 ? "s" : ""} in league
                </MetaPill>
              )}
            </div>
          </div>
          {pstat && (
            <RatingBadge ppg={pstat.mean} heat={heat} rankLabel={rankLabel} small={pstat.gp < 10} />
          )}
        </div>
        {pstat && (
          <div className="relative grid grid-cols-4 divide-x divide-zinc-800 border-t border-zinc-800 bg-zinc-900/60 text-center">
            <HeaderStat label="Games" value={`${pstat.gp}`} />
            <HeaderStat label="Median" value={pstat.median.toFixed(1)} />
            <HeaderStat label="Floor" value={pstat.min.toFixed(1)} />
            <HeaderStat label="Ceiling" value={pstat.max.toFixed(1)} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active === t.key
                ? "border-emerald-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {active === "overview" &&
        (pstat ? (
          <ProductionCard stat={pstat} scoringFormat={scoringFormat} />
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
            No games on record for this player yet.
          </div>
        ))}

      {/* Game Log */}
      {active === "log" && pstat?.log && <GameLogTab log={pstat.log} />}

      {/* In League */}
      {active === "league" && hasData && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-2 flex justify-between text-[11px] uppercase tracking-wide text-zinc-500">
              <span>Points per game — in your league</span>
              <span>
                <span style={{ background: "rgba(52,211,153,0.5)" }} className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" />
                started
                <span style={{ background: "rgba(248,113,113,0.55)" }} className="ml-2 mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" />
                benched
              </span>
            </div>
            <PlayerTimeline timeline={profile!.timeline} colorByOwner={colorByOwner} />
            <div className="mt-2 flex gap-1 pl-[26px]">
              {stints.map((s) => (
                <div
                  key={s.ownerId}
                  style={{ flexGrow: s.rosteredGames, borderColor: colorByOwner[s.ownerId] }}
                  className="min-w-0 overflow-hidden rounded-md border px-2 py-1"
                >
                  <span className="block truncate text-[11px] font-medium" style={{ color: colorByOwner[s.ownerId] }}>
                    {s.name}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1 flex pl-[26px] text-[11px] text-zinc-600">
              {seasonGroups.map((g, i) => (
                <div key={i} style={{ flexGrow: g.count }} className="text-center">
                  {g.season}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {stints.map((s) => (
              <StintCard key={s.ownerId} stint={s} color={colorByOwner[s.ownerId]} players={playerMap} />
            ))}
          </div>

          <p className="text-xs text-zinc-600">
            In-league only. Pts benched = points scored on the bench · Cost you = marginal points
            lost (weeks he&apos;d have outscored the lineup guy he replaced). Regular season only.
          </p>
        </div>
      )}
    </div>
  );
}

function posAccent(pos?: string | null): { badge: string; wash: string } {
  switch (pos) {
    case "QB": return { badge: "border-rose-500/40 bg-rose-500/15 text-rose-300", wash: "bg-gradient-to-r from-rose-500/10 to-transparent" };
    case "RB": return { badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300", wash: "bg-gradient-to-r from-emerald-500/10 to-transparent" };
    case "WR": return { badge: "border-sky-500/40 bg-sky-500/15 text-sky-300", wash: "bg-gradient-to-r from-sky-500/10 to-transparent" };
    case "TE": return { badge: "border-amber-500/40 bg-amber-500/15 text-amber-300", wash: "bg-gradient-to-r from-amber-500/10 to-transparent" };
    default: return { badge: "border-zinc-600 bg-zinc-700/30 text-zinc-300", wash: "" };
  }
}

// Madden-style PPG rating: a gauge arc filled by rank at position, colored
// green (best at his spot in the league) through yellow to red (worst).
function heatColor(heat: number): string {
  return `hsl(${Math.round(heat * 130)}, 68%, ${48 - heat * 8}%)`; // 0 = red, 1 = dark green
}

function RatingBadge({
  ppg,
  heat,
  rankLabel,
  small,
}: {
  ppg: number;
  heat: number | null;
  rankLabel: string;
  small?: boolean;
}) {
  const frac = heat ?? 0;
  const color = heat == null ? "#52525b" : heatColor(heat);
  const R = 42;
  const C = 2 * Math.PI * R;
  const ARC = 0.75 * C; // 270° gauge, gap at the bottom
  return (
    <div className="shrink-0 text-center">
      <div className="relative h-[72px] w-[72px]">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <circle
            cx="50" cy="50" r={R} fill="none" stroke="#3f3f46" strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${ARC} ${C - ARC}`}
            transform="rotate(135 50 50)"
          />
          <circle
            cx="50" cy="50" r={R} fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${frac * ARC} ${C}`}
            transform="rotate(135 50 50)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold leading-none text-white">{ppg.toFixed(1)}</span>
          <span className="text-[8px] font-semibold uppercase tracking-wider text-zinc-500">ppg</span>
        </div>
      </div>
      {rankLabel && (
        <div className="mt-1.5 flex flex-col items-center gap-0.5">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white ring-1 ring-white/15"
            style={{ backgroundColor: heat == null ? "rgba(255,255,255,0.1)" : `${heatColor(heat)}40` }}
          >
            {rankLabel}
          </span>
          {small && (
            <span className="text-[9px] uppercase tracking-wide text-amber-400/80">small sample</span>
          )}
        </div>
      )}
    </div>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-medium text-zinc-200 ring-1 ring-white/10 backdrop-blur-sm">
      {children}
    </span>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5">
      <div className="text-base font-bold tabular-nums text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}

// Chronological weekly points, most recent first, grouped by season.
function GameLogTab({ log }: { log: [number, number, number][] }) {
  const max = Math.max(1, ...log.map((x) => x[2]));
  const rows = [...log].reverse();
  let lastSeason: number | null = null;
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {rows.map(([yy, wk, pts], i) => {
        const header = yy !== lastSeason ? (lastSeason = yy) : null;
        return (
          <div key={i}>
            {header !== null && (
              <div className="border-t border-zinc-800 bg-zinc-950/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                20{yy} season
              </div>
            )}
            <div className="flex items-center gap-3 border-t border-zinc-800/50 px-4 py-2">
              <span className="w-12 shrink-0 text-xs text-zinc-500">Wk {wk}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-emerald-500/50" style={{ width: `${Math.max(2, (pts / max) * 100)}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-white">
                {pts.toFixed(1)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// A player's real weekly-scoring distribution, from cached game logs.
function ProductionCard({ stat, scoringFormat }: { stat: PlayerStat; scoringFormat: string }) {
  const scaleMax = Math.max(30, Math.ceil(stat.max / 10) * 10);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100))}%`;
  const ticks: number[] = [];
  for (let v = 0; v <= scaleMax; v += 10) ticks.push(v);
  const small = stat.gp < 4;
  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-wide text-zinc-500">
        <span>Weekly scoring · his real games</span>
        <span>
          {stat.gp} game{stat.gp !== 1 && "s"}
          {small && " · small sample"}
          {scoringFormat && ` · ${scoringFormat}`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat label="Average" value={stat.mean.toFixed(1)} />
        <Stat label="Median" value={stat.median.toFixed(1)} sub="typical week" />
        <Stat label="Floor" value={stat.min.toFixed(1)} sub="worst" />
        <Stat label="Ceiling" value={stat.max.toFixed(1)} sub="best" />
        <Stat label="Middle 50%" value={`${stat.q1.toFixed(1)}–${stat.q3.toFixed(1)}`} />
      </div>

      {/* axis */}
      <div className="relative h-3 text-[9px] text-zinc-600">
        {ticks.map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: pct(v) }}>
            {v}
          </span>
        ))}
        <span className="absolute right-0 -translate-y-0.5 text-zinc-700">pts/wk</span>
      </div>
      {/* box-and-whisker */}
      <div className="relative h-12">
        {ticks.map((v) => (
          <div key={v} className="absolute top-3 bottom-0 w-px bg-zinc-800/70" style={{ left: pct(v) }} />
        ))}
        <div className="absolute top-[calc(50%+6px)] h-px -translate-y-1/2 bg-zinc-600" style={{ left: pct(stat.min), width: `calc(${pct(stat.max)} - ${pct(stat.min)})` }} />
        <div className="absolute top-[calc(50%+6px)] h-5 -translate-y-1/2 rounded border border-emerald-700/70 bg-emerald-500/15" style={{ left: pct(stat.q1), width: `calc(${pct(stat.q3)} - ${pct(stat.q1)})` }} />
        <div className="absolute top-[calc(50%+6px)] h-6 w-0.5 -translate-y-1/2 bg-zinc-100" style={{ left: pct(stat.median) }} title={`median ${stat.median}`} />
        <div className="absolute top-[calc(50%+6px)] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white bg-zinc-900" style={{ left: pct(stat.mean) }} title={`average ${stat.mean}`} />
        <span className="absolute top-0 -translate-x-1/2 text-[9px] tabular-nums text-zinc-500" style={{ left: pct(stat.min) }}>{stat.min.toFixed(1)}</span>
        <span className="absolute top-0 -translate-x-1/2 text-[9px] tabular-nums text-zinc-400" style={{ left: pct((stat.q1 + stat.q3) / 2) }}>{stat.q1.toFixed(1)}–{stat.q3.toFixed(1)}</span>
        <span className="absolute top-0 -translate-x-1/2 text-[9px] tabular-nums text-zinc-500" style={{ left: pct(stat.max) }}>{stat.max.toFixed(1)}</span>
      </div>
      <p className="text-[11px] text-zinc-600">
        Box = middle 50% of weeks · white line = median (typical week) · ◆ = average · whiskers =
        worst → best. All scored in your league&rsquo;s rules.
      </p>
    </div>
  );
}

function StintCard({
  stint,
  color,
  players,
}: {
  stint: OwnerStint;
  color: string;
  players: Record<string, PlayerInfo>;
}) {
  const s = stint;
  const [showSits, setShowSits] = useState(false);
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
          value={
            s.marginalBenchPts > 0 ? `-${s.marginalBenchPts.toFixed(0)}` : "0"
          }
          color={s.marginalBenchPts > 0 ? "text-red-400" : "text-white"}
          sub={
            s.shouldHaveStarted > 0
              ? `${s.shouldHaveStarted} bad sit${s.shouldHaveStarted !== 1 ? "s" : ""}`
              : "—"
          }
        />
      </div>

      {s.badSits.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowSits((v) => !v)}
            className="text-xs font-medium text-red-400 hover:text-red-300"
          >
            {showSits ? "Hide" : "Show"} the {s.badSits.length} bad sit
            {s.badSits.length !== 1 ? "s" : ""}
          </button>
          {showSits && (
            <div className="mt-2 space-y-1.5">
              {s.badSits
                .slice()
                .sort((a, b) => b.gain - a.gain)
                .map((b, i) => {
                  const won = b.myScore > b.oppScore;
                  const lost = b.myScore < b.oppScore;
                  return (
                    <div
                      key={i}
                      className="rounded-lg bg-zinc-950/60 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-zinc-300">
                          Wk {b.week} &rsquo;{b.seasonLabel.slice(2)} · vs @
                          {b.oppHandle || b.oppName}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span
                            className={[
                              "flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-black",
                              won ? "bg-emerald-500" : lost ? "bg-red-500" : "bg-zinc-500",
                            ].join(" ")}
                          >
                            {won ? "W" : lost ? "L" : "T"}
                          </span>
                          <span className="text-zinc-400">
                            {b.myScore.toFixed(1)}–{b.oppScore.toFixed(1)}
                          </span>
                          {b.wouldHaveWon && (
                            <span className="rounded bg-emerald-950 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">
                              Would&rsquo;ve won
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-zinc-500">
                          started{" "}
                          {b.replacedId
                            ? players[b.replacedId]?.name ?? "a starter"
                            : "a starter"}{" "}
                          ({b.replacedPts.toFixed(1)}) over him (
                          {b.playerPts.toFixed(1)})
                        </span>
                        <span className="ml-2 shrink-0 font-semibold text-red-400">
                          -{b.gain.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
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
