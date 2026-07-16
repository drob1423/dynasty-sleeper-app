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

## Power Rankings — weekly & all-time algorithms

Two ranking engines that go beyond raw win/loss standings.

- **Weekly power rankings** — a composite score updated each week. Candidate
  inputs:
  - past results (recent form, not just record)
  - roster performance (how the roster is actually producing)
  - start/sit performance (lineup decisions — points left on the bench vs.
    optimal)
  - age (dynasty trajectory / window)
  - strength of schedule (who they've played, who's next)
  - impactful injuries (weight down teams missing key startable players)
- **All-time power rankings** — a franchise-strength ranking across the league's
  full history (championships, sustained finishes, head-to-head, longevity).
- Open questions: how to weight each factor, whether the weekly model is
  predictive (projected strength) or descriptive (earned this week), and how much
  the "impactful injuries" input leans on the taxi/IR + positional-strength work
  already in place.

## Start/Sit Proficiency — week-to-week line graph on a manager's profile

A line graph on a manager's profile tracking how good their lineup decisions
are, week over week.

- Each week, plot a **start/sit proficiency** point — how close their submitted
  lineup came to their **optimal lineup** (the best possible starters from their
  roster that week).
- Candidate metrics for the y-axis: **points left on the bench** vs. optimal, or
  a **% of optimal** (actual starter points ÷ optimal lineup points) so weeks are
  comparable regardless of scoring environment.
- Line graph shows the **trend** — is this manager getting sharper at start/sit
  calls over the season, or leaving more points on the bench?
- Pairs with the **Power Rankings** "start/sit performance" input above — this is
  the profile-level visualization of that same signal.
- Open questions: single-season vs. all-time x-axis (and how to segment by
  season), whether to overlay the league average line for context, how to handle
  bye weeks / partial weeks, and whether to surface a summary stat (season avg %
  of optimal) alongside the graph.

## Known deferred items

- **D/ST + K in the positional needs/strengths engine.** `roomStrength`
  currently covers QB/RB/WR/TE/FLEX only, so kickers and defenses don't get a
  rank, tier, or need. Fold them in.
