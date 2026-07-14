import Link from "next/link";

// Home tab — the league's front page. Placeholder for now.
export default function LeagueHome() {
  return (
    <div className="space-y-4">
      {/* Under-construction caution banner */}
      <div
        role="status"
        className="flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/40 px-4 py-3"
      >
        <span className="text-2xl" aria-hidden="true">
          🚧
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-300">
            Under construction
          </p>
          <p className="text-xs text-amber-200/70">
            This page is still being built — check back soon.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold text-white">League Home</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Coming soon: champion banner, this week&apos;s matchups, recent trades
          &amp; waivers, a power-ranking snapshot, and the latest trash-talk
          headline.
        </p>
      </div>
      <p className="text-sm text-zinc-500">
        For now, head to the{" "}
        <Link href="standings" className="text-emerald-400 hover:text-emerald-300">
          Standings
        </Link>{" "}
        tab.
      </p>
    </div>
  );
}
