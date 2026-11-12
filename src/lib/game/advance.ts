import type {
  Dataset,
  Difficulty,
  GameState,
  MatchResult,
  NewsItem,
  PlayerRow,
  PlayerState,
  TeamRow,
} from "./types";
import { DIFFICULTY_META } from "./types";
import { computeTable, estimateClubStrength, generateFixtures, quickSimulateScore } from "./season";
import { getFormation } from "./formations";
import {
  applySeasonDecay,
  autoSquadRole,
  computePlayStyles,
  generateRegen,
  recalcPotential,
  recomputeOverall,
  shouldRetire,
  tickRetrain,
  tickMentorship,
  weeklyDevelopment,
} from "./development";
import { computeMarketValue, computeSalary, mulberry32 } from "./defaultData";
import { attrValue, computeOverall, migratePlayerAttributes } from "./attributes";
import { autoPickLineup } from "./tactics";
import { defaultTactics, migrateTactics } from "./tacticPresets";
import {
  ACHIEVEMENTS,
  academyIntake,
  applyBoardResult,
  applyCupProgression,
  cupChampion,
  cupTargetFor,
  drawCupRound1,
  fixtureWeek,
  progressCup,
  pushNews,
  pushSocial,
  resolveInboxMessage,
  runTransferWorld,
  seasonBoardReview,
  socialAfterMatch,
  tickScouting,
  uid,
  unlockAchievement,
  userCupOutcome,
  isDerbyFixture,
} from "./career";

const rng = mulberry32(Date.now() & 0xffffffff);

export const BASE_SEASON_START = Date.UTC(2025, 6, 12); // 12 July 2025

export const SAVE_VERSION = 4;

/* ---------------- Coaching staff (master spec levels) ---------------- */

export const COACH_LEVELS = {
  Novice: { mult: 1.05, wage: 8000, label: "+5% XP" },
  Accomplished: { mult: 1.15, wage: 18000, label: "+15% XP" },
  Expert: { mult: 1.3, wage: 40000, label: "+30% XP" },
} as const;

export function coachMultiplier(level: string | undefined): number {
  return COACH_LEVELS[(level as keyof typeof COACH_LEVELS) ?? "Accomplished"]?.mult ?? 1.15;
}

export function seasonStartDate(season: number): Date {
  return new Date(BASE_SEASON_START + (season - 2025) * 364 * 24 * 3600 * 1000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toPlayerState(p: PlayerRow): PlayerState {
  return {
    ...p,
    sharpness: 68,
    morale: 65,
    stamina: 100,
    form: 0,
    injuryWeeks: 0,
    contractYears: 2 + (p.id % 3),
    squadRole: "Rotation",
    trainingPlan: { focus: "balanced", intensity: "normal" },
    retrain: null,
    seasonStats: { apps: 0, goals: 0, assists: 0, ratingSum: 0, cleanSheets: 0 },
    careerStats: { apps: 0, goals: 0, assists: 0 },
    devPath: null,
    mentor: null,
  };
}

function objectiveFor(reputation: number, teamsCount: number): number {
  if (reputation >= 78) return 1;
  if (reputation >= 72) return Math.min(3, teamsCount);
  if (reputation >= 64) return 5;
  if (reputation >= 58) return 8;
  return Math.max(6, teamsCount - 2);
}

export function createCareerState(managerName: string, clubId: number, dataset: Dataset, difficulty: Difficulty = "pro"): GameState {
  const team = dataset.teams.find((t) => t.id === clubId)!;
  const leagueTeams = dataset.teams.filter((t) => t.leagueId === team.leagueId);
  const squad = dataset.players.filter((p) => p.teamId === clubId).map(toPlayerState);
  squad.forEach((p) => (p.squadRole = autoSquadRole(p, squad)));
  const formationName = "4-3-3 Holding";
  const start = seasonStartDate(2025);
  const fixtures = [...generateFixtures(leagueTeams.map((t) => t.id), start), ...drawCupRound1(dataset, team.leagueId, start.getTime())];
  const target = objectiveFor(team.reputation, leagueTeams.length);

  return {
    version: SAVE_VERSION,
    managerName: managerName.trim() || "The Gaffer",
    clubId,
    leagueId: team.leagueId,
    season: 2025,
    currentDate: isoDate(start),
    transferBudget: team.transferBudget,
    wageBudget: team.wageBudget,
    players: squad,
    tactics: defaultTactics(formationName),
    staff: { coachLevel: "Accomplished" },
    lineup: autoPickLineup(squad, formationName),
    fixtures,
    news: [
      {
        id: uid(),
        date: isoDate(start),
        type: "season",
        title: `${managerName} appointed at ${team.name}`,
        body: `The board welcomes the new manager. Season objective: finish top ${target} of the ${dataset.leagues.find((l) => l.id === team.leagueId)?.name}. Transfer budget: $${(team.transferBudget / 1e6).toFixed(1)}M. Difficulty: ${DIFFICULTY_META[difficulty].label}.`,
      },
    ],
    seasonObjective: { targetPosition: target, cupTarget: cupTargetFor(team.reputation) },
    history: [],
    lastRoundResults: [],
    difficulty,
    boardConfidence: 60,
    managerRep: 40,
    inbox: [],
    social: [
      {
        id: uid(),
        date: isoDate(start),
        handle: "Club Announcer",
        tag: "@official",
        text: `Welcome to ${team.shortName}, ${managerName.trim() || "The Gaffer"}! Let's make this a season to remember.`,
        tone: "news",
        likes: 820,
      },
    ],
    aiTransfers: [],
    scoutedIds: [],
    scoutingQueue: [],
    facilityLevel: 1,
    achievements: [],
    soundEnabled: true,
    sacked: false,
    winStreak: 0,
    unbeatenRun: 0,
    cleanSheetRun: 0,
    seasonShots: 0,
    tacticPresets: [],
    teamTraining: { balance: 50 },
    preMatchDrills: null,
  };
}

/* ---------------- helpers for match day ---------------- */

/** Migrate a legacy save (v1-v4.0) to the current v4.1+ shape, in place. */
export function migrateGameState(raw: GameState): GameState {
  const game = raw as GameState;
  game.tactics = migrateTactics(game.tactics, game.tactics?.formationName ?? "4-3-3 Holding");
  if (!game.staff) game.staff = { coachLevel: "Accomplished" };
  // v4.7: tactic presets, team training balance, pre-match drills
  if (!Array.isArray(game.tacticPresets)) game.tacticPresets = [];
  if (!game.teamTraining || typeof game.teamTraining.balance !== "number") game.teamTraining = { balance: 50 };
  if (game.preMatchDrills === undefined) game.preMatchDrills = null;
  for (const p of game.players) {
    if (!p.trainingPlan) p.trainingPlan = { focus: "balanced", intensity: "normal" };
    if (p.retrain === undefined) p.retrain = null;
    if (p.devPath === undefined) p.devPath = null;
    if (p.mentor === undefined) p.mentor = null;
    // v4.5: goalkeepers now carry their own attribute set
    const mig = migratePlayerAttributes(p.position, p.attributes);
    if (mig.changed) {
      p.attributes = mig.attributes;
      p.overallRating = computeOverall(p.attributes, p.position);
    }
  }
  if (game.difficulty === undefined) game.difficulty = "pro";
  if (game.boardConfidence === undefined) game.boardConfidence = 60;
  if (game.managerRep === undefined) game.managerRep = 40;
  if (game.inbox === undefined) game.inbox = [];
  if (game.social === undefined) game.social = [];
  if (game.aiTransfers === undefined) game.aiTransfers = [];
  if (game.scoutedIds === undefined) game.scoutedIds = [];
  if (game.scoutingQueue === undefined) game.scoutingQueue = [];
  if (game.facilityLevel === undefined) game.facilityLevel = 1;
  if (game.achievements === undefined) game.achievements = [];
  if (game.soundEnabled === undefined) game.soundEnabled = true;
  if (game.sacked === undefined) game.sacked = false;
  if (game.winStreak === undefined) game.winStreak = 0;
  if (game.unbeatenRun === undefined) game.unbeatenRun = 0;
  if (game.cleanSheetRun === undefined) game.cleanSheetRun = 0;
  if (game.seasonShots === undefined) game.seasonShots = 0;
  if (game.seasonObjective && game.seasonObjective.cupTarget === undefined) {
    const rep = game.fixtures.length ? 60 : 60;
    game.seasonObjective = { targetPosition: game.seasonObjective.targetPosition, cupTarget: cupTargetFor(rep) };
  }
  game.version = SAVE_VERSION;
  return game;
}

const AI_FORMATIONS = ["4-3-3 Standard", "4-4-2 Flat", "4-2-3-1 Wide", "3-5-2", "4-1-4-1", "4-3-3 Holding", "5-3-2"];

export function aiFormationFor(teamId: number): string {
  return AI_FORMATIONS[Math.abs(teamId) % AI_FORMATIONS.length];
}

export function getUserNextFixture(game: GameState) {
  return (
    [...game.fixtures]
      .filter((f) => !f.played && (f.homeId === game.clubId || f.awayId === game.clubId))
      .sort((a, b) => fixtureWeek(a) - fixtureWeek(b))[0] ?? null
  );
}

export function teamName(dataset: Dataset, id: number): string {
  if (id === -1) return "Free Agent";
  return dataset.teams.find((t) => t.id === id)?.name ?? `Team ${id}`;
}

/* ---------------- weekly advance ---------------- */

export interface AdvanceOutcome {
  game: GameState;
  dataset: Dataset;
  seasonEnded: boolean;
  seasonSummary?: {
    position: number;
    points: number;
    targetPosition: number;
    achieved: boolean;
    trophies: string[];
    sacked: boolean;
    offers: number[];
    cupOutcome: "win" | "final" | "none";
  };
  newAchievements?: string[];
}

function endSeason(game: GameState, dataset: Dataset): { summary: NonNullable<AdvanceOutcome["seasonSummary"]> } {
  const leagueTeams = dataset.teams.filter((t) => t.leagueId === game.leagueId);
  const league = dataset.leagues.find((l) => l.id === game.leagueId);
  const leagueFixtures = game.fixtures.filter((f) => (f.competition ?? "league") === "league");
  const table = computeTable(leagueTeams, leagueFixtures);
  const position = Math.max(1, table.findIndex((r) => r.teamId === game.clubId) + 1);
  const row = table[position - 1];
  const team = dataset.teams.find((t) => t.id === game.clubId)!;
  const diff = DIFFICULTY_META[game.difficulty];
  const trophies: string[] = [];
  if (position === 1 && league) {
    trophies.push(`${league.name} Title ${game.season}`);
    unlockAchievement(game, "league-title");
  }
  const cupOutcome = userCupOutcome(game, dataset);
  if (cupOutcome === "win") {
    trophies.push(`Domestic Cup ${game.season}`);
    unlockAchievement(game, "cup-win");
  }

  const achieved = position <= game.seasonObjective.targetPosition;
  const prize = Math.round(((leagueTeams.length - position + 1) * 1200000 + (team.reputation ?? 50) * 9000) * diff.prizeMult);
  game.transferBudget += prize;

  game.history.push({
    season: game.season,
    position,
    points: row.points,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    gf: row.gf,
    ga: row.ga,
    trophies,
  });

  pushNews(game, "award", `Season ${game.season} complete, finished ${position}${position === 1 ? "st" : position === 2 ? "nd" : position === 3 ? "rd" : "th"}`,
    `Record: ${row.won}W ${row.drawn}D ${row.lost}L, ${row.gf}:${row.ga}. Prize money: $${(prize / 1e6).toFixed(2)}M.`);
  pushNews(game, "season", achieved ? "Board delighted, objective achieved" : "Board disappointed, objective missed",
    achieved
      ? `Target was top ${game.seasonObjective.targetPosition}; you delivered position ${position}.`
      : `Target was top ${game.seasonObjective.targetPosition}; you finished ${position}. Expect higher expectations next season.`);

  /* --- dynamic potential recalculation --- */
  const leagueMatches = leagueFixtures.length / 2;
  for (const p of game.players) {
    const perf = {
      apps: p.seasonStats.apps,
      leagueMatches,
      avgRating: p.seasonStats.apps > 0 ? p.seasonStats.ratingSum / p.seasonStats.apps : 0,
      goals: p.seasonStats.goals,
      assists: p.seasonStats.assists,
      cleanSheets: p.seasonStats.cleanSheets,
      teamTrophies: trophies.length,
    };
    const rec = recalcPotential(p, perf, rng);
    p.potential = Math.min(99, Math.max(p.overallRating, p.potential + rec.delta));
    if (rec.delta !== 0) {
      pushNews(game, "season", `${p.name} potential ${rec.delta > 0 ? "rising" : "falling"}`,
        `Scouts report ${rec.reason}. Potential now ${p.potential}.`);
    }
    if (p.devPath && p.overallRating >= p.potential - 1) {
      pushNews(game, "season", `${p.name} completes his ${p.devPath.replace("-", " ")} evolution`, "The archetype path is maxed out.");
    }
  }

  /* --- aging, decay, retirement --- */
  const retiredUser: PlayerState[] = [];
  for (const p of game.players) {
    p.age += 1;
    applySeasonDecay(p, rng);
    p.marketValue = computeMarketValue(p.overallRating, p.age, p.potential);
    p.contractYears = Math.max(0, p.contractYears - 1);
    p.mentor = null; // squads reshuffle over the summer
    if (shouldRetire(p, rng)) retiredUser.push(p);
  }
  for (const r of retiredUser) {
    pushNews(game, "season", `${r.name} announces retirement`, `After a stellar career, the ${r.age}-year-old ${r.position} hangs up his boots.`);
  }
  game.players = game.players.filter((p) => !retiredUser.some((r) => r.id === p.id));

  /* --- dataset: sync user squad, age AI players, AI retirements -> regens --- */
  let nextId = Math.max(1000, ...dataset.players.map((p) => p.id)) + 1;
  const squadIds = new Set(game.players.map((p) => p.id));
  const retiredIds = new Set(retiredUser.map((r) => r.id));
  const keptPlayers: PlayerRow[] = [];
  const regens: PlayerRow[] = [];
  for (const p of dataset.players) {
    if (retiredIds.has(p.id)) continue; // user retirements removed from world
    if (squadIds.has(p.id)) {
      const sp = game.players.find((g) => g.id === p.id)!;
      keptPlayers.push({
        id: sp.id, teamId: sp.teamId, name: sp.name, age: sp.age, position: sp.position,
        overallRating: sp.overallRating, potential: sp.potential, marketValue: sp.marketValue,
        salary: sp.salary, attributes: sp.attributes,
      });
      continue;
    }
    const aged: PlayerRow = { ...p, age: p.age + 1 };
    if (aged.age >= 31) {
      if (aged.position === "GK" && "reflexes" in aged.attributes) {
        // keepers age in reflexes & mobility, not distribution
        aged.attributes = {
          ...aged.attributes,
          reflexes: Math.max(20, aged.attributes.reflexes - 2),
          speed: Math.max(20, aged.attributes.speed - 1),
        };
      } else {
        aged.attributes = {
          ...aged.attributes,
          pace: Math.max(20, attrValue(aged.attributes, "pace", 50) - 2),
          physical: Math.max(25, attrValue(aged.attributes, "physical", 50) - 2),
        };
      }
      aged.overallRating = computeOverall(aged.attributes, aged.position);
      aged.marketValue = computeMarketValue(aged.overallRating, aged.age, aged.potential);
    }
    if (shouldRetire(aged, rng)) {
      const regen = generateRegen(aged, nextId++, rng);
      regens.push(regen);
      continue;
    }
    keptPlayers.push(aged);
  }

  /* --- regens for user retirees (free agency or back into user's club) --- */
  for (const r of retiredUser) {
    const spawnSameTeam = rng() < 0.45;
    const regen = generateRegen(
      { ...r, teamId: spawnSameTeam ? game.clubId : -1 },
      nextId++,
      rng,
    );
    regens.push(regen);
    if (spawnSameTeam) {
      const st = toPlayerState(regen);
      st.squadRole = "Prospect";
      game.players.push(st);
      pushNews(game, "season", `Academy prospect ${regen.name} emerges`, `The ${regen.age}-year-old ${regen.position} (OVR ${regen.overallRating}, POT ${regen.potential}) has been promoted to the first-team squad.`);
    } else {
      pushNews(game, "season", `Wonderkid ${regen.name} appears in free agency`, `A regenerated ${regen.position} with ${regen.potential} potential is available on the transfer market.`);
    }
  }
  dataset.players = [...keptPlayers, ...regens];

  /* --- v4.3 youth academy intake (facility-scaled) --- */
  const intake = academyIntake(game, dataset, nextId, rng);
  for (const y of intake) {
    pushNews(game, "season", `Academy intake: ${y.name} signs first pro deal`, `The ${y.age}-year-old ${y.position} (OVR ${y.ovr}, POT ${y.pot}) graduates from the youth academy. Facility level ${game.facilityLevel}.`);
    pushSocial(game, { handle: "Academy Watch", tag: "@academywatch", tone: "news", text: `${y.name} is the standout of this year's intake. POT ${y.pot} at ${y.age} years old.` });
    if (y.pot >= 88) unlockAchievement(game, "wonderkid-signing");
  }

  /* --- v4.2 board verdict (may sack the manager) --- */
  const review = seasonBoardReview(game, dataset, achieved, cupOutcome, trophies);

  /* --- reset for new season --- */
  const newSeason = game.season + 1;
  const start = seasonStartDate(newSeason);
  for (const p of game.players) {
    p.seasonStats = { apps: 0, goals: 0, assists: 0, ratingSum: 0, cleanSheets: 0 };
    p.sharpness = 62;
    p.form = 0;
    p.injuryWeeks = 0;
    p.squadRole = autoSquadRole(p, game.players);
    p.salary = Math.max(p.salary, computeSalary(p.overallRating));
  }
  game.season = newSeason;
  game.fixtures = [...generateFixtures(leagueTeams.map((t) => t.id), start), ...drawCupRound1(dataset, game.leagueId, start.getTime())];
  game.currentDate = isoDate(start);
  game.seasonObjective = { targetPosition: objectiveFor(team.reputation ?? 50, leagueTeams.length), cupTarget: cupTargetFor(team.reputation ?? 50) };
  game.lastRoundResults = [];
  game.winStreak = 0;
  game.unbeatenRun = 0;
  game.cleanSheetRun = 0;
  pushNews(game, "season", `Season ${newSeason} kicks off`, `Fresh fixture list released. Objectives: top ${game.seasonObjective.targetPosition} in the league${game.seasonObjective.cupTarget === "win" ? ", win the cup" : game.seasonObjective.cupTarget === "final" ? ", reach the cup final" : ""}.`);

  return { summary: { position, points: row.points, targetPosition: game.seasonObjective.targetPosition, achieved, trophies, sacked: review.sacked, offers: review.offers, cupOutcome } };
}

export function advanceAfterUserMatch(
  gameIn: GameState,
  datasetIn: Dataset,
  userResult: MatchResult,
): AdvanceOutcome {
  const game: GameState = structuredClone(gameIn);
  const dataset: Dataset = structuredClone(datasetIn);
  const squadIds = new Set(game.players.map((p) => p.id));
  const diff = DIFFICULTY_META[game.difficulty] ?? DIFFICULTY_META.pro;
  const achievementsBefore = new Set(game.achievements.map((a) => a.id));
  // v4.7 — drill grants were consumed when the match config was built at kickoff;
  // the temporary special PlayStyles expire after this fixture.
  game.preMatchDrills = null;
  // 0 = All Out Energy (recovery) … 100 = All Out Performance (sharpness)
  const trainingBalance = game.teamTraining?.balance ?? 50;

  /* 1. apply user fixture (league or cup) */
  const fx = game.fixtures.find((f) => f.id === userResult.fixtureId);
  const isCup = fx?.competition === "cup";
  if (fx) {
    fx.played = true;
    fx.homeGoals = userResult.homeGoals;
    fx.awayGoals = userResult.awayGoals;
  }
  const userHome = fx ? fx.homeId === game.clubId : true;
  const userGoals = userHome ? userResult.homeGoals : userResult.awayGoals;
  const oppGoals = userHome ? userResult.awayGoals : userResult.homeGoals;
  const won = userGoals > oppGoals;
  const drew = userGoals === oppGoals;
  const oppId = userHome ? userResult.awayId : userResult.homeId;
  const derby = isDerbyFixture(game, fx?.homeId ?? 0, fx?.awayId ?? 0);

  /* 1b. cup ties may need a shootout winner when drawn */
  if (isCup && fx && drew) {
    // winner resolved in progressCup via cupWinner(); note the drama
    const opponent = userHome ? fx.awayId : fx.homeId;
    pushNews(game, "cup", `Shootout drama vs ${teamName(dataset, opponent)}`, `Level after extra time, settled from the spot.`);
  }

  /* 1c. board reaction + streaks + achievements */
  applyBoardResult(game, won, drew, isCup, derby);
  if (won) {
    game.winStreak += 1;
    unlockAchievement(game, "first-win");
    if (game.winStreak >= 5) unlockAchievement(game, "streak-5");
    if (derby) unlockAchievement(game, "derby-win");
  } else {
    game.winStreak = 0;
  }
  if (won || drew) game.unbeatenRun += 1;
  else game.unbeatenRun = 0;
  if (game.unbeatenRun >= 10) unlockAchievement(game, "unbeaten-10");
  if (oppGoals === 0) {
    game.cleanSheetRun += 1;
    if (game.cleanSheetRun >= 3) unlockAchievement(game, "clean-sheet-3");
  } else {
    game.cleanSheetRun = 0;
  }
  // hat-trick detection
  const goalCounts = new Map<number, number>();
  for (const r of userResult.ratings) goalCounts.set(r.playerId, r.goals);
  for (const [, g] of goalCounts) if (g >= 3) unlockAchievement(game, "hattrick");
  // comeback: trailed at half-time then won
  if (won) {
    const ht = userResult.events.find((e) => e.type === "ht");
    if (ht) {
      const m = ht.text.match(/(\d+)\s*-\s*(\d+)/);
      if (m) {
        const hg = Number(m[1]);
        const ag = Number(m[2]);
        const myHt = userHome ? hg : ag;
        const oppHt = userHome ? ag : hg;
        if (myHt < oppHt) unlockAchievement(game, "comeback");
      }
    }
  }

  /* 2. simulate remaining AI fixtures of this round (+ overdue cup rounds) */
  const round = fx?.round ?? 1;
  const currentWeek = fixtureWeek(fx ?? game.fixtures[0]);
  const roundFixtures = game.fixtures.filter((f) => f.round === round);
  game.lastRoundResults = [];
  const simFixture = (f: (typeof roundFixtures)[number]) => {
    const homeIsUser = f.homeId === game.clubId;
    const hs = estimateClubStrength(dataset, f.homeId) + (homeIsUser ? 0 : diff.aiBoost);
    const as = estimateClubStrength(dataset, f.awayId) + (f.awayId === game.clubId ? 0 : diff.aiBoost);
    const score = quickSimulateScore(hs, as, f.id * 7919 + game.season);
    f.played = true;
    f.homeGoals = score.homeGoals;
    f.awayGoals = score.awayGoals;
    game.lastRoundResults.push({ homeId: f.homeId, awayId: f.awayId, homeGoals: score.homeGoals, awayGoals: score.awayGoals });
  };
  for (const f of roundFixtures) {
    if (f.played) {
      game.lastRoundResults.push({ homeId: f.homeId, awayId: f.awayId, homeGoals: f.homeGoals ?? 0, awayGoals: f.awayGoals ?? 0 });
      continue;
    }
    simFixture(f);
  }
  // overdue rounds (e.g. cup rounds the user was eliminated from) — simulate so the world catches up
  for (const f of [...game.fixtures].filter((x) => !x.played && fixtureWeek(x) < currentWeek)) {
    f.played = true;
    const hs = estimateClubStrength(dataset, f.homeId) + (f.homeId === game.clubId ? 0 : diff.aiBoost);
    const as = estimateClubStrength(dataset, f.awayId) + (f.awayId === game.clubId ? 0 : diff.aiBoost);
    const score = quickSimulateScore(hs, as, f.id * 7919 + game.season);
    f.homeGoals = score.homeGoals;
    f.awayGoals = score.awayGoals;
  }
  // cup bracket progression
  progressCup(game, dataset);
  if (isCup) {
    // report cup progression for the user
    const myRound = fx?.round ?? 100;
    const stillAlive = game.fixtures.some((x) => x.competition === "cup" && !x.played && (x.homeId === game.clubId || x.awayId === game.clubId));
    if (myRound === 100 && stillAlive) applyCupProgression(game, true, false);
    if (myRound === 101 && stillAlive) applyCupProgression(game, true, false);
    if (!stillAlive && (myRound === 100 || myRound === 101)) applyCupProgression(game, false, true);
  }

  /* 3. user squad: stats, form, morale, sharpness, stamina, injuries */
  const ratingsByPlayer = new Map(userResult.ratings.map((r) => [r.playerId, r]));
  const minutesPlayed = new Map<number, number>();
  for (const id of game.lineup) {
    if (id && squadIds.has(id)) minutesPlayed.set(id, 90);
  }

  for (const p of game.players) {
    const r = ratingsByPlayer.get(p.id);
    if (r) {
      p.seasonStats.apps += 1;
      p.careerStats.apps += 1;
      p.seasonStats.goals += r.goals;
      p.careerStats.goals += r.goals;
      p.seasonStats.assists += r.assists;
      p.careerStats.assists += r.assists;
      p.seasonStats.ratingSum += r.rating;
      if (oppGoals === 0 && ["GK", "CB", "LB", "RB", "LWB", "RWB"].includes(p.position)) {
        p.seasonStats.cleanSheets += 1;
      }
      p.form = p.form === 0 ? r.rating : Math.round((p.form * 0.65 + r.rating * 0.35) * 10) / 10;
      p.morale = Math.max(5, Math.min(100, p.morale + (won ? 7 : drew ? 2 : -7) + (r.rating >= 7.5 ? 3 : r.rating < 6 ? -2 : 0)));
      p.sharpness = Math.min(100, p.sharpness + 18);
      p.stamina = Math.max(40, p.stamina - 22);
    } else {
      // team training balance shifts the no-match sharpness drift:
      // All Out Performance keeps match sharpness alive, All Out Energy lets it fade
      p.sharpness = Math.max(0, Math.min(100, p.sharpness - 9 + (trainingBalance - 50) * 0.2));
      p.morale = Math.max(5, Math.min(100, p.morale + (won ? 2 : drew ? 0 : -3)));
    }
  }
  // stamina recovery happens below in weekly tick

  /* 4. injuries from the match */
  for (const pid of userResult.injuries) {
    if (!squadIds.has(pid)) continue;
    const p = game.players.find((x) => x.id === pid)!;
    if (p.injuryWeeks > 0) continue;
    p.injuryWeeks = 1 + Math.floor(rng() * 3);
    pushNews(game, "injury", `${p.name} injured`, `Scans confirm ${p.injuryWeeks} week${p.injuryWeeks > 1 ? "s" : ""} on the sidelines.`);
  }

  /* 5. weekly development tick — training plans, coach level, retraining, mentorship */
  const coachQ = coachMultiplier(game.staff?.coachLevel);
  const staffWage = COACH_LEVELS[game.staff?.coachLevel ?? "Accomplished"].wage;
  game.transferBudget -= staffWage; // weekly staff salary
  for (const p of game.players) {
    const mins = minutesPlayed.get(p.id) ?? 0;
    const mentor = p.mentor ? game.players.find((m) => m.id === p.mentor!.mentorId) ?? null : null;
    if (p.mentor && !mentor) p.mentor = null; // mentor left the club
    const train = weeklyDevelopment(p, mins, coachQ, rng, mentor);
    // All Out Energy recovers up to +5 extra stamina per week, All Out Performance up to -5
    const recover = 14 + (50 - trainingBalance) * 0.1;
    p.stamina = Math.min(100, (p.stamina ?? 100) + recover + train.staminaDelta);
    if (train.injury && p.injuryWeeks === 0) {
      p.injuryWeeks = 1;
      pushNews(game, "injury", `${p.name} injured in training`, "An intense gym session ended with a knock. One week on the sidelines.");
    }
    if (p.retrain) {
      const done = tickRetrain(p);
      if (done) {
        pushNews(game, "season", `${p.name} completes position conversion`, `After weeks of hard work, he is now a natural ${p.position}.`);
        p.squadRole = autoSquadRole(p, game.players);
      }
    }
    if (p.mentor) {
      const finished = tickMentorship(p, mentor, rng);
      if (finished) {
        pushNews(game, "season", `Mentorship complete: ${p.name} has learned from the best`, "The young player has absorbed a season's wisdom in twelve weeks.");
      }
    }
    if (p.injuryWeeks > 0) {
      p.injuryWeeks -= 1;
      if (p.injuryWeeks === 0) pushNews(game, "injury", `${p.name} back in training`, "The medical team has cleared him for selection.");
    }
    if (p.overallRating >= 78 && p.age <= 21) unlockAchievement(game, "academy-star");
    p.squadRole = autoSquadRole(p, game.players);
  }

  /* 5b. scouting queue resolves */
  const revealed = tickScouting(game);
  for (const pid of revealed) {
    const rp = dataset.players.find((x) => x.id === pid);
    if (rp) pushNews(game, "transfer", `Scout report: ${rp.name}`, `Full dossier compiled. ${rp.age}-year-old ${rp.position}, OVR ${rp.overallRating}, POT ${rp.potential}. Now on the transfer list.`);
  }

  /* 6. matchday income */
  const userTeam = dataset.teams.find((t) => t.id === game.clubId);
  if (userTeam && userHome) {
    game.transferBudget += (userTeam.reputation ?? 50) * 2600;
  }

  /* 7. date + match news + social + living transfer market */
  const nextDate = new Date(new Date(game.currentDate + "T12:00:00Z").getTime() + 7 * 24 * 3600 * 1000);
  game.currentDate = isoDate(nextDate);
  const oppName = teamName(dataset, oppId);
  pushNews(
    game,
    "match",
    `${won ? "Victory" : drew ? "Draw" : "Defeat"} ${userGoals}-${oppGoals} vs ${oppName}`,
    `${isCup ? (fx?.tieLabel ?? "Cup tie") : `Round ${round}`}: ${userHome ? "home" : "away"}. xG ${userResult.stats.xg[0]}-${userResult.stats.xg[1]}. Possession ${userResult.stats.possession[0]}%-${userResult.stats.possession[1]}%.`,
  );
  socialAfterMatch(game, won, drew, derby, userGoals, oppGoals, dataset.teams.find((t) => t.id === oppId)?.shortName ?? "them");
  runTransferWorld(game, dataset, rng);

  /* 8. season end? (league complete AND cup complete) */
  const leagueDone = game.fixtures.filter((f) => (f.competition ?? "league") === "league").every((f) => f.played);
  const cupDone = game.fixtures.filter((f) => f.competition === "cup").every((f) => f.played);
  const userHasRemaining = game.fixtures.some((f) => !f.played && (f.homeId === game.clubId || f.awayId === game.clubId));
  const allPlayed = leagueDone && cupDone && !userHasRemaining;
  let seasonSummary: AdvanceOutcome["seasonSummary"];
  if (allPlayed) {
    const res = endSeason(game, dataset);
    seasonSummary = res.summary;
  }
  const newAchievements = game.achievements.map((a) => a.id).filter((id) => !achievementsBefore.has(id));

  return { game, dataset, seasonEnded: allPlayed, seasonSummary, newAchievements };
}

/* ---------------- transfers ---------------- */

export interface TransferCheck {
  ok: boolean;
  reason?: string;
}

export function checkBuyBudget(game: GameState, price: number, wage: number): TransferCheck {
  if (price > game.transferBudget) return { ok: false, reason: "Insufficient transfer budget" };
  const currentWages = game.players.reduce((s, p) => s + p.salary, 0);
  if (currentWages + wage > game.wageBudget) return { ok: false, reason: "Wage budget exceeded (FFP)" };
  return { ok: true };
}

export function buyPlayer(gameIn: GameState, datasetIn: Dataset, playerId: number): { game: GameState; dataset: Dataset; ok: boolean; message: string } {
  const game: GameState = structuredClone(gameIn);
  const dataset: Dataset = structuredClone(datasetIn);
  const idx = dataset.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return { game: gameIn, dataset: datasetIn, ok: false, message: "Player not found" };
  const p = dataset.players[idx];
  const teamId = p.teamId;
  const price = teamId === -1 ? 0 : p.marketValue;
  const check = checkBuyBudget(game, price, p.salary);
  if (!check.ok) return { game: gameIn, dataset: datasetIn, ok: false, message: check.reason ?? "Transfer blocked" };

  game.transferBudget -= price;
  dataset.players.splice(idx, 1);
  const st = toPlayerState(p);
  st.teamId = game.clubId;
  st.contractYears = 3;
  st.squadRole = autoSquadRole(st, game.players);
  game.players.push(st);
  game.lineup = game.lineup; // unchanged; manager adjusts in tactics
  const from = teamName(dataset, teamId);
  pushNews(game, "transfer", `Signed ${p.name} for $${(price / 1e6).toFixed(2)}M`, `The ${p.age}-year-old ${p.position} (OVR ${p.overallRating}, POT ${p.potential}) joins from ${from} on a 3-year deal.`);
  pushSocial(game, { handle: "Fabrizio Romano", tag: "@FabrizioRomano", tone: "news", text: `${p.name} to ${dataset.teams.find((t) => t.id === game.clubId)?.shortName ?? "the club"}, here we go! Confirmed and signed this morning. Medical done.` });
  if (p.potential >= 88) unlockAchievement(game, "wonderkid-signing");
  if (price >= 30_000_000) unlockAchievement(game, "big-signing");
  return { game, dataset, ok: true, message: `${p.name} has joined the club` };
}

export function sellPlayer(gameIn: GameState, datasetIn: Dataset, playerId: number): { game: GameState; dataset: Dataset; ok: boolean; message: string } {
  const game: GameState = structuredClone(gameIn);
  const dataset: Dataset = structuredClone(datasetIn);
  const idx = game.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return { game: gameIn, dataset: datasetIn, ok: false, message: "Player not in squad" };
  const p = game.players[idx];
  const fee = Math.round(p.marketValue * 0.9);
  game.transferBudget += fee;
  game.players.splice(idx, 1);
  game.lineup = game.lineup.map((id) => (id === playerId ? null : id));
  const soldRow: PlayerRow = {
    id: p.id, teamId: -1, name: p.name, age: p.age, position: p.position,
    overallRating: p.overallRating, potential: p.potential, marketValue: p.marketValue,
    salary: p.salary, attributes: p.attributes,
  };
  dataset.players.push(soldRow);
  pushNews(game, "transfer", `${p.name} sold for $${(fee / 1e6).toFixed(2)}M`, `A club from abroad snapped up the ${p.position}. Funds added to the transfer budget.`);
  return { game, dataset, ok: true, message: `${p.name} sold for $${(fee / 1e6).toFixed(2)}M` };
}

/** Keeps lineup valid after squad changes: drops sold players, auto-fills gaps. */
export function refreshLineup(game: GameState): void {
  const ids = new Set(game.players.map((p) => p.id));
  const valid = game.lineup.map((id) => (id && ids.has(id) ? id : null));
  const auto = autoPickLineup(game.players, game.tactics.formationName);
  game.lineup = valid.map((id, i) => (id !== null ? id : auto[i]));
}

/** Rebuild the MatchTeamConfig for the user's club from current lineup. */
export function buildUserMatchTeam(game: GameState, team: TeamRow) {
  // v4.7 — pre-match drill grants: temporary special PlayStyles for this fixture only
  const drillGrant = new Map((game.preMatchDrills?.grants ?? []).map((g) => [g.playerId, g.styleId]));
  const drillStyle = (pid: number): string[] => {
    const s = drillGrant.get(pid);
    return s ? [s] : [];
  };
  const players = game.lineup.map((id, i) => {
    const p = game.players.find((x) => x.id === id);
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      position: p.position,
      ovr: p.overallRating,
      attributes: p.attributes,
      stamina: p.stamina,
      sharpness: p.sharpness,
      morale: p.morale,
      age: p.age,
      instr: game.tactics.instructions?.[String(i)] ?? {},
      playStyles: [...computePlayStyles(p).map((s) => s.id), ...drillStyle(p.id)],
    };
  });
  const formationObj = getFormation(game.tactics.formationName);
  while (players.length < 11) players.push(null);
  // fill empty slots with best remaining squad players
  const used = new Set(game.lineup.filter(Boolean) as number[]);
  for (let i = 0; i < 11; i++) {
    if (players[i]) continue;
    const slot = formationObj.positions[i];
    const candidates = game.players
      .filter((p) => !used.has(p.id) && p.injuryWeeks === 0)
      .sort((a, b) => b.overallRating - a.overallRating);
    const c = candidates[0];
    if (c) {
      used.add(c.id);
      players[i] = {
        id: c.id, name: c.name, position: c.position, ovr: c.overallRating,
        attributes: c.attributes, stamina: c.stamina, sharpness: c.sharpness, morale: c.morale, age: c.age,
        instr: game.tactics.instructions?.[String(i)] ?? {},
        playStyles: [...computePlayStyles(c).map((s) => s.id), ...drillStyle(c.id)],
      };
    }
  }
  // v4.8 — bench of fit substitutes (max 9, strongest first) for half-time swaps
  const benchPlayers = game.players
    .filter((p) => !used.has(p.id) && p.injuryWeeks === 0)
    .sort((a, b) => b.overallRating - a.overallRating)
    .slice(0, 9)
    .map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      ovr: p.overallRating,
      attributes: p.attributes,
      stamina: p.stamina,
      sharpness: p.sharpness,
      morale: p.morale,
      age: p.age,
      playStyles: [...computePlayStyles(p).map((s) => s.id)],
    }));
  return {
    id: game.clubId,
    name: team.name,
    shortName: team.shortName,
    formation: game.tactics.formationName,
    mentality: game.tactics.mentality,
    sliders: game.tactics.sliders,
    setPieces: game.tactics.setPieces,
    players: players.filter(Boolean) as NonNullable<(typeof players)[number]>[],
    bench: benchPlayers,
  };
}

/** Recompute overall from attributes (used after imports). */
export function syncOverall(p: PlayerRow): void {
  recomputeOverall(p);
}
