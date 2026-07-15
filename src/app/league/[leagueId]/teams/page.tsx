"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { loadTeamCards, type TeamCard } from "./teamData";
import { TeamStatsBody, medalEmoji, ordinal } from "./TeamScoreCard";

export default function RivalsTab() {
  const params = useParams();
  const leagueId = params.leagueId as string;

  const [loading, setLoading] = useState(true);
  const [rivals, setRivals] = useState<TeamCard[]>([]);
  const [lastSeason, setLastSeason] = useState<string | null>(null);
  const [members, setMembers] = useState({ on: 0, total: 0 });
  // rosterIds whose full scorecard is expanded (multiple may be open).
  const [open, setOpen] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function load() {
      const { cards, lastSeason } = await loadTeamCards(leagueId);
      // Rivals = everyone but you, sorted by last-season finish.
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
    }
    load();
  }, [leagueId]);

  function toggle(rosterId: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(rosterId)) next.delete(rosterId);
      else next.add(rosterId);
      return next;
    });
  }

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

      <div className="space-y-2">
        {rivals.map((t) => (
          <RivalRow
            key={t.rosterId}
            t={t}
            leagueId={leagueId}
            expanded={open.has(t.rosterId)}
            onToggle={() => toggle(t.rosterId)}
          />
        ))}
      </div>
    </>
  );
}

// A compact, scannable row that expands to the full scorecard on tap.
function RivalRow({
  t,
  leagueId,
  expanded,
  onToggle,
}: {
  t: TeamCard;
  leagueId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const allW = t.dynastyW + t.playoffW;
  const allL = t.dynastyL + t.playoffL;

  const streakColor =
    t.streak?.type === "W"
      ? "text-emerald-400"
      : t.streak?.type === "L"
      ? "text-red-400"
      : "text-zinc-400";

  // The logged-in user's regular-season record vs this team, if they've met.
  const h2h = t.h2h;
  const h2hGames = h2h ? h2h.regW + h2h.regL + h2h.regT : 0;
  const h2hColor =
    h2h && h2h.regW > h2h.regL
      ? "text-emerald-400"
      : h2h && h2h.regL > h2h.regW
      ? "text-red-400"
      : "text-zinc-400";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {/* Compact header — always visible, toggles the expansion */}
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-zinc-800/40"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
          {t.logo && (
            <img
              src={t.logo}
              alt=""
              className="h-10 w-10 object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-white">
              {t.handle}
            </span>
            {t.place && <span className="shrink-0">{medalEmoji(t.place)}</span>}
            {t.isMember && (
              <span
                title="On the app"
                className="shrink-0 rounded-full border border-emerald-800 bg-emerald-950/50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-400"
              >
                ● Member
              </span>
            )}
            {t.newOwner && (
              <span className="shrink-0 rounded-full border border-amber-900 bg-amber-950/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-400">
                New
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            {t.lastRank && t.lastSeason
              ? `${t.lastSeason} ${ordinal(t.lastRank)}`
              : t.teamName}
            {t.streak && (
              <>
                {" · "}
                <span className={streakColor}>
                  {t.streak.type}
                  {t.streak.count}
                </span>
              </>
            )}
            {h2hGames > 0 && (
              <>
                {" · you "}
                <span className={h2hColor}>
                  {h2h!.regW}-{h2h!.regL}
                </span>
              </>
            )}
          </div>
        </div>

        {/* All-time record + chevron */}
        <div className="flex shrink-0 items-center gap-2 text-right">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-zinc-600">
              All-Time
            </div>
            <div className="text-sm font-bold tabular-nums text-white">
              {allW}-{allL}
            </div>
          </div>
          <Chevron open={expanded} />
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3.5 pb-4">
          <TeamStatsBody t={t} />
          <Link
            href={`teams/${t.rosterId}`}
            className="mt-3 block rounded-lg border border-zinc-800 bg-zinc-950/40 py-2 text-center text-sm font-medium text-emerald-400 hover:border-emerald-800 hover:text-emerald-300"
          >
            View full roster →
          </Link>
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-zinc-500 transition-transform ${
        open ? "rotate-180" : ""
      }`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
