"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { TeamCard } from "./teamData";
import type { H2HRecord } from "@/lib/sleeper";

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

  // Record over the last 5 regular-season games.
  const l5w = t.form.filter((r) => r === "W").length;
  const l5l = t.form.filter((r) => r === "L").length;

  // All-time = regular season + meaningful playoff games.
  const allW = t.dynastyW + t.playoffW;
  const allL = t.dynastyL + t.playoffL;

  const inner = (
    <>
      {/* Identity */}
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
            {t.newOwner && t.tookOverFrom ? (
              <> · took over from @{t.tookOverFrom}</>
            ) : (
              t.lastRank &&
              t.lastSeason && <> · {t.lastSeason} {ordinal(t.lastRank)}</>
            )}
          </div>
        </div>
      </div>

      {/* Record hero — all-time up front, reg/playoff split alongside */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-zinc-950/40 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">All-Time</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold leading-none text-white">
              {allW}-{allL}
            </span>
            <span className="text-sm font-semibold text-zinc-500">{winPct(allW, allL)}</span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <RecPill label="Reg" rec={`${t.dynastyW}-${t.dynastyL}`} pct={winPct(t.dynastyW, t.dynastyL)} />
          <RecPill label="Playoffs" rec={`${t.playoffW}-${t.playoffL}`} pct={winPct(t.playoffW, t.playoffL)} />
        </div>
      </div>

      {/* Uniform stat grid */}
      <div className="mt-2 grid grid-cols-3 gap-y-3 rounded-xl bg-zinc-950/40 py-3">
        <BigStat label="This Year" value={`${t.currentW}-${t.currentL}`} />
        <BigStat
          label="Streak"
          value={t.streak ? `${t.streak.type}${t.streak.count}` : "—"}
          color={t.streak?.type === "W" ? "text-emerald-400" : t.streak?.type === "L" ? "text-red-400" : undefined}
        />
        <BigStat
          label="L5"
          value={t.form.length ? `${l5w}-${l5l}` : "—"}
          color={l5w > l5l ? "text-emerald-400" : l5l > l5w ? "text-red-400" : undefined}
        />
        <BigStat
          label="Points For"
          value={t.pfRank ? ordinal(t.pfRank) : "—"}
          sub={t.pf != null ? `${Math.round(t.pf).toLocaleString()} pts` : undefined}
          color={t.pfRank && t.pfRank <= 3 ? "text-emerald-400" : undefined}
        />
        <BigStat
          label="Luck"
          value={t.luck != null ? `${t.luck >= 0 ? "+" : ""}${t.luck.toFixed(1)}` : "—"}
          color={t.luck == null ? undefined : t.luck >= 0 ? "text-emerald-400" : "text-red-400"}
          sub={t.expWins != null && t.games != null ? `exp ${Math.round(t.expWins)}-${Math.round(t.games - t.expWins)}` : undefined}
        />
        <BigStat
          label="Titles"
          value={t.rings > 0 ? `🏆 ${t.rings}` : "—"}
          color={t.rings > 0 ? "text-amber-400" : undefined}
          sub={t.silver || t.bronze ? `${t.silver}🥈 ${t.bronze}🥉` : undefined}
        />
      </div>

      {/* Optional inline section (e.g. positional strength on My Team) */}
      {extra}

      {/* Your head-to-head vs this team (hidden on your own card) */}
      <H2HStrip rec={t.h2h} />

      {/* Activity footer */}
      <div className="mt-4 flex justify-between border-t border-zinc-800/60 pt-3 text-xs text-zinc-500">
        <span>
          Trades <span className="font-semibold text-zinc-300">{t.trades}</span>
        </span>
        <span>
          Moves <span className="font-semibold text-zinc-300">{t.moves}</span>
        </span>
        <span>
          FAAB{" "}
          <span className="font-semibold text-zinc-300">
            {t.faab != null ? `$${t.faab}` : "—"}
          </span>
        </span>
      </div>
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

// The logged-in user's head-to-head record vs this team.
function H2HStrip({ rec }: { rec: H2HRecord | null }) {
  if (!rec) return null; // your own team

  const color = (w: number, l: number) =>
    w > l ? "text-emerald-400" : l > w ? "text-red-400" : "text-zinc-400";
  const avgColor = (mine: number, opp: number) =>
    mine > opp ? "text-emerald-400" : opp > mine ? "text-red-400" : "text-zinc-400";

  const regGames = rec.regW + rec.regL + rec.regT;
  const poGames = rec.poW + rec.poL + rec.poT;

  const line = (
    label: string,
    w: number,
    l: number,
    t: number,
    games: number,
    myPts: number,
    oppPts: number
  ) => {
    const myAvg = games ? myPts / games : null;
    const oppAvg = games ? oppPts / games : null;
    return (
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">
          <span className={`font-semibold ${color(w, l)}`}>
            {w}–{l}
            {t > 0 && `–${t}`}
          </span>
          <span className="text-xs text-zinc-600"> {label}</span>
        </span>
        <span className="shrink-0 text-xs">
          {myAvg != null && oppAvg != null ? (
            <>
              <span className={`font-medium ${avgColor(myAvg, oppAvg)}`}>
                {myAvg.toFixed(1)}
              </span>
              <span className="text-zinc-600">–{oppAvg.toFixed(1)} avg</span>
            </>
          ) : (
            <span className="text-zinc-600">no games</span>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="mt-4 rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-3.5 py-2.5">
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
        H2H Matchup
      </div>
      <div className="space-y-1">
        {line("reg", rec.regW, rec.regL, rec.regT, regGames, rec.myPtsFor, rec.oppPtsFor)}
        {line("po", rec.poW, rec.poL, rec.poT, poGames, rec.myPtsForPO, rec.oppPtsForPO)}
      </div>
    </div>
  );
}

function RecPill({ label, rec, pct }: { label: string; rec: string; pct: string }) {
  return (
    <div className="rounded-lg bg-zinc-900 px-2.5 py-1 text-center">
      <div className="text-[9px] uppercase tracking-wide text-zinc-600">{label}</div>
      <div className="text-xs font-semibold text-zinc-200">{rec}</div>
      <div className="text-[9px] text-zinc-500">{pct}</div>
    </div>
  );
}

function BigStat({
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
    <div className="px-1 text-center">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold ${color ?? "text-white"}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-zinc-600">{sub}</div>}
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
