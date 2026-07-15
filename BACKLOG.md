# Backlog — future ideas

Running list of features we want to build but haven't scheduled yet. These are
captured so they don't get lost between sessions; nothing here is committed to a
timeline.

## Team Captains — weekly "Captains Score" competition

A head-to-head side-game layered on top of the normal matchup.

- Each week, every team picks **one captain per position group** (QB / RB / WR /
  TE / etc.).
- Your captain at each position goes **head-to-head against the opponent's
  captain** at the same position that week.
- It's essentially **betting on who your top player at each position will be** —
  you win a position if your pick outscores their pick.
- Weekly result is a per-position tally (e.g. win 3 of 5 position duels).
- Open questions: does it feed a season-long standings? any tie-breakers? do
  captains have to be starters, or can you gamble on a bench guy popping off?

## Fantasy Payroll — equal salary cap, manager-assigned player values

Turn each manager's own valuations into a league-wide market signal.

- Every team gets the **same salary cap** (e.g. $100).
- The manager **allocates that cap across their roster** — the dollars on a
  player = **how much value they place on him** (revealed preference).
- Powerful for trades: compare **your payroll vs. a rival's** to spot where they
  over/under-value a player, and see who a team is truly built around.
- Pairs directly with the positional Needs/Strengths engine: **needs** show what
  a team lacks, **payroll** shows what they'd be willing to part with.
- Open questions: cap enforcement (hard vs. soft), whether values are private or
  public, how/when they can be edited, and whether to surface an aggregate
  "market value" per player across all managers' allocations.

## Known deferred items

- **D/ST + K in the positional needs/strengths engine.** `roomStrength`
  currently covers QB/RB/WR/TE/FLEX only, so kickers and defenses don't get a
  rank, tier, or need. Fold them in.
