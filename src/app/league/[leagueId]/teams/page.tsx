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
  const [lastSeason, setLastSeason] = useState<string | null>(null);
  const [members, setMembers] = useState({ on: 0, total: 0 });
  const [profiles, setProfiles] = useState<Map<number, TradeProfile>>(new Map());

  useEffect(() => {
    let alive = true;
    async function load() {
      const { cards, lastSeason } = await loadTeamCards(leagueId);
      if (!alive) return;
      const others = cards
        .filter((c) => !c.isMe)
        .sort((a, b) => (a.lastRank ?? 99) - (b.lastRank ?? 99));
      setRivals(others);
      setMembers({
        on: cards.filter((c) => c.isMember).length,
        total: cards.length,
      });
      setLastSeason(lastSeason);
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
        {lastSeason ? (
          <p className="text-xs text-zinc-500">Ranked by {lastSeason} finish</p>
        ) : (
          <span />
        )}
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
}: {
  t: TeamCard;
  profile?: TradeProfile;
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
  const h2hSub =
    h2hGames === 0
      ? ""
      : h2h!.regW > h2h!.regL
      ? "you lead"
      : h2h!.regL > h2h!.regW
      ? "you trail"
      : "even";

  return (
    <Link
      href={`teams/${t.rosterId}`}
      className="block rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-emerald-800/60 hover:bg-zinc-800/40"
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
      </div>

      {/* Quick-hitter stats */}
      <div className="mt-3.5 grid grid-cols-3 gap-2">
        <StatTile label="All-Time" value={`${allW}-${allL}`} sub={winPct(allW, allL)} />
        <StatTile label="This Yr" value={`${t.currentW}-${t.currentL}`} />
        <StatTile
          label="Vs You"
          value={h2hGames ? `${h2h!.regW}-${h2h!.regL}` : "—"}
          valueClass={h2hColor}
          sub={h2hSub}
        />
      </div>

      {/* Positional needs & strengths — the trade-scouting read */}
      <NeedsStrengths profile={profile} className="mt-3.5" />

      {/* Trophy case */}
      <div className="mt-3.5 flex items-center gap-2 border-t border-zinc-800/70 pt-3 text-[13px]">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
          Trophies
        </span>
        <TrophyCase rings={t.rings} silver={t.silver} bronze={t.bronze} />
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
  rings,
  silver,
  bronze,
}: {
  rings: number;
  silver: number;
  bronze: number;
}) {
  const parts: React.ReactNode[] = [];
  if (rings > 0)
    parts.push(
      <span key="c">
        🏆 <b className="font-bold text-white">{rings}×</b>{" "}
        <span className="text-zinc-400">Champion</span>
      </span>
    );
  if (silver > 0)
    parts.push(
      <span key="s">
        🥈 <b className="font-bold text-white">{silver}×</b>{" "}
        <span className="text-zinc-400">Runner-up</span>
      </span>
    );
  if (bronze > 0)
    parts.push(
      <span key="b">
        🥉 <b className="font-bold text-white">{bronze}×</b>{" "}
        <span className="text-zinc-400">Third</span>
      </span>
    );

  if (!parts.length)
    return <span className="text-zinc-600">No hardware yet</span>;

  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && <span className="mr-1.5 text-zinc-700">·</span>}
          {p}
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
