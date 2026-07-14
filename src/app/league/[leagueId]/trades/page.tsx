import UnderConstructionBanner from "@/components/UnderConstructionBanner";

export default function TradesTab() {
  return (
    <div className="space-y-4">
      <UnderConstructionBanner />
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold text-white">Trade Central</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Coming soon: the full trade ledger, post-hoc trade grades, best/worst
          trader awards, and league-wide buy-low targets.
        </p>
      </div>
    </div>
  );
}
