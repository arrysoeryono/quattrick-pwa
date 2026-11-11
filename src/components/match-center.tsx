"use client";

import { useMemo } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LiveMatch } from "@/components/live-match";
import { buildUserMatchTeam, aiFormationFor, getUserNextFixture } from "@/lib/game/advance";
import { DRILLS, runPreMatchDrills } from "@/lib/game/drills";
import type { DrillGrade } from "@/lib/game/types";
import { buildAiTeamConfig, estimateClubStrength } from "@/lib/game/season";
import { isDerbyFixture } from "@/lib/game/career";
import { formatDate, formatMoney, ordinal, ratingColor } from "@/lib/format";
import { computeTable } from "@/lib/game/season";
import { cn } from "@/lib/utils";
import { Award, CalendarDays, Flame, Goal, Play, Star, Swords, TrendingUp, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const GRADE_TEXT: Record<DrillGrade, string> = {
  A: "text-emerald-400",
  B: "text-teal-300",
  C: "text-amber-400",
  D: "text-rose-400",
};

export function MatchCenter() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const liveFixtureId = useAppStore((s) => s.liveFixtureId);
  const liveSnapshot = useAppStore((s) => s.liveSnapshot);
  const liveResult = useAppStore((s) => s.liveResult);
  const lastAdvance = useAppStore((s) => s.lastAdvance);
  const kickoff = useAppStore((s) => s.kickoff);
  const clearLiveResult = useAppStore((s) => s.clearLiveResult);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const update = useAppStore((s) => s.update);

  const nextFixture = useMemo(() => (game ? getUserNextFixture(game) : null), [game]);

  const roundResults = useMemo(() => {
    if (!game || !liveResult) return [];
    const playedRound = game.fixtures.find((f) => f.id === liveResult.fixtureId)?.round;
    return game.lastRoundResults;
  }, [game, liveResult]);

  if (!game || !dataset) return null;

  /* ---------- live match ---------- */
  if (liveFixtureId && liveSnapshot) {
    return <LiveMatch />;
  }

  const userTeam = dataset.teams.find((t) => t.id === game.clubId);
  const leagueTeams = dataset.teams.filter((t) => t.leagueId === game.leagueId);
  const table = computeTable(leagueTeams, game.fixtures);
  const position = table.findIndex((r) => r.teamId === game.clubId) + 1;
  const squadInjuries = game.players.filter((p) => p.injuryWeeks > 0).length;

  const handleKickoff = () => {
    if (!nextFixture || !userTeam) return;
    const userHome = nextFixture.homeId === game.clubId;
    const oppId = userHome ? nextFixture.awayId : nextFixture.homeId;
    const oppTeam = dataset.teams.find((t) => t.id === oppId);
    if (!oppTeam) return;
    const userConfig = buildUserMatchTeam(game, userTeam);
    const oppConfig = buildAiTeamConfig(dataset, oppTeam, aiFormationFor(oppId));
    kickoff(nextFixture.id, userHome ? userConfig : oppConfig, userHome ? oppConfig : userConfig);
  };

  /* ---------- full-time summary ---------- */
  if (liveResult) {
    const userHome = liveResult.homeId === game.clubId;
    const myGoals = userHome ? liveResult.homeGoals : liveResult.awayGoals;
    const oppGoals = userHome ? liveResult.awayGoals : liveResult.homeGoals;
    const oppName = dataset.teams.find((t) => t.id === (userHome ? liveResult.awayId : liveResult.homeId))?.name ?? "Opponent";
    const scorers = liveResult.events.filter((e) => e.type === "goal");
    const motm = liveResult.ratings.find((r) => r.playerId === liveResult.motmPlayerId);
    const motmPlayer = motm ? game.players.find((p) => p.id === motm.playerId) ?? null : null;
    const outcome = myGoals > oppGoals ? "Victory" : myGoals === oppGoals ? "Draw" : "Defeat";

    return (
      <section aria-label="Match summary" className="space-y-3">
        <div className={cn(
          "rounded-xl border p-4 text-center",
          myGoals > oppGoals ? "border-emerald-500/40 bg-emerald-500/10" : myGoals === oppGoals ? "border-slate-700 bg-slate-800/40" : "border-rose-500/40 bg-rose-500/10",
        )}>
          <p className={cn("text-xs font-bold uppercase tracking-widest", myGoals > oppGoals ? "text-emerald-400" : myGoals === oppGoals ? "text-slate-400" : "text-rose-400")}>
            Full Time: {outcome}
          </p>
          <p className="mt-2 font-mono text-4xl font-black text-slate-50 tabular-nums">
            {myGoals} <span className="text-slate-600">-</span> {oppGoals}
          </p>
          <p className="mt-1 text-sm text-slate-400">vs {oppName} ({userHome ? "Home" : "Away"})</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Goals</p>
          {scorers.length === 0 ? (
            <p className="text-xs text-slate-500">No goals in this match.</p>
          ) : (
            <ul className="space-y-1.5">
              {scorers.map((g, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                  <Goal className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                  <span className="font-mono text-slate-500 w-8">{g.minute}&apos;</span>
                  <span className="truncate">{g.text}</span>
                </li>
              ))}
            </ul>
          )}
          <Separator className="my-3 bg-slate-800" />
          <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-slate-400">
            <div><p className="font-mono text-slate-200">{liveResult.stats.possession[0]}% · {liveResult.stats.possession[1]}%</p>Possession</div>
            <div><p className="font-mono text-slate-200">{liveResult.stats.shots[0]} · {liveResult.stats.shots[1]}</p>Shots</div>
            <div><p className="font-mono text-slate-200">{liveResult.stats.xg[0]} · {liveResult.stats.xg[1]}</p>xG</div>
          </div>
          {liveResult.shotLog && liveResult.shotLog.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">xG timeline</p>
              <div className="flex items-end gap-px h-16 rounded-lg bg-slate-950 border border-slate-800 p-1.5" aria-label="Shot timeline chart">
                {liveResult.shotLog.map((s, i) => (
                  <div
                    key={i}
                    title={`${s.minute}' ${s.side} xG ${s.xg}${s.scored ? " GOAL" : ""}`}
                    className={cn(
                      "flex-1 rounded-sm",
                      s.side === "home" ? "bg-emerald-500/70" : "bg-sky-500/70",
                      s.scored && (s.side === "home" ? "bg-emerald-300" : "bg-sky-300"),
                    )}
                    style={{ height: `${Math.max(8, Math.min(100, s.xg * 160))}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-slate-600 mt-0.5"><span>0&apos;</span><span>45&apos;</span><span>90&apos;</span></div>
            </div>
          )}
          {motmPlayer && motm && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
              <Award className="h-4 w-4 text-amber-400" aria-hidden />
              <span className="text-xs text-amber-200">MOTM: <strong>{motmPlayer.name}</strong> <span className={ratingColor(motm.rating)}>{motm.rating.toFixed(1)}</span></span>
            </div>
          )}
        </div>

        {lastAdvance?.seasonEnded && lastAdvance.seasonSummary && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-sm font-bold text-amber-300">Season {game.season - 1} complete!</p>
            <p className="text-xs text-amber-200/80 mt-1">
              Finished {ordinal(lastAdvance.seasonSummary.position)} with {lastAdvance.seasonSummary.points} points.
              {lastAdvance.seasonSummary.achieved ? " Board objective achieved." : " Board objective missed."}
              {lastAdvance.seasonSummary.trophies.length > 0 && ` Trophies: ${lastAdvance.seasonSummary.trophies.join(", ")}`}
            </p>
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Around the league</p>
          <ul className="space-y-1.5">
            {game.lastRoundResults.map((r, i) => {
              const h = dataset.teams.find((t) => t.id === r.homeId);
              const a = dataset.teams.find((t) => t.id === r.awayId);
              return (
                <li key={i} className={cn("flex justify-between text-xs", r.homeId === game.clubId || r.awayId === game.clubId ? "text-emerald-300 font-semibold" : "text-slate-400")}>
                  <span className="truncate">{h?.shortName} vs {a?.shortName}</span>
                  <span className="font-mono tabular-nums">{r.homeGoals}-{r.awayGoals}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <Button className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold" onClick={() => { clearLiveResult(); setActiveTab("home"); }}>
          <TrendingUp className="h-4 w-4 mr-2" aria-hidden />
          Continue to Dashboard
        </Button>
      </section>
    );
  }

  /* ---------- next fixture ---------- */
  return (
    <section aria-label="Match center" className="space-y-3">
      {/* v4.2 sacked modal */}
      <Dialog open={Boolean(game.sacked)}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-left">You have been sacked</DialogTitle>
            <DialogDescription className="text-left">
              The board has terminated your contract after a poor run of results. Rebuild your career at a new club.
            </DialogDescription>
          </DialogHeader>
          <Button
            className="w-full h-11 bg-emerald-500 text-slate-950 font-bold"
            onClick={() => {
              useAppStore.getState().update((g) => { g.sacked = false; });
              void useAppStore.getState().startCareer(game.managerName, game.clubId, game.difficulty);
            }}
            aria-label="Start fresh career at a new club"
          >
            Rebuild your career (new save)
          </Button>
        </DialogContent>
      </Dialog>

      {nextFixture ? (
        <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 to-slate-900 p-4">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 gap-1">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {nextFixture.competition === "cup" ? (nextFixture.tieLabel ?? "Cup tie") : `Matchday ${nextFixture.round}`} · {formatDate(nextFixture.date)}
            </Badge>
            <Badge variant="outline" className="border-slate-700 text-slate-400">{nextFixture.homeId === game.clubId ? "Home" : "Away"}</Badge>
          </div>
          {(() => {
            const userHome = nextFixture.homeId === game.clubId;
            const oppId = userHome ? nextFixture.awayId : nextFixture.homeId;
            const opp = dataset.teams.find((t) => t.id === oppId);
            const oppTable = table.findIndex((r) => r.teamId === oppId) + 1;
            const isCup = nextFixture.competition === "cup";
            const derby = isDerbyFixture(game, nextFixture.homeId, nextFixture.awayId) && !isCup;
            const oppSquad = dataset.players.filter((p) => p.teamId === oppId).sort((a, b) => b.overallRating - a.overallRating);
            const keyPlayer = oppSquad[0];
            const oppStrength = Math.round(estimateClubStrength(dataset, oppId) + ({ amateur: -3, pro: 0, legend: 3 }[game.difficulty] ?? 0));
            return (
              <>
                <div className="mt-3 flex items-center justify-center gap-4">
                  <div className="text-center flex-1">
                    <div className="mx-auto h-10 w-10 rounded-lg bg-emerald-600 flex items-center justify-center text-[10px] font-black text-white">{userTeam?.shortName}</div>
                    <p className="mt-1.5 text-xs font-bold text-slate-200">{userTeam?.shortName}</p>
                    <p className="text-[10px] text-slate-500">{ordinal(position)} in table</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">VS</p>
                  </div>
                  <div className="text-center flex-1">
                    <div className="mx-auto h-10 w-10 rounded-lg bg-slate-700 flex items-center justify-center text-[10px] font-black text-white">{opp?.shortName}</div>
                    <p className="mt-1.5 text-xs font-bold text-slate-200">{opp?.shortName}</p>
                    <p className="text-[10px] text-slate-500">{isCup ? nextFixture.tieLabel : `${ordinal(oppTable)} in table`}</p>
                  </div>
                </div>
                {(isCup || derby) && (
                  <div className="mt-2 flex justify-center gap-1.5">
                    {isCup && (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-400 gap-1">
                        <Trophy className="h-3 w-3" aria-hidden /> {nextFixture.tieLabel ?? "Cup tie"}
                      </Badge>
                    )}
                    {derby && (
                      <Badge variant="outline" className="border-rose-500/50 text-rose-400 gap-1">
                        <Flame className="h-3 w-3" aria-hidden /> DERBY DAY
                      </Badge>
                    )}
                  </div>
                )}
                {opp && (
                  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5" aria-label="Pre-match scout report">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Scout report</p>
                    <p className="text-[11px] text-slate-300">
                      {opp.shortName} · strength <span className="font-mono font-bold text-slate-100">{oppStrength}</span> · {aiFormationFor(oppId)}
                      {keyPlayer && (
                        <> · key man <span className="font-bold text-amber-300">{keyPlayer.name}</span> ({keyPlayer.overallRating} OVR)</>
                      )}
                    </p>
                  </div>
                )}

                {/* v4.7 — pre-match drills */}
                {(() => {
                  const drills = game.preMatchDrills;
                  const drillsReady = Boolean(drills && drills.fixtureRound === nextFixture.round);
                  const runDrills = () => {
                    update((g) => {
                      g.preMatchDrills = runPreMatchDrills(g, nextFixture.round);
                    });
                  };
                  return (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5" aria-label="Pre-match drills">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Pre-match drills</p>
                        {drillsReady && drills && drills.grants.length > 0 && (
                          <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-400 gap-0.5">
                            <Star className="h-2.5 w-2.5" aria-hidden /> {drills.grants.length} special PlayStyle{drills.grants.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                      {!drillsReady ? (
                        <>
                          <p className="text-[11px] text-slate-500 mb-2">
                            Run the session once. Grade A/B/C drills unlock special PlayStyles for this match only.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full border-sky-600/50 text-sky-400 font-bold"
                            onClick={runDrills}
                            aria-label="Run pre-match drills session"
                          >
                            <Flame className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                            Run drills session
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-1.5">
                            {drills!.grades.map(({ drill, grade }) => {
                              const def = DRILLS.find((d) => d.id === drill);
                              return (
                                <div key={drill} className="rounded-md border border-slate-800 bg-slate-950 p-1.5 text-center" title={def?.desc}>
                                  <p className="text-[9px] text-slate-500 truncate">{def?.name.replace(" drill", "")}</p>
                                  <p className={cn("text-base font-black leading-tight", GRADE_TEXT[grade])}>{grade}</p>
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-1.5 space-y-1">
                            {drills!.grants.map(({ playerId, styleId }) => {
                              const p = game.players.find((x) => x.id === playerId);
                              const def = DRILLS.find((d) => d.styleId === styleId);
                              return (
                                <div key={`${playerId}-${styleId}`} className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1" title={def?.styleDesc}>
                                  <span className="text-[11px] font-semibold text-slate-200 truncate">{p?.name ?? "Player"}</span>
                                  <span className="text-[10px] font-bold text-amber-300 shrink-0">★ {def?.styleName}</span>
                                </div>
                              );
                            })}
                            {drills!.grants.length === 0 && (
                              <p className="text-[10px] text-slate-600">Grades were too low — no special PlayStyles unlocked this time.</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <p className="text-[9px] text-slate-600">Applies to this match only, expires at full time.</p>
                            <button
                              type="button"
                              onClick={runDrills}
                              className="text-[10px] text-slate-500 underline hover:text-slate-300"
                              aria-label="Run drills again"
                            >
                              Run again
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </>
            );
          })()}
          <Button
            size="lg"
            className="mt-4 w-full h-12 text-base font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950"
            onClick={handleKickoff}
            aria-label="Kick off match"
          >
            <Play className="h-5 w-5 mr-2 fill-slate-950" aria-hidden />
            Kick Off
          </Button>
          {squadInjuries > 0 && (
            <p className="mt-2 text-center text-[11px] text-amber-400">{squadInjuries} injured player{squadInjuries > 1 ? "s" : ""} unavailable</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center">
          <p className="text-sm text-slate-400">No fixtures remaining.</p>
        </div>
      )}
    </section>
  );
}
