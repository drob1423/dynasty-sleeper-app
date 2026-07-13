// ---------------------------------------------------------------------------
// Sleeper API helper
// ---------------------------------------------------------------------------
// Everything that talks to Sleeper's public API lives here, so the rest of the
// app never has to know the URLs or data shapes. Sleeper's API needs no login
// or key — it's fully public. Base URL: https://api.sleeper.app/v1
// ---------------------------------------------------------------------------

const BASE = "https://api.sleeper.app/v1";

// League "type" values Sleeper uses in league.settings.type
export const LEAGUE_TYPE = {
  REDRAFT: 0,
  KEEPER: 1,
  DYNASTY: 2,
} as const;

// The shape of a Sleeper user we care about
export type SleeperUser = {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
};

// The shape of a league, trimmed to what we use
export type SleeperLeague = {
  league_id: string;
  name: string;
  season: string;
  type: number; // 0 redraft, 1 keeper, 2 dynasty
  total_rosters: number;
  previous_league_id: string | null;
  avatar: string | null;
};

// Look up a user by their Sleeper username.
// Returns the user, or null if that username doesn't exist.
export async function getUser(username: string): Promise<SleeperUser | null> {
  const clean = username.trim();
  if (!clean) return null;

  const res = await fetch(`${BASE}/user/${encodeURIComponent(clean)}`);
  if (!res.ok) return null;

  const data = await res.json();
  // Sleeper returns null (not a 404) when the username isn't found
  if (!data || !data.user_id) return null;

  return {
    user_id: data.user_id,
    username: data.username,
    display_name: data.display_name,
    avatar: data.avatar ?? null,
  };
}

// Get all NFL leagues a user is in for a given season.
export async function getLeagues(
  userId: string,
  season: string
): Promise<SleeperLeague[]> {
  const res = await fetch(`${BASE}/user/${userId}/leagues/nfl/${season}`);
  if (!res.ok) return [];

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((l) => ({
    league_id: l.league_id,
    name: l.name,
    season: l.season,
    type: l.settings?.type ?? 0,
    total_rosters: l.total_rosters,
    previous_league_id: l.previous_league_id ?? null,
    avatar: l.avatar ?? null,
  }));
}

// Convenience: only the dynasty leagues for a user in a season.
export async function getDynastyLeagues(
  userId: string,
  season: string
): Promise<SleeperLeague[]> {
  const all = await getLeagues(userId, season);
  return all.filter((l) => l.type === LEAGUE_TYPE.DYNASTY);
}
