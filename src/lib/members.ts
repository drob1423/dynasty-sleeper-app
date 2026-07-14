// ---------------------------------------------------------------------------
// App membership — who has signed up for the site. Each signup mirrors its
// verified Sleeper identity into the public `profiles` table (see supabase),
// which is readable by anyone, so we can show leaguemates who's on the app.
// ---------------------------------------------------------------------------

import { supabase } from "./supabase";

// Of the given Sleeper user_ids (a league's owners), return the subset that
// have an app account. Scoped to the passed ids so we never download the whole
// members table — the `sleeper_user_id` unique index makes this an indexed
// lookup that stays fast no matter how large the app grows.
export async function getMemberSleeperIds(
  ownerIds: (string | null | undefined)[]
): Promise<Set<string>> {
  const ids = [...new Set(ownerIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("profiles")
    .select("sleeper_user_id")
    .in("sleeper_user_id", ids);
  if (error || !data) return new Set();
  return new Set(
    data
      .map((r) => r.sleeper_user_id as string | null)
      .filter((id): id is string => !!id)
  );
}
