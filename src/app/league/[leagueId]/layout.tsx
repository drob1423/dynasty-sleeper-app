"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getLeague, leagueLogoUrl } from "@/lib/sleeper";

// The league workspace tabs. `segment: ""` is the Home tab (the base route).
const TABS: { label: string; segment: string }[] = [
  { label: "Home", segment: "" },
  { label: "My Team", segment: "my-team" },
  { label: "Rivals", segment: "teams" },
  { label: "Standings", segment: "standings" },
  { label: "Matchups", segment: "matchups" },
  { label: "Trade Central", segment: "trades" },
  { label: "History", segment: "history" },
  { label: "Room Ranks", segment: "insights" },
  { label: "Commissioner", segment: "commish" },
];

export default function LeagueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const leagueId = params.leagueId as string;
  const base = `/league/${leagueId}`;

  const [leagueName, setLeagueName] = useState("");
  const [leagueLogo, setLeagueLogo] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      const league = await getLeague(leagueId);
      if (league) {
        setLeagueName(league.name);
        setLeagueLogo(leagueLogoUrl(league.avatar));
      }
    }
    load();
  }, [leagueId, router]);

  function isActive(segment: string) {
    const href = segment ? `${base}/${segment}` : base;
    if (!segment) return pathname === base;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans">
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        {/* Header */}
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← All leagues
        </Link>
        <div className="mt-2 flex items-center gap-3">
          {leagueLogo && (
            <img
              src={leagueLogo}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <h1 className="text-2xl font-bold text-white">{leagueName || " "}</h1>
        </div>

        {/* Tab nav */}
        <nav className="mt-4 -mx-4 overflow-x-auto px-4">
          <div className="flex gap-1 border-b border-zinc-800">
            {TABS.map((tab) => {
              const href = tab.segment ? `${base}/${tab.segment}` : base;
              const active = isActive(tab.segment);
              return (
                <Link
                  key={tab.segment}
                  href={href}
                  className={[
                    "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "border-emerald-500 text-white"
                      : "border-transparent text-zinc-400 hover:text-zinc-200",
                  ].join(" ")}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Tab content */}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
