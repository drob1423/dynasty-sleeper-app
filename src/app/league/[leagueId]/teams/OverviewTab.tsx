"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import type { TeamCard } from "./teamData";
import { TeamStatsBody } from "./TeamScoreCard";
import {
  getRivalH2HGrid,
  getRecentTransactions,
  getMatchupLog,
  type RivalH2H,
  type TxItem,
  type TradeSide,
  type H2HGame,
  type TopPlayer,
  type Lineup,
  type LineupPlayer,
} from "@/lib/overview";

// The team detail "Overview" tab: the stat hero, then this team's H2H vs the
// whole league, their recent moves, and — when you're viewing someone else —
// your detailed game-by-game history against them.
export function OverviewTab({
  leagueId,
  team,
  meRosterId,
}: {
  leagueId: string;
  team: TeamCard;
  meRosterId: number | null;
}) {
  const [grid, setGrid] = useState<RivalH2H[] | null>(null);
  const [txns, setTxns] = useState<TxItem[] | null>(null);
  const [log, setLog] = useState<H2HGame[] | null>(null);

  const viewingOther = meRosterId != null && meRosterId !== team.rosterId;

  useEffect(() => {
    let alive = true;
    setGrid(null);
    setTxns(null);
    setLog(null);

    getRivalH2HGrid(leagueId, team.ownerId, team.rosterId).then(
      (g) => alive && setGrid(g)
    );
    getRecentTransactions(leagueId, team.rosterId, 5).then(
      (t) => alive && setTxns(t)
    );
    if (viewingOther && meRosterId != null) {
      getMatchupLog(leagueId, meRosterId, team.rosterId).then(
        (l) => alive && setLog(l)
      );
    } else {
      setLog([]);
    }

    return () => {
      alive = false;
    };
  }, [leagueId, team.rosterId, team.ownerId, meRosterId, viewingOther]);

  return (
    <div className="space-y-6">
      <TeamStatsBody t={team} hideH2H />

      {viewingOther && (
        <MatchupLog handle={team.handle} log={log} />
      )}
      <RivalGrid leagueId={leagueId} team={team} grid={grid} />
      <RecentMoves handle={team.handle} txns={txns} />
    </div>
  );
}

// --- Section shell -------------------------------------------------------
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2.5 border-b border-zinc-800 pb-1.5 text-lg font-bold text-white">
        {title}
      </h3>
      {children}
    </section>
  );
}

// --- 1. H2H vs the league ------------------------------------------------
// Every rival row expands into the full head-to-head game log between the
// viewed team and that rival — same detail as "your history vs" but from the
// viewed team's perspective.
function RivalGrid({
  leagueId,
  team,
  grid,
}: {
  leagueId: string;
  team: TeamCard;
  grid: RivalH2H[] | null;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [logs, setLogs] = useState<Record<number, H2HGame[] | null>>({});

  // Reset when navigating to a different team.
  useEffect(() => {
    setOpenId(null);
    setLogs({});
  }, [team.rosterId]);

  const toggle = (rid: number) => {
    setOpenId((cur) => (cur === rid ? null : rid));
    setLogs((cur) => {
      if (rid in cur) return cur; // already loading/loaded
      getMatchupLog(leagueId, team.rosterId, rid).then((l) =>
        setLogs((c) => ({ ...c, [rid]: l }))
      );
      return { ...cur, [rid]: null };
    });
  };

  return (
    <Section title={`${team.handle}'s record vs the league`}>
      {grid == null ? (
        <Loading />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800/60">
          {grid.map((r) => {
            const g = r.rec.regW + r.rec.regL + r.rec.regT;
            const played = g + r.rec.poW + r.rec.poL > 0;
            const pct = g ? r.rec.regW / g : 0;
            const tone =
              g === 0
                ? "text-zinc-600"
                : r.rec.regW > r.rec.regL
                ? "text-emerald-400"
                : r.rec.regL > r.rec.regW
                ? "text-red-400"
                : "text-zinc-300";
            const isOpen = openId === r.rosterId;
            const rowLog = logs[r.rosterId];
            return (
              <div key={r.rosterId}>
                <button
                  onClick={() => played && toggle(r.rosterId)}
                  disabled={!played}
                  className={`flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors ${
                    played ? "hover:bg-zinc-800/40" : "cursor-default"
                  }`}
                >
                  <Avatar logo={r.logo} size={7} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm text-zinc-200">{r.handle}</span>
                      {r.rec.poW + r.rec.poL > 0 && (
                        <span className="shrink-0 rounded bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                          PO {r.rec.poW}-{r.rec.poL}
                        </span>
                      )}
                    </div>
                    {g > 0 && (
                      <div className="text-[11px] tabular-nums text-zinc-600">
                        {Math.round(r.rec.myPtsFor).toLocaleString()}–
                        {Math.round(r.rec.oppPtsFor).toLocaleString()} pts
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${tone}`}>
                    {g === 0 ? "—" : `${r.rec.regW}-${r.rec.regL}${r.rec.regT ? `-${r.rec.regT}` : ""}`}
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                    {g === 0 ? "" : pct.toFixed(3).replace(/^0/, "")}
                  </span>
                  {played && (
                    <span
                      className={`shrink-0 text-zinc-600 transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    >
                      ›
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-800/60 bg-zinc-950/40 px-3 py-3">
                    {rowLog == null ? (
                      <Loading />
                    ) : rowLog.length === 0 ? (
                      <Empty>
                        No completed games yet — this rivalry only shows in the
                        current, unfinished season.
                      </Empty>
                    ) : (
                      <MatchupHistory
                        log={rowLog}
                        myLabel={team.handle}
                        oppLabel={r.handle}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// --- 2. Recent moves -----------------------------------------------------
function RecentMoves({ handle, txns }: { handle: string; txns: TxItem[] | null }) {
  return (
    <Section title={`${handle}'s recent moves`}>
      {txns == null ? (
        <Loading />
      ) : txns.length === 0 ? (
        <Empty>No transactions on record.</Empty>
      ) : (
        <div className="space-y-2">
          {txns.map((t, i) => (
            <TxRow key={i} t={t} />
          ))}
        </div>
      )}
    </Section>
  );
}

function TxRow({ t }: { t: TxItem }) {
  const label =
    t.type === "trade"
      ? `Trade${t.partners.length ? ` · ${t.partners.join(", ")}` : ""}`
      : t.type === "waiver"
      ? "Waiver claim"
      : t.type === "free_agent"
      ? "Free agent"
      : t.type === "commissioner"
      ? "Commish move"
      : "Move";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-300">
          {label}
          {t.faab ? (
            <span className="ml-1.5 font-normal text-emerald-500">
              {t.faab > 0 ? `$${t.faab}` : `-$${Math.abs(t.faab)}`}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[11px] text-zinc-600">{fmtDate(t.ts)}</span>
      </div>
      {t.type === "trade" && t.sides ? (
        <div className="space-y-2.5">
          {t.sides.map((s) => (
            <TradeSideView key={s.rosterId} s={s} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {t.adds.map((p, i) => (
            <MoveLine key={`a${i}`} dir="in" p={p} />
          ))}
          {t.drops.map((p, i) => (
            <MoveLine key={`d${i}`} dir="out" p={p} />
          ))}
          {t.picks > 0 && (
            <div className="text-xs text-zinc-500">
              + {t.picks} draft pick{t.picks === 1 ? "" : "s"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One manager's side of a trade — everything they received.
function TradeSideView({ s }: { s: TradeSide }) {
  const empty = s.acquired.length === 0 && s.picks.length === 0 && s.faab === 0;
  return (
    <div className="rounded-lg bg-zinc-950/40 px-3 py-2">
      <div className="mb-1 text-[11px] font-semibold text-zinc-400">
        {s.handle} <span className="font-normal text-zinc-600">received</span>
      </div>
      <div className="space-y-1">
        {s.acquired.map((p, i) => (
          <MoveLine key={`p${i}`} dir="in" p={p} />
        ))}
        {s.picks.map((pk, i) => (
          <div key={`k${i}`} className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-xs font-bold text-emerald-500">+</span>
            <span className="text-zinc-200">
              {pk.season} {ordinalRound(pk.round)}
            </span>
            {pk.originalHandle && (
              <span className="text-[11px] text-zinc-600">via {pk.originalHandle}</span>
            )}
          </div>
        ))}
        {s.faab > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="shrink-0 text-xs font-bold text-emerald-500">+</span>
            <span className="text-zinc-200">${s.faab} FAAB</span>
          </div>
        )}
        {empty && <div className="text-xs text-zinc-600">Nothing</div>}
      </div>
    </div>
  );
}

function ordinalRound(r: number): string {
  const s = r === 1 ? "1st" : r === 2 ? "2nd" : r === 3 ? "3rd" : `${r}th`;
  return `${s} round pick`;
}

function MoveLine({ dir, p }: { dir: "in" | "out"; p: TopPlayerLite }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`shrink-0 text-xs font-bold ${
          dir === "in" ? "text-emerald-500" : "text-red-500"
        }`}
      >
        {dir === "in" ? "+" : "−"}
      </span>
      <span className="text-zinc-200">{p.name}</span>
      <span className="text-[11px] text-zinc-600">
        {p.pos ?? ""}
        {p.team ? ` · ${p.team}` : ""}
      </span>
    </div>
  );
}
type TopPlayerLite = { name: string; pos: string | null; team: string | null };

// --- 3. Detailed matchup log --------------------------------------------
function MatchupLog({ handle, log }: { handle: string; log: H2HGame[] | null }) {
  return (
    <Section title={`Your history vs ${handle}`}>
      {log == null ? (
        <Loading />
      ) : log.length === 0 ? (
        <Empty>You&rsquo;ve never faced {handle}.</Empty>
      ) : (
        <MatchupHistory log={log} myLabel="You" oppLabel={handle} />
      )}
    </Section>
  );
}

// The summary strip + per-game cards. `myLabel`/`oppLabel` name the two sides
// (the first roster passed to getMatchupLog is "my" side).
function MatchupHistory({
  log,
  myLabel,
  oppLabel,
}: {
  log: H2HGame[];
  myLabel: string;
  oppLabel: string;
}) {
  return (
    <>
      <LogSummary log={log} />
      <div className="mt-2 space-y-2">
        {log.map((g, i) => (
          <GameCard key={i} g={g} myLabel={myLabel} oppLabel={oppLabel} />
        ))}
      </div>
    </>
  );
}

function LogSummary({ log }: { log: H2HGame[] }) {
  let w = 0, l = 0, t = 0, myPts = 0, theirPts = 0;
  for (const g of log) {
    if (g.result === "W") w++; else if (g.result === "L") l++; else t++;
    myPts += g.myScore;
    theirPts += g.theirScore;
  }
  const n = log.length;
  const tone = w > l ? "text-emerald-400" : l > w ? "text-red-400" : "text-zinc-300";
  return (
    <div className="flex items-center justify-between rounded-xl bg-zinc-950/50 px-4 py-2.5">
      <div>
        <span className={`text-lg font-bold ${tone}`}>
          {w}-{l}{t ? `-${t}` : ""}
        </span>
        <span className="ml-2 text-xs text-zinc-500">{n} meeting{n === 1 ? "" : "s"}</span>
      </div>
      <div className="text-right text-xs text-zinc-500">
        <div>
          total{" "}
          <span className="font-semibold text-zinc-300 tabular-nums">
            {Math.round(myPts).toLocaleString()}
          </span>
          {" – "}
          <span className="font-semibold text-zinc-300 tabular-nums">
            {Math.round(theirPts).toLocaleString()}
          </span>
        </div>
        <div className="text-[11px] text-zinc-600">
          avg <span className="tabular-nums">{(myPts / n).toFixed(1)}</span>
          {" – "}
          <span className="tabular-nums">{(theirPts / n).toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

function GameCard({
  g,
  myLabel = "You",
  oppLabel = "Them",
}: {
  g: H2HGame;
  myLabel?: string;
  oppLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const win = g.result === "W";
  const tie = g.result === "T";
  const barTone = win
    ? "border-l-emerald-500"
    : tie
    ? "border-l-zinc-600"
    : "border-l-red-500";

  return (
    <div className={`overflow-hidden rounded-xl border border-zinc-800 border-l-4 bg-zinc-900 ${barTone}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="block w-full text-left transition-colors hover:bg-zinc-800/40"
      >
        <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
          <span className="text-[11px] text-zinc-500">
            {g.season} · {g.isPlayoff ? g.round : `Week ${g.week}`}
          </span>
          <span
            className={`text-[11px] font-bold uppercase ${
              win ? "text-emerald-400" : tie ? "text-zinc-400" : "text-red-400"
            }`}
          >
            {win ? "Win" : tie ? "Tie" : "Loss"}
          </span>
        </div>

        {/* Score line */}
        <div className="flex items-baseline gap-2 px-3.5 pb-2 pt-1">
          <span className={`text-xl font-bold tabular-nums ${win ? "text-white" : "text-zinc-400"}`}>
            {g.myScore.toFixed(1)}
          </span>
          <span className="text-xs text-zinc-600">–</span>
          <span className={`text-xl font-bold tabular-nums ${!win && !tie ? "text-white" : "text-zinc-400"}`}>
            {g.theirScore.toFixed(1)}
          </span>
          <span className="ml-auto text-[11px] text-zinc-600">
            records then: {g.myRecord} / {g.theirRecord}
          </span>
        </div>
      </button>

      {/* Collapsed: top scorers. Expanded: full lineups + bench. */}
      {open ? (
        <div className="grid grid-cols-2 gap-px border-t border-zinc-800 bg-zinc-800 text-xs">
          <LineupCol label={myLabel} total={g.myScore} lineup={g.myLineup} />
          <LineupCol label={oppLabel} total={g.theirScore} lineup={g.theirLineup} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-px border-t border-zinc-800 bg-zinc-800 text-xs">
          <TopCol label={myLabel} players={g.myTop} />
          <TopCol label={oppLabel} players={g.theirTop} />
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-zinc-800 py-1.5 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-300"
      >
        {open ? "Hide lineups ▲" : "Full lineup & bench ▼"}
      </button>
    </div>
  );
}

function TopCol({ label, players }: { label: string; players: TopPlayer[] }) {
  return (
    <div className="bg-zinc-900 px-3.5 py-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
        {label} · top scorers
      </div>
      <div className="space-y-0.5">
        {players.map((p, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-zinc-300">
              {p.name}
              <span className="ml-1 text-[10px] text-zinc-600">{p.pos}</span>
            </span>
            <span className="shrink-0 tabular-nums text-zinc-400">
              {p.points.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineupCol({
  label,
  total,
  lineup,
}: {
  label: string;
  total: number;
  lineup: Lineup;
}) {
  return (
    <div className="bg-zinc-900 px-3 py-2">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {label}
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-zinc-300">
          {total.toFixed(1)}
        </span>
      </div>
      <div className="space-y-0.5">
        {lineup.starters.map((p, i) => (
          <PlayerLine key={`s${i}`} p={p} />
        ))}
      </div>
      {lineup.bench.length > 0 && (
        <>
          <div className="mb-0.5 mt-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
            Bench
          </div>
          <div className="space-y-0.5 opacity-70">
            {lineup.bench.map((p, i) => (
              <PlayerLine key={`b${i}`} p={p} bench />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PlayerLine({ p, bench }: { p: LineupPlayer; bench?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={`w-8 shrink-0 text-[9px] font-semibold uppercase ${
          bench ? "text-zinc-700" : "text-emerald-600/80"
        }`}
      >
        {bench ? p.pos ?? "" : p.slot ?? ""}
      </span>
      <span className="min-w-0 flex-1 truncate text-zinc-300">{p.name}</span>
      <span className="shrink-0 tabular-nums text-zinc-500">{p.points.toFixed(1)}</span>
    </div>
  );
}

// --- shared bits ---------------------------------------------------------
function Avatar({ logo, size }: { logo: string | null; size: number }) {
  const dim = `${size * 4}px`;
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-zinc-800"
      style={{ width: dim, height: dim }}
    >
      {logo && (
        <img
          src={logo}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-6 text-center text-sm text-zinc-600">
      Loading…
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-5 text-center text-sm text-zinc-600">
      {children}
    </div>
  );
}

// Exact transaction date, e.g. "Jul 3, 2026".
function fmtDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
