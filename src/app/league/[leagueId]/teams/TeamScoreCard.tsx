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
          <div className="truncate text-base font-semibold text-white">
            {t.teamName}
            {t.place && <span className="ml-1">{medalEmoji(t.place)}</span>}
          </div>
          <div className="truncate text-xs text-zinc-500">
            @{t.handle}
            {t.lastRank && t.lastSeason && (
              <> · {t.lastSeason} {ordinal(t.lastRank)}</>
            )}
          </div>
        </div>
      </div>

      {/* Your head-to-head vs this team (hidden on your own card) */}
      <H2HStrip rec={t.h2h} />

      {/* Records + streak */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-zinc-800 rounded-xl bg-zinc-950/60 py-3">
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
      </div>

      {/* Recent form */}
      {t.form.length > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            Recent form
          </span>
          <FormGuide form={t.form} />
        </div>
      )}

      {/* Activity (secondary) */}
      <div className="mt-3 flex justify-between border-t border-zinc-800/60 pt-3 text-xs text-zinc-500">
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

  const regGames = rec.regW + rec.regL + rec.regT;
  const myAvg = regGames ? rec.myPtsFor / regGames : null;
  const oppAvg = regGames ? rec.oppPtsFor / regGames : null;
  const avgColor =
    myAvg != null && oppAvg != null
      ? myAvg > oppAvg
        ? "text-emerald-400"
        : oppAvg > myAvg
        ? "text-red-400"
        : "text-zinc-400"
      : "text-zinc-400";

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          H2H Record
        </span>
        <span className="text-sm">
          <span className={`font-semibold ${color(rec.regW, rec.regL)}`}>
            {rec.regW}–{rec.regL}
            {rec.regT > 0 && `–${rec.regT}`}
          </span>
          <span className="text-zinc-600"> reg</span>
          <span className={`ml-2.5 font-semibold ${color(rec.poW, rec.poL)}`}>
            {rec.poW}–{rec.poL}
          </span>
          <span className="text-zinc-600"> po</span>
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          Avg score
        </span>
        <span className="text-sm">
          {myAvg != null && oppAvg != null ? (
            <>
              <span className={`font-semibold ${avgColor}`}>
                {myAvg.toFixed(1)}
              </span>
              <span className="text-zinc-600"> – </span>
              <span className="text-zinc-300">{oppAvg.toFixed(1)}</span>
            </>
          ) : (
            <span className="text-zinc-500">—</span>
          )}
        </span>
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
    <div className="px-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-bold ${color ?? "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function FormGuide({ form }: { form: ("W" | "L" | "T")[] }) {
  return (
    <div className="flex gap-1">
      {form.map((r, i) => {
        const cls =
          r === "W" ? "bg-emerald-500" : r === "L" ? "bg-red-500" : "bg-zinc-500";
        return (
          <span
            key={i}
            className={`flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold text-black ${cls}`}
            title={r}
          >
            {r}
          </span>
        );
      })}
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
