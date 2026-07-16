"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TeamCard, SeasonLine } from "./teamData";

// A team's scorecard. Wrapped in a Link when `href` is passed (Rivals grid);
// a plain div otherwise (My Team tab). `highlight` gives the emerald treatment.
export function TeamScoreCard({
  t,
  href,
  highlight,
  extra,
}: {
  t: TeamCard;
  href?: string;
  highlight?: boolean;
  extra?: React.ReactNode;
}) {
  const cls = [
    "block rounded-2xl border p-5 transition-colors",
    highlight
      ? "border-emerald-600 bg-emerald-950/20"
      : "border-zinc-800 bg-zinc-900",
    href
      ? highlight
        ? "hover:bg-emerald-950/30"
        : "hover:border-emerald-700 hover:bg-zinc-800/50"
      : "",
  ].join(" ");

  const inner = (
    <>
      <TeamIdentity t={t} />
      <TeamStatsBody t={t} extra={extra} />
    </>
  );

  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

// The identity header: avatar, handle, badges, a subtitle line, and FAAB —
// the remaining waiver budget — set off to the right by a divider.
export function TeamIdentity({ t }: { t: TeamCard }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
        {t.logo && (
          <img
            src={t.logo}
            alt=""
            className="h-11 w-11 object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-base font-semibold text-white">
            {t.handle}
          </span>
          {t.place && <span className="shrink-0">{medalEmoji(t.place)}</span>}
          {t.isMember && (
            <span
              title="On the app"
              className="shrink-0 rounded-full border border-emerald-800 bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400"
            >
              ● Member
            </span>
          )}
          {t.newOwner && (
            <span className="shrink-0 rounded-full border border-amber-900 bg-amber-950/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-400">
              New
            </span>
          )}
        </div>
        <div className="truncate text-xs text-zinc-500">
          {t.teamName}
          {t.newOwner && t.tookOverFrom && (
            <> · took over from @{t.tookOverFrom}</>
          )}
        </div>
      </div>
      {/* FAAB — remaining waiver budget, divided off to the right of the name. */}
      <div className="shrink-0 border-l border-zinc-800 pl-3 text-right leading-tight">
        <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          FAAB
        </div>
        <div className="text-base font-bold text-zinc-100">
          {t.faab != null ? `$${t.faab}` : "—"}
        </div>
      </div>
    </div>
  );
}

// A compact activity pill — trades/moves, tucked beside the all-time record.
function ActivityPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap rounded-full bg-black/25 px-3 py-1 text-xs text-emerald-200/60">
      {label} <span className="font-bold text-white">{value}</span>
    </span>
  );
}

// Everything below the identity: the all-time record pill (record + medals +
// reg/playoff/best + all-time PF/PA/luck, all grouped) followed by a By-Season
// selector. `extra` (the positional radar) renders at the bottom on My Team.
export function TeamStatsBody({
  t,
  extra,
}: {
  t: TeamCard;
  extra?: React.ReactNode;
}) {
  const allW = t.dynastyW + t.playoffW;
  const allL = t.dynastyL + t.playoffL;

  const finishColor =
    t.bestFinish === 1
      ? "text-amber-400"
      : t.bestFinish === 2
      ? "text-zinc-300"
      : t.bestFinish === 3
      ? "text-amber-600"
      : undefined;
  const finishMedal =
    t.bestFinish === 1
      ? " 🥇"
      : t.bestFinish === 2
      ? " 🥈"
      : t.bestFinish === 3
      ? " 🥉"
      : "";
  const trophyCase = [
    t.rings > 0 ? `🥇${t.rings}` : null,
    t.silver > 0 ? `🥈${t.silver}` : null,
    t.bronze > 0 ? `🥉${t.bronze}` : null,
  ].filter(Boolean);

  const luckValue =
    t.luck != null ? `${t.luck >= 0 ? "+" : ""}${t.luck.toFixed(1)}` : "—";
  const luckColor =
    t.luck == null ? undefined : t.luck >= 0 ? "text-emerald-400" : "text-red-400";
  const expSub =
    t.expWins != null && t.games != null
      ? `exp ${Math.round(t.expWins)}-${Math.round(t.games - t.expWins)}`
      : undefined;
  const pts = (n: number | null) =>
    n != null ? `${Math.round(n).toLocaleString()} pts` : undefined;

  return (
    <div className="mt-4 space-y-5">
      {/* ALL-TIME — everything all-time grouped in one pill */}
      <div className="rounded-2xl border border-emerald-900/40 bg-gradient-to-br from-emerald-500/[0.10] to-transparent px-4 pb-3.5 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/90">
              All-Time Record
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="whitespace-nowrap text-3xl font-extrabold leading-none tracking-tight text-white">
                {allW}-{allL}
              </span>
              <span
                className={`text-sm font-bold ${
                  allW >= allL ? "text-emerald-400" : "text-zinc-400"
                }`}
              >
                {winPct(allW, allL)}
              </span>
            </div>
            {trophyCase.length > 0 && (
              <div className="mt-2 flex items-center gap-2.5 text-xs font-semibold text-zinc-300">
                {trophyCase.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            )}
          </div>
          {/* Transactions — trades & moves — filling the space beside the record. */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <ActivityPill label="Trades" value={`${t.trades}`} />
            <ActivityPill label="Moves" value={`${t.moves}`} />
          </div>
        </div>
        <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-emerald-900/40 pt-3.5">
          <InnerTile
            label="Reg Season"
            value={`${t.dynastyW}-${t.dynastyL}`}
            sub={winPct(t.dynastyW, t.dynastyL)}
          />
          <InnerTile
            label="Playoffs"
            value={`${t.playoffW}-${t.playoffL}`}
            sub={winPct(t.playoffW, t.playoffL)}
          />
          <InnerTile
            label="Best"
            value={t.bestFinish ? `${ordinal(t.bestFinish)}${finishMedal}` : "—"}
            valueClass={finishColor}
            sub={t.bestFinishSeasons.join(", ") || undefined}
          />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <InnerTile
            label="PF"
            value={t.allTimePfRank ? ordinal(t.allTimePfRank) : "—"}
            valueClass={
              t.allTimePfRank && t.allTimePfRank <= 3 ? "text-emerald-400" : undefined
            }
            sub={pts(t.allTimePf)}
          />
          <InnerTile
            label="PA"
            value={t.allTimePaRank ? ordinal(t.allTimePaRank) : "—"}
            sub={pts(t.allTimePa)}
          />
          <InnerTile label="Luck" value={luckValue} valueClass={luckColor} sub={expSub} />
        </div>
      </div>

      {/* BY SEASON */}
      {t.seasons.length > 0 && <SeasonSection seasons={t.seasons} />}

      {extra}
    </div>
  );
}

// A subtle tile that lives INSIDE the all-time pill.
function InnerTile({
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
    <div className="rounded-[10px] bg-black/25 px-1 py-2 text-center">
      <div className="text-[8.5px] font-bold uppercase tracking-wide text-emerald-200/45">
        {label}
      </div>
      <div
        className={`mt-1 whitespace-nowrap text-[15px] font-extrabold ${
          valueClass ?? "text-white"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[8.5px] text-emerald-200/25">{sub}</div>}
    </div>
  );
}

// A standalone stat tile (the By-Season panel).
function Tile({
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-2 py-2.5 text-center">
      <div className="text-[9.5px] font-bold uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      <div className={`mt-1.5 text-lg font-extrabold ${valueClass ?? "text-white"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[9.5px] text-zinc-600">{sub}</div>}
    </div>
  );
}

// The By-Season header (most-recent-left selector, capped at 3 with a ⋯ dropdown
// for older years) and the selected season's record + PF/PA panel.
function SeasonSection({ seasons }: { seasons: SeasonLine[] }) {
  const played = (s: SeasonLine) => s.regW + s.regL + s.poW + s.poL > 0;
  const firstPlayed = seasons.findIndex(played);
  const [sel, setSel] = useState(
    seasons[firstPlayed >= 0 ? firstPlayed : 0]?.season ?? ""
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const selected = seasons.find((s) => s.season === sel) ?? seasons[0];
  const primary = seasons.slice(0, 2);
  const rest = seasons.slice(2);
  const selInRest = rest.some((s) => s.season === sel);
  const third = selInRest ? seasons.find((s) => s.season === sel) : rest[0];
  const visible = [...primary, ...(third ? [third] : [])];
  const hasOverflow = rest.length > 1;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="shrink-0 text-xs font-bold uppercase tracking-widest text-zinc-200">
          By Season
        </span>
        <span className="h-px flex-1 bg-zinc-800" />
        <div ref={wrapRef} className="relative flex shrink-0 items-center gap-1.5">
          {visible.map((s, i) => {
            const isLast = i === visible.length - 1;
            const on = s.season === sel;
            return (
              <button
                key={s.season}
                onClick={() => setSel(s.season)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-bold transition-colors",
                  on
                    ? "border-emerald-800 bg-emerald-950/60 text-emerald-300"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200",
                ].join(" ")}
              >
                {s.season}
                {isLast && hasOverflow && (
                  <span
                    role="button"
                    aria-label="Older seasons"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen((o) => !o);
                    }}
                    className="ml-1.5 text-zinc-500 hover:text-zinc-300"
                  >
                    ⋯
                  </span>
                )}
              </button>
            );
          })}
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1.5 max-h-56 min-w-[86px] overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
              {rest.map((s) => (
                <button
                  key={s.season}
                  onClick={() => {
                    setSel(s.season);
                    setMenuOpen(false);
                  }}
                  className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs font-semibold ${
                    s.season === sel
                      ? "text-emerald-300"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {s.season}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Regular Season" value={`${selected.regW}-${selected.regL}`} />
            <Tile label="Playoffs" value={`${selected.poW}-${selected.poL}`} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Tile
              label="PF"
              value={selected.pfRank ? ordinal(selected.pfRank) : "—"}
              valueClass={
                selected.pfRank && selected.pfRank <= 3
                  ? "text-emerald-400"
                  : undefined
              }
              sub={
                selected.pf
                  ? `${Math.round(selected.pf).toLocaleString()} pts`
                  : undefined
              }
            />
            <Tile
              label="PA"
              value={selected.paRank ? ordinal(selected.paRank) : "—"}
              sub={
                selected.pa
                  ? `${Math.round(selected.pa).toLocaleString()} pts`
                  : undefined
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

export function medalEmoji(place: number) {
  return place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "";
}

// Win percentage as ".643" (drops the leading zero, fantasy convention).
function winPct(w: number, l: number): string {
  const g = w + l;
  if (!g) return "—";
  return (w / g).toFixed(3).replace(/^0/, "");
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
