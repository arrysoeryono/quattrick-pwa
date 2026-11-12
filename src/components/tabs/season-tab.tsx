"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { LeagueTable } from "@/components/league-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fixtureWeek, transferWindow } from "@/lib/game/career";
import { formatDate, posBadgeClass, ratingColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CalendarDays, Star, Trophy } from "lucide-react";
import type { Fixture, TotwEntry } from "@/lib/game/types";

/* ============================================================
 * Season tab — standings / fixtures / calendar / stats / TOTW
 * ============================================================ */

type StatMetric = "goals" | "assists" | "cleanSheets";

interface StatEntry {
  id: number;
  name: string;
  teamShort: string;
  position: string;
  goals: number;
  assists: number;
  cleanSheets: number;
}

/** Calendar weeks are derived from the user's fixture rounds at runtime. */

const CUP_ROUND_LABELS: Record<number, string> = {
  100: "Quarter-final",
  101: "Semi-final",
  102: "Final",
};

const STAT_VIEWS: { key: StatMetric; label: string; empty: string }[] = [
  { key: "goals", label: "Goals", empty: "No goals scored yet this season." },
  { key: "assists", label: "Assists", empty: "No assists recorded yet this season." },
  { key: "cleanSheets", label: "Clean Sheets", empty: "No clean sheets kept yet this season." },
];

const TAB_VIEWS = [
  { value: "standings", label: "Standings" },
  { value: "fixtures", label: "Fixtures" },
  { value: "calendar", label: "Calendar" },
  { value: "stats", label: "Stats" },
  { value: "totw", label: "TOTW" },
] as const;

function isPlayed(f: Fixture): boolean {
  return f.played && f.homeGoals !== null && f.awayGoals !== null;
}

/* ---------------- presentational rows ---------------- */

function CupTieRow({
  fixture,
  clubId,
  shortNames,
}: {
  fixture: Fixture;
  clubId: number;
  shortNames: Map<number, string>;
}) {
  const played = isPlayed(fixture);
  const involvesUser = fixture.homeId === clubId || fixture.awayId === clubId;
  const homeShort = shortNames.get(fixture.homeId) ?? "?";
  const awayShort = shortNames.get(fixture.awayId) ?? "?";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
        involvesUser && "bg-emerald-500/10",
      )}
      aria-label={`Cup tie: ${homeShort} vs ${awayShort}${played ? `, ${fixture.homeGoals}-${fixture.awayGoals}` : `, ${formatDate(fixture.date)}`}`}
    >
      <p className="min-w-0 flex-1 truncate text-xs">
        <span className={cn(fixture.homeId === clubId ? "font-semibold text-emerald-300" : "text-slate-300")}>
          {homeShort}
        </span>
        <span className="text-slate-600"> vs </span>
        <span className={cn(fixture.awayId === clubId ? "font-semibold text-emerald-300" : "text-slate-300")}>
          {awayShort}
        </span>
      </p>
      {played ? (
        <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-slate-100">
          {fixture.homeGoals}-{fixture.awayGoals}
        </span>
      ) : (
        <span className="shrink-0 text-[10px] text-slate-500">{formatDate(fixture.date)}</span>
      )}
    </div>
  );
}

function FixtureRow({
  fixture,
  clubId,
  shortNames,
}: {
  fixture: Fixture;
  clubId: number;
  shortNames: Map<number, string>;
}) {
  const played = isPlayed(fixture);
  const isCup = (fixture.competition ?? "league") === "cup";
  const userHome = fixture.homeId === clubId;
  const userGoals = userHome ? fixture.homeGoals ?? 0 : fixture.awayGoals ?? 0;
  const oppGoals = userHome ? fixture.awayGoals ?? 0 : fixture.homeGoals ?? 0;
  const result = played ? (userGoals > oppGoals ? "W" : userGoals === oppGoals ? "D" : "L") : null;
  const homeShort = shortNames.get(fixture.homeId) ?? "?";
  const awayShort = shortNames.get(fixture.awayId) ?? "?";

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5",
        played ? "border-slate-800/60 opacity-75" : "border-slate-800",
      )}
      aria-label={`${isCup ? fixture.tieLabel ?? "Cup tie" : `Matchday ${fixture.round}`}: ${homeShort} versus ${awayShort}${result ? `, result ${result === "W" ? "win" : result === "D" ? "draw" : "loss"}` : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              isCup ? "bg-amber-500/15 text-amber-400" : "bg-slate-800 text-slate-400",
            )}
          >
            {isCup ? fixture.tieLabel ?? "Cup tie" : `Matchday ${fixture.round}`}
          </span>
          <span className="truncate text-[10px] text-slate-500">{formatDate(fixture.date)}</span>
        </div>
        {result && (
          <span
            className={cn(
              "flex h-6 min-w-6 shrink-0 items-center justify-center rounded border px-1 text-[10px] font-black",
              result === "W"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : result === "D"
                  ? "border-slate-600 bg-slate-800/60 text-slate-300"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-400",
            )}
            aria-label={result === "W" ? "Win" : result === "D" ? "Draw" : "Loss"}
          >
            {result}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        <span className={cn("flex-1 truncate text-right", userHome ? "font-semibold text-emerald-300" : "text-slate-300")}>
          {homeShort}
        </span>
        <span className="shrink-0 font-mono text-sm font-black tabular-nums text-slate-100">
          {played ? `${fixture.homeGoals} - ${fixture.awayGoals}` : "vs"}
        </span>
        <span className={cn("flex-1 truncate", !userHome ? "font-semibold text-emerald-300" : "text-slate-300")}>
          {awayShort}
        </span>
      </div>
    </div>
  );
}

function CalendarEvent({
  fixture,
  clubId,
  shortNames,
}: {
  fixture: Fixture;
  clubId: number;
  shortNames: Map<number, string>;
}) {
  const played = isPlayed(fixture);
  const isCup = (fixture.competition ?? "league") === "cup";
  const userHome = fixture.homeId === clubId;
  const oppId = userHome ? fixture.awayId : fixture.homeId;
  const userGoals = userHome ? fixture.homeGoals ?? 0 : fixture.awayGoals ?? 0;
  const oppGoals = userHome ? fixture.awayGoals ?? 0 : fixture.homeGoals ?? 0;

  return (
    <div className="flex items-center gap-1.5">
      {isCup && (
        <span className="shrink-0 rounded bg-amber-500/15 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-amber-400">
          {fixture.tieLabel ?? "Cup"}
        </span>
      )}
      <p className="min-w-0 truncate text-[11px] text-slate-300">
        vs {shortNames.get(oppId) ?? "?"} <span className="text-slate-500">({userHome ? "H" : "A"})</span>
        {played && (
          <span className="ml-1.5 font-mono font-bold tabular-nums text-slate-400">
            {userGoals}-{oppGoals}
          </span>
        )}
      </p>
    </div>
  );
}

function StatRow({ rank, entry, metric }: { rank: number; entry: StatEntry; metric: StatMetric }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-2"
      aria-label={`${rank}. ${entry.name}, ${entry[metric]} ${metric === "cleanSheets" ? "clean sheets" : metric}`}
    >
      <span
        className={cn(
          "w-5 shrink-0 text-center font-mono text-[11px] font-bold tabular-nums",
          rank <= 3 ? "text-emerald-400" : "text-slate-500",
        )}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-200">{entry.name}</p>
        <p className="text-[10px] text-slate-500">{entry.teamShort}</p>
      </div>
      <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold", posBadgeClass(entry.position))}>
        {entry.position}
      </span>
      <span className="w-6 shrink-0 text-right font-mono text-sm font-black tabular-nums text-emerald-400">
        {entry[metric]}
      </span>
    </div>
  );
}

function TotwRow({ entry, shortNames }: { entry: TotwEntry; shortNames: Map<number, string> }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 py-2"
      aria-label={`${entry.playerName}, rating ${entry.rating.toFixed(1)}${entry.motm ? ", Man of the Match" : ""}`}
    >
      <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold", posBadgeClass(entry.position))}>
        {entry.position}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-200">{entry.playerName}</p>
        <p className="text-[10px] text-slate-500">{shortNames.get(entry.teamId) ?? "?"}</p>
      </div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-500">
        {entry.goals}G {entry.assists}A
      </span>
      <span className={cn("w-8 shrink-0 text-right font-mono text-sm font-black tabular-nums", ratingColor(entry.rating))}>
        {entry.rating.toFixed(1)}
      </span>
      {entry.motm && (
        <span
          className="flex shrink-0 items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-400"
          aria-label="Man of the Match"
        >
          <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" aria-hidden /> MOTM
        </span>
      )}
    </div>
  );
}

/* ---------------- main component ---------------- */

export function SeasonTab() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const [statView, setStatView] = useState<StatMetric>("goals");

  const shortNames = useMemo(
    () => new Map((dataset?.teams ?? []).map((t) => [t.id, t.shortName])),
    [dataset],
  );

  const userFixtures = useMemo(() => {
    if (!game) return [] as Fixture[];
    return game.fixtures
      .filter((f) => f.homeId === game.clubId || f.awayId === game.clubId)
      .sort((a, b) => a.round - b.round || a.date.localeCompare(b.date));
  }, [game]);

  /* calendar weeks derived from the user's fixture rounds (fixtureWeek maps
     cup ties to fractional pseudo-weeks — floored onto their host week) */
  const calendarWeeks = useMemo(() => {
    const ws = new Set<number>();
    for (const f of userFixtures) ws.add(Math.floor(fixtureWeek(f)));
    const maxW = ws.size > 0 ? Math.max(...ws) : 20;
    return Array.from({ length: Math.max(maxW, 1) }, (_, i) => i + 1);
  }, [userFixtures]);

  const cupGroups = useMemo(() => {
    if (!game) return [] as { round: number; label: string; ties: Fixture[] }[];
    const byRound = new Map<number, Fixture[]>();
    for (const f of game.fixtures) {
      if ((f.competition ?? "league") !== "cup") continue;
      const list = byRound.get(f.round) ?? [];
      list.push(f);
      byRound.set(f.round, list);
    }
    return [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, ties]) => ({
        round,
        label: ties[0]?.tieLabel ?? CUP_ROUND_LABELS[round] ?? `Cup round ${round}`,
        ties,
      }));
  }, [game]);

  /** League-wide board merged with the user's squad seasonStats (for players absent from the board). */
  const statEntries = useMemo<StatEntry[]>(() => {
    if (!game || !dataset) return [];
    const board = game.leagueBoard ?? {};
    const playerById = new Map(dataset.players.map((p) => [p.id, p]));
    const out: StatEntry[] = [];
    for (const [key, stat] of Object.entries(board)) {
      const p = playerById.get(Number(key));
      if (!p) continue;
      out.push({
        id: p.id,
        name: p.name,
        teamShort: shortNames.get(p.teamId) ?? "?",
        position: p.position,
        goals: stat.goals,
        assists: stat.assists,
        cleanSheets: stat.cleanSheets,
      });
    }
    for (const p of game.players) {
      if (board[String(p.id)]) continue;
      out.push({
        id: p.id,
        name: p.name,
        teamShort: shortNames.get(p.teamId) ?? "?",
        position: p.position,
        goals: p.seasonStats.goals,
        assists: p.seasonStats.assists,
        cleanSheets: p.seasonStats.cleanSheets,
      });
    }
    return out;
  }, [game, dataset, shortNames]);

  const leaders = useMemo(
    () =>
      statEntries
        .filter((e) => e[statView] > 0)
        .sort((a, b) => b[statView] - a[statView] || a.name.localeCompare(b.name))
        .slice(0, 10),
    [statEntries, statView],
  );

  if (!game || !dataset) return null;

  const clubId = game.clubId;
  const leagueName = dataset.leagues.find((l) => l.id === game.leagueId)?.name ?? "League";
  /* current week = the round of the next unplayed fixture (rounds are the
     season's real calendar; weekOfSeason() counts every fixture and would
     inflate on larger leagues) */
  const nextUserFixture = [...game.fixtures]
    .filter((f) => !f.played && (f.homeId === clubId || f.awayId === clubId))
    .sort((a, b) => fixtureWeek(a) - fixtureWeek(b))[0];
  const currentWeek = nextUserFixture ? Math.floor(fixtureWeek(nextUserFixture)) : null;
  const playedCount = userFixtures.filter(isPlayed).length;
  const activeStatView = STAT_VIEWS.find((v) => v.key === statView) ?? STAT_VIEWS[0];

  return (
    <Tabs defaultValue="standings" className="gap-3">
      {/* horizontally scrollable view switcher (44px+ touch targets) */}
      <div className="overflow-x-auto">
        <TabsList
          aria-label="Season views"
          className="h-[54px] w-max min-w-full border border-slate-800 bg-slate-950 p-1"
        >
          {TAB_VIEWS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="min-w-[68px] px-3 text-xs data-[state=active]:text-emerald-400"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {/* ------------------------------ standings ------------------------------ */}
      <TabsContent value="standings" className="space-y-3">
        <section aria-label="League standings">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{leagueName}</h2>
            <span className="text-[10px] text-slate-600">Season {game.season}</span>
          </div>
          <LeagueTable dataset={dataset} leagueId={game.leagueId} fixtures={game.fixtures} clubId={clubId} />
        </section>

        <section aria-label="Domestic cup" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Trophy className="h-3.5 w-3.5 text-amber-400" aria-hidden /> Domestic Cup
          </h2>
          {cupGroups.length === 0 ? (
            <p className="text-[11px] text-slate-600">No cup ties scheduled yet.</p>
          ) : (
            <div className="space-y-3">
              {cupGroups.map((group) => (
                <div key={group.round}>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{group.label}</p>
                  <div className="space-y-1">
                    {group.ties.map((f) => (
                      <CupTieRow key={f.id} fixture={f} clubId={clubId} shortNames={shortNames} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </TabsContent>

      {/* ------------------------------ fixtures ------------------------------ */}
      <TabsContent value="fixtures" className="space-y-2">
        <section aria-label="Fixtures and results">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fixtures &amp; results</h2>
            <span className="text-[10px] text-slate-600">
              {playedCount}/{userFixtures.length} played
            </span>
          </div>
          <div className="space-y-1.5">
            {userFixtures.map((f) => (
              <FixtureRow key={f.id} fixture={f} clubId={clubId} shortNames={shortNames} />
            ))}
            {userFixtures.length === 0 && (
              <p className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-center text-[11px] text-slate-600">
                No fixtures scheduled.
              </p>
            )}
          </div>
        </section>
      </TabsContent>

      {/* ------------------------------ calendar ------------------------------ */}
      <TabsContent value="calendar" className="space-y-2">
        <section aria-label="Season calendar">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <CalendarDays className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Season calendar
            </h2>
            <span className="text-[10px] text-slate-600">Now: {currentWeek ? `Round ${currentWeek}` : "Season complete"}</span>
          </div>
          <div className="space-y-1.5">
            {calendarWeeks.map((week) => {
              /* fixtureWeek() maps cup ties to fractional pseudo-weeks (7.5 / 13.5);
                 the integer calendar attaches them to their host week (the final at 19 matches directly). */
              const ties = userFixtures.filter((f) => Math.floor(fixtureWeek(f)) === week);
              const win = transferWindow(week);
              const isNow = week === currentWeek;
              return (
                <div
                  key={week}
                  aria-current={isNow ? "date" : undefined}
                  aria-label={`Week ${week}${isNow ? ", current week" : ""}`}
                  className={cn(
                    "rounded-lg border p-2",
                    isNow ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-800 bg-slate-950/40",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "w-10 shrink-0 pt-0.5 font-mono text-[11px] font-bold tabular-nums",
                        isNow ? "text-emerald-400" : "text-slate-500",
                      )}
                    >
                      Wk {week}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {ties.length === 0 && <p className="text-[11px] text-slate-600">Free week</p>}
                      {ties.map((f) => (
                        <CalendarEvent key={f.id} fixture={f} clubId={clubId} shortNames={shortNames} />
                      ))}
                    </div>
                    {win.deadline ? (
                      <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                        Deadline day
                      </span>
                    ) : win.open ? (
                      <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                        Transfer window
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </TabsContent>

      {/* ------------------------------ stats ------------------------------ */}
      <TabsContent value="stats" className="space-y-2">
        <section aria-label="League statistics" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">League leaders</h2>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-1">
            {STAT_VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setStatView(v.key)}
                aria-pressed={statView === v.key}
                className={cn(
                  "h-11 rounded-md text-[11px] font-semibold transition-colors",
                  statView === v.key ? "bg-emerald-500/15 text-emerald-400" : "text-slate-500 hover:text-slate-300",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-1.5">
            {leaders.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-slate-600">{activeStatView.empty}</p>
            ) : (
              leaders.map((entry, i) => (
                <StatRow key={entry.id} rank={i + 1} entry={entry} metric={statView} />
              ))
            )}
          </div>
        </section>
      </TabsContent>

      {/* ------------------------------ TOTW ------------------------------ */}
      <TabsContent value="totw" className="space-y-2">
        <section aria-label="Team of the week" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          {!game.totw || game.totw.entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Star className="h-6 w-6 text-slate-700" aria-hidden />
              <p className="text-xs font-semibold text-slate-400">Play a matchday to generate the Team of the Week</p>
              <p className="text-[11px] text-slate-600">The best XI from the latest round appears here.</p>
            </div>
          ) : (
            <>
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Star className="h-3.5 w-3.5 text-amber-400" aria-hidden /> Team of the Week — Wk {game.totw.week}
              </h2>
              <div className="space-y-1.5">
                {game.totw.entries.map((entry) => (
                  <TotwRow key={`${entry.playerId}-${entry.position}`} entry={entry} shortNames={shortNames} />
                ))}
              </div>
            </>
          )}
        </section>
      </TabsContent>
    </Tabs>
  );
}
