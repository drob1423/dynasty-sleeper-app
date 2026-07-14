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
}: {
  t: TeamCard;
  href?: string;
  highlight?: boolean;
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

      {/* Their vitals — all-time first */}
      <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-zinc-950/40 py-3">
        <BigStat label="All-Time" value={`${t.dynastyW}-${t.dynastyL}`} />
        <BigStat label="This Year" value={`${t.currentW}-${t.currentL}`} />
        <BigStat
          label="Streak"
          value={t.streak ? `${t.streak.type}${t.streak.count}` : "—"}
          color={
            t.streak?.type === "W"
              ? "text-emerald-400"
              : t.streak?.type === "L"
              ? "text-red-400"
              : undefined
          }
        />
        <BigStat
          label="L5"
          value={t.form.length ? `${l5w}-${l5l}` : "—"}
          color={
            l5w > l5l
              ? "text-emerald-400"
              : l5l > l5w
              ? "text-red-400"
              : undefined
          }
        />
      </div>

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

function BigStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="px-1 text-center">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold ${color ?? "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

export function medalEmoji(place: number) {
  return place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "";
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
