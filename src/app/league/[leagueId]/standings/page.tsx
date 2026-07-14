"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getSeasonChain,
  getStandings,
  getPlayoffResults,
  enrichRows,
  aggregateByOwner,
  aggregateByFranchise,
  seasonHasData,
  type SleeperLeagueDetail,
  type EnrichedRow,
  type SeasonStandings,
  type Medal,
} from "@/lib/sleeper";

type Lens = "owner" | "franchise";

export default function LeaguePage() {
  const router = useRouter();
  const params = useParams();
  const leagueId = params.leagueId as string;

  const [loading, setLoading] = useState(true);
  const [lens, setLens] = useState<Lens>("owner");

  const [seasons, setSeasons] = useState<SleeperLeagueDetail[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Enriched rows (standings + playoffs) for EVERY season, keyed by league_id.
  const [rowsBySeason, setRowsBySeason] = useState<Record<string, EnrichedRow[]>>(
    {}
  );

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      const chain = await getSeasonChain(leagueId);
      setSeasons(chain);

      const played = chain.filter(seasonHasData);
      setSelected(new Set(played.map((s) => s.league_id)));

      // For every season, fetch standings + playoff bracket and merge them.
      const results = await Promise.all(
        chain.map(async (s) => {
          const [standings, playoffs] = await Promise.all([
            getStandings(s.league_id),
            seasonHasData(s)
              ? getPlayoffResults(s.league_id)
              : Promise.resolve(new Map()),
          ]);
          return [s.league_id, enrichRows(standings, playoffs)] as const;
        })
      );
      setRowsBySeason(Object.fromEntries(results));
      setLoading(false);
    }
    load();
  }, [leagueId, router]);

  const allSeasonStandings: SeasonStandings[] = useMemo(
    () =>
      seasons.map((s) => ({
        season: s.season,
        rows: rowsBySeason[s.league_id] ?? [],
      })),
    [seasons, rowsBySeason]
  );

  const statSeasonStandings: SeasonStandings[] = useMemo(
    () =>
      seasons
        .filter((s) => selected.has(s.league_id) && seasonHasData(s))
        .map((s) => ({
          season: s.season,
          rows: rowsBySeason[s.league_id] ?? [],
        })),
    [seasons, selected, rowsBySeason]
  );

  const ownerRows = useMemo(
    () => aggregateByOwner(statSeasonStandings),
    [statSeasonStandings]
  );
  const franchiseRows = useMemo(
    () => aggregateByFranchise(statSeasonStandings, allSeasonStandings),
    [statSeasonStandings, allSeasonStandings]
  );

  const selectedCount = statSeasonStandings.length;

  function toggleSeason(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return <p className="py-10 text-center text-zinc-400">Loading league history…</p>;
  }

  // Map the current lens's aggregated rows into the shared table shape.
  const allTimeRows: AllTimeTableRow[] =
    lens === "owner"
      ? ownerRows.map((r) => ({
          key: r.key,
          name: r.managerName,
          handle: r.displayName,
          seasons: r.seasons,
          reg: formatRecord(r.wins, r.losses, r.ties),
          playoff: `${r.playoffWins}-${r.playoffLosses}`,
          mainApps: r.mainApps,
          pf: r.pointsFor,
          pa: r.pointsAgainst,
          medals: r.medals,
          isCommish: r.isCommissioner,
        }))
      : franchiseRows.map((r) => ({
          key: r.key,
          name: r.currentManagerName,
          handle: r.currentDisplayName,
          subtitle: r.timeline,
          seasons: r.seasons,
          reg: formatRecord(r.wins, r.losses, r.ties),
          playoff: `${r.playoffWins}-${r.playoffLosses}`,
          mainApps: r.mainApps,
          pf: r.pointsFor,
          pa: r.pointsAgainst,
          medals: r.medals,
          isCommish: r.isCommissioner,
        }));

  return (
    <>
      <div>
        {/* Season selector */}
        <div className="mb-5">
          <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            Seasons included
          </p>
          <div className="flex flex-wrap gap-2">
            {seasons.map((s) => {
              const hasData = seasonHasData(s);
              const isOn = selected.has(s.league_id);
              return (
                <button
                  key={s.league_id}
                  disabled={!hasData}
                  onClick={() => toggleSeason(s.league_id)}
                  className={[
                    "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                    !hasData
                      ? "cursor-not-allowed border-zinc-800 text-zinc-600"
                      : isOn
                      ? "border-emerald-500 bg-emerald-500 text-black"
                      : "border-zinc-700 text-zinc-300 hover:border-zinc-500",
                  ].join(" ")}
                >
                  {s.season}
                  {!hasData && " (not started)"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Owner / Franchise toggle */}
        <div className="mb-6 inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          <ToggleButton active={lens === "owner"} onClick={() => setLens("owner")}>
            By Owner
          </ToggleButton>
          <ToggleButton
            active={lens === "franchise"}
            onClick={() => setLens("franchise")}
          >
            By Franchise
          </ToggleButton>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          {lens === "owner"
            ? "Stats follow the manager. A new manager who took over a team starts fresh."
            : "Stats follow the team slot across every owner it's ever had."}
        </p>

        {/* All-time table */}
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-white">
            All-Time Standings
            <span className="ml-2 text-sm font-normal text-zinc-500">
              {selectedCount} season{selectedCount !== 1 && "s"}
            </span>
          </h2>
          {selectedCount === 0 ? (
            <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
              Select at least one season above.
            </p>
          ) : (
            <AllTimeTable rows={allTimeRows} />
          )}
        </section>

        {/* Per-year breakdown */}
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Season by Season
          </h2>
          <div className="space-y-6">
            {statSeasonStandings.map((s) => (
              <div key={s.season}>
                <p className="mb-2 text-sm font-medium text-zinc-300">{s.season}</p>
                <SeasonTable rows={s.rows} />
              </div>
            ))}
          </div>
        </section>

        <p className="mt-6 text-xs text-zinc-600">
          Reg = regular-season record · Playoff = medal-game record · PO Apps =
          playoff appearances · PF/PA = points for/against · the smaller number
          under PF is points behind the top scorer · 🥇🥈🥉 = season finish.
        </p>
      </div>
    </>
  );
}

function formatRecord(w: number, l: number, t: number) {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function medalEmoji(place: number) {
  return place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "";
}

function Medals({ medals }: { medals: Medal[] }) {
  if (medals.length === 0) return null;
  // Chronological — earliest season first.
  const sorted = [...medals].sort(
    (a, b) => a.season.localeCompare(b.season) || a.place - b.place
  );
  return (
    <span className="inline-flex flex-wrap gap-x-1.5 gap-y-0.5 align-middle">
      {sorted.map((m, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-0.5"
          title={`${m.season}: ${ordinal(m.place)} place`}
        >
          {medalEmoji(m.place)}
          <span className="text-[11px] font-medium text-zinc-400">
            &rsquo;{m.season.slice(2)}
          </span>
        </span>
      ))}
    </span>
  );
}

function ordinal(n: number) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-zinc-200",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ---- All-time table (rich columns) ----------------------------------------
type AllTimeTableRow = {
  key: string;
  name: string;
  handle: string;
  subtitle?: string;
  seasons: number;
  reg: string;
  playoff: string;
  mainApps: number;
  pf: number;
  pa: number;
  medals: Medal[];
  isCommish: boolean;
};

function AllTimeTable({ rows }: { rows: AllTimeTableRow[] }) {
  // The top scorer sets the baseline; everyone else shows their deficit.
  const topPF = rows.length ? Math.max(...rows.map((r) => r.pf)) : 0;

  // A left border marks where each column group begins.
  const groupEdge = "border-l border-zinc-800";

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          {/* Group header row */}
          <tr className="text-xs uppercase tracking-wide text-zinc-400">
            <th className="px-4 pt-3 pb-1" />
            <th className="px-2 pt-3 pb-1" />
            <th
              className={`px-2 pt-3 pb-1 text-center font-semibold text-emerald-400 ${groupEdge}`}
              colSpan={3}
            >
              Regular Season
            </th>
            <th
              className={`px-2 pt-3 pb-1 text-center font-semibold text-amber-400 ${groupEdge}`}
              colSpan={2}
            >
              Playoffs
            </th>
          </tr>
          {/* Sub-header row */}
          <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 pb-3 font-medium">Team</th>
            <th className="px-2 pb-3 text-center font-medium">Szn</th>
            <th className={`px-2 pb-3 text-center font-medium ${groupEdge}`}>
              Record
            </th>
            <th className="px-2 pb-3 text-right font-medium">PF</th>
            <th className="px-2 pb-3 text-right font-medium">PA</th>
            <th className={`px-2 pb-3 text-center font-medium ${groupEdge}`}>
              Record
            </th>
            <th className="px-2 pb-3 text-center font-medium">Apps</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const back = topPF - row.pf;
            return (
              <tr key={row.key} className="border-b border-zinc-800/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-zinc-500">
                      {i + 1}
                    </span>
                    <span className="font-medium text-white">@{row.handle}</span>
                  </div>
                  {row.medals.length > 0 && (
                    <div className="mt-1 pl-7">
                      <Medals medals={row.medals} />
                    </div>
                  )}
                  {row.subtitle && (
                    <div className="mt-1 pl-7 text-xs text-zinc-600">
                      {row.subtitle}
                    </div>
                  )}
                </td>
                <td className="px-2 py-3 text-center align-top text-zinc-300">
                  {row.seasons}
                </td>
                <td
                  className={`px-2 py-3 text-center align-top font-medium text-white ${groupEdge}`}
                >
                  {row.reg}
                </td>
                <td className="px-2 py-3 text-right align-top text-zinc-300">
                  <div>{row.pf.toFixed(1)}</div>
                  <div
                    className={`mt-0.5 text-xs ${
                      back < 0.05 ? "text-zinc-600" : "text-red-400"
                    }`}
                    title="Points behind the top scorer"
                  >
                    {back < 0.05 ? "—" : `-${back.toFixed(1)}`}
                  </div>
                </td>
                <td className="px-2 py-3 text-right align-top text-zinc-400">
                  {row.pa.toFixed(1)}
                </td>
                <td
                  className={`px-2 py-3 text-center align-top font-medium text-white ${groupEdge}`}
                >
                  {row.playoff}
                </td>
                <td className="px-2 py-3 text-center align-top text-zinc-300">
                  {row.mainApps}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- Per-season table (regular standings + that year's finish) ------------
function SeasonTable({ rows }: { rows: EnrichedRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Team</th>
            <th className="px-4 py-3 text-center font-medium">Record</th>
            <th className="px-4 py-3 text-right font-medium">PF</th>
            <th className="px-4 py-3 text-right font-medium">PA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.roster_id} className="border-b border-zinc-800/60 last:border-0">
              <td className="px-4 py-3 text-zinc-500">{i + 1}</td>
              <td className="px-4 py-3">
                <div className="font-medium text-white">
                  @{r.displayName}
                  {r.place && (
                    <span className="ml-1" title={`${ordinal(r.place)} place`}>
                      {medalEmoji(r.place)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500">{r.managerName}</div>
              </td>
              <td className="px-4 py-3 text-center font-medium text-white">
                {formatRecord(r.wins, r.losses, r.ties)}
              </td>
              <td className="px-4 py-3 text-right text-zinc-300">
                {r.pointsFor.toFixed(1)}
              </td>
              <td className="px-4 py-3 text-right text-zinc-400">
                {r.pointsAgainst.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
