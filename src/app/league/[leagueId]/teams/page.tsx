"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { loadTeamCards, type TeamCard } from "./teamData";
import { getRoomStrength } from "@/lib/roomStrength";
import { computeTradeProfiles, type TradeProfile } from "./tradeProfile";
import { NeedsStrengths } from "./NeedsStrengths";

export default function RivalsTab() {
  const params = useParams();
  const leagueId = params.leagueId as string;

  const [loading, setLoading] = useState(true);
  const [rivals, setRivals] = useState<TeamCard[]>([]);
  const [currentSeason, setCurrentSeason] = useState<string | null>(null);
  const [members, setMembers] = useState({ on: 0, total: 0 });
  const [profiles, setProfiles] = useState<Map<number, TradeProfile>>(new Map());

  useEffect(() => {
    let alive = true;
    async function load() {
      const { cards, currentSeason } = await loadTeamCards(leagueId);
      if (!alive) return;
      // Most decorated first: best final placement, then trophy counts, then
      // last season's rank as a final tiebreak.
      const others = cards
        .filter((c) => !c.isMe)
        .sort(
          (a, b) =>
            (a.bestFinish ?? 999) - (b.bestFinish ?? 999) ||
            b.rings - a.rings ||
            b.silver - a.silver ||
            b.bronze - a.bronze ||
            (a.lastRank ?? 99) - (b.lastRank ?? 99)
        );
      setRivals(others);
      setMembers({
        on: cards.filter((c) => c.isMember).length,
        total: cards.length,
      });
      setCurrentSeason(currentSeason);
      setLoading(false);

      // Positional needs/strengths ride on the (cached) room-strength data.
      const { rooms } = await getRoomStrength(leagueId);
      if (alive) setProfiles(computeTradeProfiles(rooms));
    }
    load();
    return () => {
      alive = false;
    };
  }, [leagueId]);

  if (loading) {
    return <p className="py-10 text-center text-zinc-400">Loading rivals…</p>;
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-zinc-500">Ranked by best finish</p>
        <p className="text-xs text-zinc-500">
          <span className="font-semibold text-emerald-400">{members.on}</span>{" "}
          of {members.total} managers on the app
        </p>
      </div>

      <div className="space-y-3">
        {rivals.map((t) => (
          <RivalCard
            key={t.rosterId}
            t={t}
            profile={profiles.get(t.rosterId)}
            currentSeason={currentSeason}
          />
        ))}
      </div>
    </>
  );
}

// A roomy, at-a-glance scouting card — quick stats, positional needs &
// strengths (for trades), and the trophy case. Tapping opens the detail view.
function RivalCard({
  t,
  profile,
  currentSeason,
}: {
  t: TeamCard;
  profile?: TradeProfile;
  currentSeason: string | null;
}) {
  const allW = t.dynastyW + t.playoffW;
  const allL = t.dynastyL + t.playoffL;

  const h2h = t.h2h;
  const h2hGames = h2h ? h2h.regW + h2h.regL + h2h.regT : 0;
  const h2hColor =
    h2h && h2h.regW > h2h.regL
      ? "text-emerald-400"
      : h2h && h2h.regL > h2h.regW
      ? "text-red-400"
      : "text-white";

  return (
    <Link
      href={`teams/${t.rosterId}`}
      className="group block rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-emerald-800/60 hover:bg-zinc-800/40"
    >
      {/* Identity */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
          {t.logo && (
            <img
              src={t.logo}
              alt=""
              className="h-12 w-12 object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[17px] font-bold text-white">
              {t.handle}
            </span>
            {t.isMember && (
              <span className="shrink-0 rounded-full border border-emerald-800 bg-emerald-950/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                ● Member
              </span>
            )}
            {t.newOwner && (
              <span className="shrink-0 rounded-full border border-amber-900 bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                New
              </span>
            )}
          </div>
          <div className="truncate text-[13px] text-zinc-500">{t.teamName}</div>
        </div>
        <span
          aria-hidden
          className="shrink-0 self-center text-2xl leading-none text-zinc-700 transition-colors group-hover:text-emerald-400"
        >
          ›
        </span>
      </div>

      {/* Quick-hitter stats */}
      <div className="mt-3.5 grid grid-cols-3 gap-2">
        <StatTile label="All-Time" value={`${allW}-${allL}`} sub={winPct(allW, allL)} />
        <StatTile
          label={currentSeason ?? "This Yr"}
          value={`${t.currentW}-${t.currentL}`}
        />
        <StatTile
          label="H2H"
          value={h2hGames ? `${h2h!.regW}-${h2h!.regL}` : "—"}
          valueClass={h2hColor}
        />
      </div>

      {/* Positional needs & strengths — the trade-scouting read */}
      <NeedsStrengths profile={profile} className="mt-3.5" />

      {/* Trophy case */}
      <div className="mt-3.5 flex items-start gap-2 border-t border-zinc-800/70 pt-3 text-[13px]">
        <span className="mt-0.5 shrink-0 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
          Trophies
        </span>
        <TrophyCase medals={t.medalSeasons} />
      </div>

      {/* Tap-in call to action */}
      <div className="mt-3 flex items-center justify-between border-t border-zinc-800/70 pt-2.5">
        <span className="text-[11px] text-zinc-500">
          Roster · positions · full H2H history
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
          Open <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}

function StatTile({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-950/55 py-2.5 text-center">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-bold leading-none ${valueClass ?? "text-white"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[10px] text-zinc-600">{sub}</div>}
    </div>
  );
}

function TrophyCase({
  medals,
}: {
  medals: { g: string[]; s: string[]; b: string[] };
}) {
  const rows = [
    { emoji: "🏆", label: "Champion", years: medals.g },
    { emoji: "🥈", label: "Runner-up", years: medals.s },
    { emoji: "🥉", label: "Third", years: medals.b },
  ].filter((r) => r.years.length > 0);

  if (!rows.length)
    return <span className="text-zinc-600">No hardware yet</span>;

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {rows.map((r) => (
        <span key={r.label} className="inline-flex items-center gap-1.5">
          <span>{r.emoji}</span>
          <span className="text-zinc-400">{r.label}</span>
          <span className="font-semibold text-white">{r.years.join(", ")}</span>
        </span>
      ))}
    </span>
  );
}

// Win percentage as ".643" (drops the leading zero, fantasy convention).
function winPct(w: number, l: number): string {
  const g = w + l;
  if (!g) return "—";
  return (w / g).toFixed(3).replace(/^0/, "");
}
