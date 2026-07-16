// Shared positional Needs / Strong chip rows — the trade-scouting read used on
// both the Rivals card and the My Team tab, so the two never drift apart.

import { shortPos, type TradeProfile } from "./tradeProfile";

export function NeedsStrengths({
  profile,
  className,
}: {
  profile?: TradeProfile;
  className?: string;
}) {
  if (!profile || (profile.needs.length === 0 && profile.strengths.length === 0)) {
    return null;
  }
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <ChipRow
        label="Needs"
        empty="Roster looks set"
        chips={profile.needs.map((n) => n.label)}
        tone="need"
      />
      <ChipRow
        label="Strong"
        empty="No standout position"
        chips={profile.strengths.map((s) => shortPos(s.pos))}
        tone="strong"
      />
    </div>
  );
}

function ChipRow({
  label,
  chips,
  tone,
  empty,
}: {
  label: string;
  chips: string[];
  tone: "need" | "strong";
  empty: string;
}) {
  const chipClass =
    tone === "need"
      ? "border-red-900/70 bg-red-950/40 text-red-300"
      : "border-emerald-900/70 bg-emerald-950/40 text-emerald-300";
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 w-12 shrink-0 text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
        {label}
      </span>
      {chips.length ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${chipClass}`}
            >
              {c}
            </span>
          ))}
        </div>
      ) : (
        <span className="mt-0.5 text-xs text-zinc-600">{empty}</span>
      )}
    </div>
  );
}
