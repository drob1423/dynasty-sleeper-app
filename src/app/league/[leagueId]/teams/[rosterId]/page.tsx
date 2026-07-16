"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getRoomStrength, type PositionRoom } from "@/lib/roomStrength";
import { loadTeamCards, type TeamCard } from "../teamData";
import { TeamIdentity, ordinal } from "../TeamScoreCard";
import { OverviewTab } from "../OverviewTab";
import { RosterView } from "../RosterView";
import { computeTradeProfiles } from "../tradeProfile";

type Tab = "overview" | "roster" | "positions";

export default function TeamDetail() {
  const params = useParams();
  const leagueId = params.leagueId as string;
  const rosterId = Number(params.rosterId);

  const [tab, setTab] = useState<Tab>("overview");
  const [card, setCard] = useState<TeamCard | null>(null);
  const [meRosterId, setMeRosterId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<PositionRoom[]>([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      const [{ cards }, roomRes] = await Promise.all([
        loadTeamCards(leagueId),
        getRoomStrength(leagueId),
      ]);
      if (!alive) return;
      setCard(cards.find((c) => c.rosterId === rosterId) ?? null);
      setMeRosterId(cards.find((c) => c.isMe)?.rosterId ?? null);
      setRooms(roomRes.rooms);
    }
    load();
    return () => {
      alive = false;
    };
  }, [leagueId, rosterId]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "roster", label: "Roster" },
    { id: "positions", label: "Positions" },
  ];

  return (
    <div>
      <Link
        href="../teams"
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 shadow-sm transition-colors hover:border-emerald-600 hover:bg-zinc-800 hover:text-white active:scale-[0.98]"
      >
        <span aria-hidden className="text-base leading-none">←</span>
        All rivals
      </Link>

      <div className="mt-3">
        {card ? (
          <TeamIdentity t={card} />
        ) : (
          <div className="h-11" />
        )}
      </div>

      <nav className="mt-4 -mx-4 overflow-x-auto px-4">
        <div className="flex gap-1 border-b border-zinc-800">
          {tabs.map((tb) => {
            const active = tab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={[
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-emerald-500 text-white"
                    : "border-transparent text-zinc-400 hover:text-zinc-200",
                ].join(" ")}
              >
                {tb.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mt-5">
        {tab === "overview" &&
          (card ? (
            <OverviewTab leagueId={leagueId} team={card} meRosterId={meRosterId} />
          ) : (
            <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
          ))}
        {tab === "roster" && <RosterView leagueId={leagueId} rosterId={rosterId} />}
        {tab === "positions" && (
          <PositionsBreakdown rooms={rooms} rosterId={rosterId} />
        )}
      </div>
    </div>
  );
}

// Small badge marking a player who's on the roster but not currently startable.
function StatusPill({
  tone,
  children,
}: {
  tone: "ir" | "taxi";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ir"
      ? "border-red-900/70 bg-red-950/40 text-red-300"
      : "border-sky-900/70 bg-sky-950/40 text-sky-300";
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}

// Per-position breakdown: shows every ranked player, which starter slots they
// fill, and the resulting needs/strengths — so the positional read is auditable.
function PositionsBreakdown({
  rooms,
  rosterId,
}: {
  rooms: PositionRoom[];
  rosterId: number;
}) {
  if (!rooms.length) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        Positional data isn&rsquo;t built for this league yet.
      </p>
    );
  }

  const teamCount = rooms[0].teams.length;
  const profile = computeTradeProfiles(rooms).get(rosterId);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Each position ranks every player league-wide by points scored. A slot is
        a need when no rostered player is good enough to fill it. Taxi and IR
        players are shown for context (with their would-be rank) but don&rsquo;t
        count toward ranks or needs until they&rsquo;re active.
      </p>

      {rooms.map((room) => {
        const team = room.teams.find((t) => t.rosterId === rosterId);
        if (!team) return null;
        const needsHere = (profile?.needs ?? []).filter(
          (n) => n.pos === room.position
        );

        return (
          <div
            key={room.position}
            className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-white">
                {room.label}
                <span className="ml-1.5 font-normal text-zinc-600">
                  · {room.startersN} starter{room.startersN === 1 ? "" : "s"}
                </span>
              </h3>
              <span className="text-xs text-zinc-500">
                {team.starterPlacement
                  ? `${ordinal(team.starterPlacement)} of ${teamCount}`
                  : "unranked"}
              </span>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {team.players.length === 0 ? (
                <p className="px-4 py-3 text-xs text-zinc-600">
                  No ranked players (needs 4+ games to qualify).
                </p>
              ) : (
                team.players.map((p) => {
                  const inactive = p.status !== "active";
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-4 py-2 ${
                        inactive ? "bg-zinc-950/40" : ""
                      }`}
                    >
                      <span
                        className={`w-9 shrink-0 text-center text-xs font-semibold tabular-nums ${
                          inactive
                            ? "text-zinc-600"
                            : p.isStarter
                            ? "text-emerald-400"
                            : "text-zinc-500"
                        }`}
                      >
                        #{p.posRank}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          inactive ? "text-zinc-500" : "text-zinc-200"
                        }`}
                      >
                        {p.name}
                        <span className="ml-1.5 text-xs text-zinc-600">
                          {p.team ?? "FA"} · {p.mean.toFixed(1)} ppg
                        </span>
                      </span>
                      {p.status === "ir" && <StatusPill tone="ir">IR</StatusPill>}
                      {p.status === "taxi" && (
                        <StatusPill tone="taxi">Taxi</StatusPill>
                      )}
                      {p.isStarter && (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-500/80">
                          Starter
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {needsHere.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-800 px-4 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Needs
                </span>
                {needsHere.map((n) => (
                  <span
                    key={n.label}
                    className="rounded-md border border-red-900/70 bg-red-950/40 px-2 py-0.5 text-xs font-semibold text-red-300"
                  >
                    {n.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
