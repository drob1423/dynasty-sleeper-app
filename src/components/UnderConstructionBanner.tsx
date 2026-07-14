// A reusable "under construction" caution banner for tabs that aren't built yet.
export default function UnderConstructionBanner() {
  return (
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
  );
}
