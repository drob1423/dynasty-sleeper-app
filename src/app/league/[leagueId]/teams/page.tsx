"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getFullRosters,
  getLeagueUsers,
  getPlayerMap,
  getSeasonChain,
  getRosters,
  getPlayoffResults,
  getWeeklyResults,
  getTransactionStatsForSeason,
  trailingStreak,
  seasonHasData,
  type SleeperManager,
  type PlayerInfo,
  type Streak,
} from "@/lib/sleeper";

type TeamCard = {
  rosterId: number;
  teamName: string;
  handle: string;
  logo: string | null;
  lastSeason: string | null;
  lastRank: number | null;
  place: number | null; // medal
  dynastyW: number;
  dynastyL: number;
  currentW: number;
  currentL: number;
  streak: Streak;
  form: ("W" | "L" | "T")[]; // last 5 regular-season results, oldest→newest
  trades: number;
  moves: number;
  faab: number | null;
  avgStarterAge: number | null;
  producing: boolean | null;
};

export default function TeamsTab() {
  const params = useParams();
  const leagueId = params.leagueId as string;

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamCard[]>([]);
  const [lastSeasonLabel, setLastSeasonLabel] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [currentFull, users, players, chain] = await Promise.all([
        getFullRosters(leagueId),
        getLeagueUsers(leagueId),
        getPlayerMap(),
        getSeasonChain(leagueId),
      ]);
      const byId = new Map(users.map((u: SleeperManager) => [u.user_id, u]));
      const currentLeague = chain[0];
      const faabBudget = currentLeague?.waiverBudget ?? 0;
      const lastPlayedIndex = chain.findIndex(seasonHasData);
      const lastPlayed = lastPlayedIndex >= 0 ? chain[lastPlayedIndex] : null;
      setLastSeasonLabel(lastPlayed?.season ?? null);

      // Fetch per-season rosters (records + moves), trade counts, last
      // season's playoffs (medals) and weekly results (streaks).
      // Played seasons oldest-first, so we can chain regular-season results
      // chronologically for cross-season streaks and recent form.
      const playedOldestFirst = [...chain].filter(seasonHasData).reverse();

      const [perSeasonRosters, txStatsPerSeason, lastPlayoffs, weeklyPerSeason] =
        await Promise.all([
          Promise.all(chain.map((s) => getRosters(s.league_id))),
          Promise.all(chain.map((s) => getTransactionStatsForSeason(s.league_id))),
          lastPlayed
            ? getPlayoffResults(lastPlayed.league_id)
            : Promise.resolve(new Map()),
          Promise.all(
            playedOldestFirst.map((s) =>
              getWeeklyResults(s.league_id, (s.playoff_week_start || 15) - 1)
            )
          ),
        ]);

      // Concatenate each roster's regular-season results across all seasons.
      const formByRoster = new Map<number, ("W" | "L" | "T")[]>();
      weeklyPerSeason.forEach((m) =>
        m.forEach((arr, rid) => {
          const cur = formByRoster.get(rid) ?? [];
          cur.push(...arr);
          formByRoster.set(rid, cur);
        })
      );

      // Sum dynasty records across all seasons.
      const dyn = new Map<number, { w: number; l: number }>();
      perSeasonRosters.forEach((rosters) =>
        rosters.forEach((r) => {
          const d = dyn.get(r.roster_id) ?? { w: 0, l: 0 };
          d.w += r.wins;
          d.l += r.losses;
          dyn.set(r.roster_id, d);
        })
      );

      // Sum trades + moves across seasons from the transaction log.
      const trades = new Map<number, number>();
      const moves = new Map<number, number>();
      txStatsPerSeason.forEach((m) =>
        m.forEach((v, k) => {
          trades.set(k, (trades.get(k) ?? 0) + v.trades);
          moves.set(k, (moves.get(k) ?? 0) + v.moves);
        })
      );

      // Last season rank (by record) and points-for rank (for "producing").
      const rankByRoster = new Map<number, number>();
      const pfRankByRoster = new Map<number, number>();
      const N = currentFull.length;
      if (lastPlayedIndex >= 0) {
        const lr = perSeasonRosters[lastPlayedIndex];
        [...lr]
          .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
          .forEach((r, i) => rankByRoster.set(r.roster_id, i + 1));
        [...lr]
          .sort((a, b) => b.fpts - a.fpts)
          .forEach((r, i) => pfRankByRoster.set(r.roster_id, i + 1));
      }

      const cards: TeamCard[] = currentFull.map((r) => {
        const u = r.owner_id ? byId.get(r.owner_id) : undefined;
        const d = dyn.get(r.roster_id) ?? { w: 0, l: 0 };
        const starterAges = r.starters
          .map((pid) => (players[pid] as PlayerInfo | undefined)?.age)
          .filter((a): a is number => typeof a === "number");
        const avgStarterAge =
          starterAges.length > 0
            ? starterAges.reduce((s, a) => s + a, 0) / starterAges.length
            : null;
        const pfRank = pfRankByRoster.get(r.roster_id);
        const producing =
          pfRank != null ? pfRank <= Math.ceil(N / 2) : null;

        return {
          rosterId: r.roster_id,
          teamName: u?.team_name || u?.display_name || "Unknown",
          handle: u?.display_name || "unknown",
          logo: u?.teamAvatar ?? null,
          lastSeason: lastPlayed?.season ?? null,
          lastRank: rankByRoster.get(r.roster_id) ?? null,
          place: (lastPlayoffs.get(r.roster_id) as { place?: number } | undefined)
            ?.place ?? null,
          dynastyW: d.w,
          dynastyL: d.l,
          currentW: r.wins,
          currentL: r.losses,
          streak: trailingStreak(formByRoster.get(r.roster_id) ?? []),
          form: (formByRoster.get(r.roster_id) ?? []).slice(-5),
          trades: trades.get(r.roster_id) ?? 0,
          moves: moves.get(r.roster_id) ?? 0,
          faab: faabBudget > 0 ? faabBudget - r.waiverBudgetUsed : null,
          avgStarterAge,
          producing,
        };
      });

      cards.sort((a, b) => (a.lastRank ?? 99) - (b.lastRank ?? 99));
      setTeams(cards);
      setLoading(false);
    }
    load();
  }, [leagueId]);

  if (loading) {
    return <p className="py-10 text-center text-zinc-400">Loading teams…</p>;
  }

  return (
    <>
      {lastSeasonLabel && (
        <p className="mb-3 text-xs text-zinc-500">
          Ranked by {lastSeasonLabel} finish
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => (
          <Link
            key={t.rosterId}
            href={`teams/${t.rosterId}`}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-emerald-700 hover:bg-zinc-800/50"
          >
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
          </Link>
        ))}
      </div>
    </>
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

// Soccer-style form guide: a row of colored boxes for the last 5 games,
// oldest on the left, most recent on the right.
function FormGuide({ form }: { form: ("W" | "L" | "T")[] }) {
  return (
    <div className="flex gap-1">
      {form.map((r, i) => {
        const cls =
          r === "W"
            ? "bg-emerald-500"
            : r === "L"
            ? "bg-red-500"
            : "bg-zinc-500";
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

function medalEmoji(place: number) {
  return place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "";
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

