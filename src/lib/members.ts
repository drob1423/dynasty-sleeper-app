// ---------------------------------------------------------------------------
// App membership — who has signed up for the site. Each signup mirrors its
// verified Sleeper identity into the public `profiles` table (see supabase),
// which is readable by anyone, so we can show leaguemates who's on the app.
// ---------------------------------------------------------------------------

import { supabase } from "./supabase";

// The set of Sleeper user_ids that have an app account.
export async function getMemberSleeperIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("sleeper_user_id");
  if (error || !data) return new Set();
  return new Set(
    data
      .map((r) => r.sleeper_user_id as string | null)
      .filter((id): id is string => !!id)
  );
}
