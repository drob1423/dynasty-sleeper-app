import UnderConstructionBanner from "@/components/UnderConstructionBanner";

export default function MatchupsTab() {
  return (
    <div className="space-y-4">
      <UnderConstructionBanner />
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold text-white">Matchups</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Coming soon: weekly scores, the all-time head-to-head matrix, the Luck
          Index, and weekly pick&apos;em.
        </p>
      </div>
    </div>
  );
}
