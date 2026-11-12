import type {
  Dataset,
  Difficulty,
  GameState,
  JobOffer,
  MatchRatingEntry,
  MatchResult,
  NewsItem,
  PlayerRow,
  PlayerState,
  TeamRow,
  TotwEntry,
} from "./types";
import { DIFFICULTY_META } from "./types";
import { computeTable, estimateClubStrength, generateFixtures, quickSimulateScore } from "./season";
import { getFormation, positionAffinity } from "./formations";
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
import { buildFcProfile } from "./fc";
import { bestRoleForPlayer } from "./fcIq";
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
  makeJobOffers,
  progressCup,
  pushNews,
  pushSocial,
  resolveInboxMessage,
  runTransferWorld,
  seasonBoardReview,
  socialAfterMatch,
  tickGtn,
  tickLoans,
  tickScouting,
  uid,
  unlockAchievement,
  userCupOutcome,
  isDerbyFixture,
  weekOfSeason,
  youthScoutQuality,
} from "./career";
import { maybeCreatePress } from "./press";
import { tickProCareer } from "./playerCareer";

const rng = mulberry32(Date.now() & 0xffffffff);

export const BASE_SEASON_START = Date.UTC(2025, 6, 12); // 12 July 2025

export const SAVE_VERSION = 6;

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

/** Materialize a dataset row into the richer runtime PlayerState. */
export function toPlayerState(p: PlayerRow): PlayerState {
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
    staff: { coachLevel: "Accomplished", lineCoaches: { gk: 0, def: 0, mid: 0, att: 0 } },
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
    /* v6.0 — FC Career Mode */
    shortlist: [],
    transferListedIds: [],
    loanListedIds: [],
    loans: [],
    offers: [],
    ledger: [],
    leagueBoard: {},
    totw: null,
    press: null,
    pressDoneWeeks: [],
    gtn: [],
    gtnReport: [],
    youthScouts: [],
    lastYouthTourWeek: 0,
    settings: { currency: "USD", halfLengthMin: 5 },
    careerMode: "manager",
    proId: null,
    pro: null,
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
  /* v6.0 — FC Career Mode defaults */
  if (!game.staff.lineCoaches) game.staff.lineCoaches = { gk: 0, def: 0, mid: 0, att: 0 };
  if (!Array.isArray(game.shortlist)) game.shortlist = [];
  if (!Array.isArray(game.transferListedIds)) game.transferListedIds = [];
  if (!Array.isArray(game.loanListedIds)) game.loanListedIds = [];
  if (!Array.isArray(game.loans)) game.loans = [];
  if (!Array.isArray(game.offers)) game.offers = [];
  if (!Array.isArray(game.ledger)) game.ledger = [];
  if (!game.leagueBoard || typeof game.leagueBoard !== "object") game.leagueBoard = {};
  if (game.totw === undefined) game.totw = null;
  if (game.press === undefined) game.press = null;
  if (!Array.isArray(game.pressDoneWeeks)) game.pressDoneWeeks = [];
  if (!Array.isArray(game.gtn)) game.gtn = [];
  if (!Array.isArray(game.gtnReport)) game.gtnReport = [];
  if (!Array.isArray(game.youthScouts)) game.youthScouts = [];
  if (game.lastYouthTourWeek === undefined) game.lastYouthTourWeek = 0;
  if (!game.settings || typeof game.settings !== "object") game.settings = { currency: "USD", halfLengthMin: 5 };
  if (!game.settings.currency) game.settings.currency = "USD";
  if (!game.settings.halfLengthMin) game.settings.halfLengthMin = 5;
  if (game.careerMode === undefined) game.careerMode = "manager";
  if (game.proId === undefined) game.proId = null;
  if (game.pro === undefined) game.pro = null;
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

/* v6.0 — finance ledger helper */
function addLedger(game: GameState, label: string, amount: number): void {
  const week = weekOfSeason(game);
  game.ledger = [{ id: uid(), date: game.currentDate, week, label, amount }, ...(game.ledger ?? [])].slice(0, 50);
}

/* v6.0 — league-wide player statistics */
function creditStats(game: GameState, playerId: number, stat: Partial<{ goals: number; assists: number; cleanSheets: number; yellow: number; red: number }>): void {
  game.leagueBoard = game.leagueBoard ?? {};
  const key = String(playerId);
  const row = game.leagueBoard[key] ?? { goals: 0, assists: 0, cleanSheets: 0, yellow: 0, red: 0 };
  row.goals += stat.goals ?? 0;
  row.assists += stat.assists ?? 0;
  row.cleanSheets += stat.cleanSheets ?? 0;
  row.yellow += stat.yellow ?? 0;
  row.red += stat.red ?? 0;
  game.leagueBoard[key] = row;
}

/** Distribute goals of an AI fixture to that team's most dangerous players. */
function creditAiFixture(game: GameState, dataset: Dataset, homeId: number, homeGoals: number, awayId: number, awayGoals: number): void {
  const credit = (teamId: number, goals: number) => {
    if (goals <= 0) return;
    if (teamId === game.clubId) return; // user players credited separately
    const squad = dataset.players
      .filter((p) => p.teamId === teamId)
      .map((p) => {
        const a = p.attributes as unknown as Record<string, number>;
        const shooty = (a.shooting ?? 40) + (a.dribbling ?? 40) * 0.4;
        const isAtt = ["ST", "CF", "LW", "RW", "CAM", "LF", "RF"].includes(p.position);
        const isGk = p.position === "GK";
        return { id: p.id, w: isGk ? 0.02 : isAtt ? shooty : shooty * 0.35 };
      });
    const total = squad.reduce((s, x) => s + x.w, 0);
    if (total <= 0) return;
    let seed = teamId * 131 + goals * 17 + game.season;
    for (let i = 0; i < goals; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      let pick = (seed / 0x7fffffff) * total;
      for (const c of squad) {
        pick -= c.w;
        if (pick <= 0) {
          creditStats(game, c.id, { goals: 1 });
          break;
        }
      }
    }
  };
  credit(homeId, homeGoals);
  credit(awayId, awayGoals);
  if (homeGoals === 0) {
    const gk = dataset.players.find((p) => p.teamId === homeId && p.position === "GK");
    const defenders = dataset.players.filter((p) => p.teamId === homeId && ["CB", "LB", "RB", "LWB", "RWB"].includes(p.position)).slice(0, 4);
    if (gk) creditStats(game, gk.id, { cleanSheets: 1 });
    for (const d of defenders) creditStats(game, d.id, { cleanSheets: 1 });
  }
  if (awayGoals === 0) {
    const gk = dataset.players.find((p) => p.teamId === awayId && p.position === "GK");
    const defenders = dataset.players.filter((p) => p.teamId === awayId && ["CB", "LB", "RB", "LWB", "RWB"].includes(p.position)).slice(0, 4);
    if (gk) creditStats(game, gk.id, { cleanSheets: 1 });
    for (const d of defenders) creditStats(game, d.id, { cleanSheets: 1 });
  }
}

/** Build the Team of the Week from this round's results. */
function buildTotw(game: GameState, dataset: Dataset, roundFixtures: { homeId: number; awayId: number; homeGoals: number; awayGoals: number }[], week: number, userRatings: MatchRatingEntry[]): void {
  const cands: TotwEntry[] = [];
  // user players come from real ratings
  for (const fx of roundFixtures) {
    const userInvolved = fx.homeId === game.clubId || fx.awayId === game.clubId;
    creditAiFixture(game, dataset, fx.homeId, fx.homeGoals, fx.awayId, fx.awayGoals);
    if (userInvolved) continue;
    // synthetic AI performers: scorers rated up, clean-sheet keepers rated up
    const goalMap = new Map<number, number>();
    const credit = (teamId: number, goals: number) => {
      const squad = dataset.players.filter((p) => p.teamId === teamId);
      const attackers = squad.filter((p) => ["ST", "CF", "LW", "RW", "CAM", "LF", "RF"].includes(p.position));
      const pool = attackers.length > 0 ? attackers : squad;
      for (let i = 0; i < goals; i++) {
        const scorer = pool[(fx.homeId * 31 + i * 7 + teamId) % pool.length];
        if (scorer) goalMap.set(scorer.id, (goalMap.get(scorer.id) ?? 0) + 1);
      }
    };
    credit(fx.homeId, fx.homeGoals);
    credit(fx.awayId, fx.awayGoals);
    for (const [pid, g] of goalMap) {
      const p = dataset.players.find((x) => x.id === pid);
      if (!p) continue;
      cands.push({ playerId: p.id, playerName: p.name, teamId: p.teamId, position: p.position, rating: Math.min(9.6, 6.8 + g * 0.6 + (p.overallRating - 65) * 0.02), goals: g, assists: 0, motm: false });
    }
    if (fx.awayGoals === 0) {
      const gk = dataset.players.find((p) => p.teamId === fx.homeId && p.position === "GK");
      if (gk) cands.push({ playerId: gk.id, playerName: gk.name, teamId: gk.teamId, position: "GK", rating: 7.8, goals: 0, assists: 0, motm: false });
    }
    if (fx.homeGoals === 0) {
      const gk = dataset.players.find((p) => p.teamId === fx.awayId && p.position === "GK");
      if (gk) cands.push({ playerId: gk.id, playerName: gk.name, teamId: gk.teamId, position: "GK", rating: 7.8, goals: 0, assists: 0, motm: false });
    }
  }
  // real user player performances from the live/quick match
  for (const r of userRatings ?? []) {
    const p = game.players.find((x) => x.id === r.playerId);
    if (!p) continue;
    cands.push({ playerId: p.id, playerName: p.name, teamId: game.clubId, position: p.position, rating: r.rating, goals: r.goals, assists: r.assists, motm: false });
  }
  const top = [...cands].sort((a, b) => b.rating - a.rating).slice(0, 11);
  if (top.length > 0) {
    top[0].motm = true;
    game.totw = { week, entries: top };
  }
}

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
  addLedger(game, `Season ${game.season} prize money`, prize);

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

  /* --- v4.3 youth academy intake (facility + youth scouts scaled) --- */
  const intake = academyIntake(game, dataset, nextId, rng, youthScoutQuality(game));
  for (const y of intake) {
    pushNews(game, "season", `Academy intake: ${y.name} signs first pro deal`, `The ${y.age}-year-old ${y.position} (OVR ${y.ovr}, POT ${y.pot}) graduates from the youth academy. Facility level ${game.facilityLevel}.`);
    pushSocial(game, { handle: "Academy Watch", tag: "@academywatch", tone: "news", text: `${y.name} is the standout of this year's intake. POT ${y.pot} at ${y.age} years old.` });
    if (y.pot >= 88) unlockAchievement(game, "wonderkid-signing");
  }

  /* --- v4.2 board verdict (may sack the manager) --- */
  const review = seasonBoardReview(game, dataset, achieved, cupOutcome, trophies);

  /* --- v6.0 job offers: always on sack; head-hunted when overachieving --- */
  game.offers = [];
  if (review.sacked && review.offers.length > 0) {
    game.offers = makeJobOffers(game, dataset, review.offers);
  } else if (!review.sacked && (trophies.length > 0 || (achieved && position <= 3)) && game.managerRep >= 55) {
    const better = dataset.teams
      .filter((t) => t.id !== game.clubId && t.leagueId === game.leagueId && t.reputation > (dataset.teams.find((x) => x.id === game.clubId)?.reputation ?? 50))
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 2)
      .map((t) => t.id);
    if (better.length > 0) {
      game.offers = makeJobOffers(game, dataset, better);
      pushNews(game, "board", "Your agent brings news: offers are on the table", `${game.offers.map((o) => o.teamName).join(" and ")} want to talk. Check the Office > Jobs tab.`);
    }
  }

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
  /* v6.0 — settle loans, reset weekly boards */
  for (const l of game.loans ?? []) l.weeksLeft = 1;
  tickLoans(game, dataset);
  game.leagueBoard = {};
  game.totw = null;
  game.press = null;
  game.lastYouthTourWeek = 0;
  game.gtnReport = [];
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

  /* 2b. v6.0 — league stats board + Team of the Week */
  for (const r of userResult.ratings) {
    creditStats(game, r.playerId, { goals: r.goals, assists: r.assists });
  }
  if (oppGoals === 0) {
    for (const id of game.lineup) {
      if (id === null) continue;
      const p = game.players.find((x) => x.id === id);
      if (p && ["GK", "CB", "LB", "RB", "LWB", "RWB"].includes(p.position)) {
        creditStats(game, p.id, { cleanSheets: 1 });
      }
    }
  }
  const playedRoundResults = game.fixtures
    .filter((f) => f.round === round && f.played && f.homeGoals !== null)
    .map((f) => ({ homeId: f.homeId, awayId: f.awayId, homeGoals: f.homeGoals ?? 0, awayGoals: f.awayGoals ?? 0 }));
  buildTotw(game, dataset, playedRoundResults, currentWeek, userResult.ratings);

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
  const lineWage = Object.values(game.staff?.lineCoaches ?? {}).reduce((s, v) => s + v, 0) * 6000;
  game.transferBudget -= staffWage; // weekly staff salary
  addLedger(game, "Coaching staff wages", -(staffWage + lineWage));
  // per-line specialist coaching: +6% development XP per level for that line
  const lineOf = (pos: string): number =>
    pos === "GK" ? (game.staff?.lineCoaches?.gk ?? 0)
    : ["CB", "LB", "RB", "LWB", "RWB"].includes(pos) ? (game.staff?.lineCoaches?.def ?? 0)
    : ["CDM", "CM", "CAM", "LM", "RM", "LAM", "RAM"].includes(pos) ? (game.staff?.lineCoaches?.mid ?? 0)
    : (game.staff?.lineCoaches?.att ?? 0);
  if (lineWage > 0) {
    game.transferBudget -= lineWage;
  }
  const coachQFor = (pos: string): number => coachQ * (1 + 0.06 * lineOf(pos));
  for (const p of game.players) {
    const mins = minutesPlayed.get(p.id) ?? 0;
    const mentor = p.mentor ? game.players.find((m) => m.id === p.mentor!.mentorId) ?? null : null;
    if (p.mentor && !mentor) p.mentor = null; // mentor left the club
    const train = weeklyDevelopment(p, mins, coachQFor(p.position), rng, mentor);
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

  /* 5c. v6.0 — loans, GTN, youth scouts, press conference, Pro career */
  tickLoans(game, dataset);
  tickGtn(game, dataset, rng);
  const youthWages = (game.youthScouts ?? []).reduce((s, sc) => s + sc.weeklyWage, 0);
  if (youthWages > 0) {
    game.transferBudget -= youthWages;
    addLedger(game, "Youth academy staff wages", -youthWages);
  }
  if (game.careerMode !== "player") {
    maybeCreatePress(game, dataset);
  }
  if (game.careerMode === "player" && game.pro) {
    const pr = ratingsByPlayer.get(game.pro.playerId) ?? null;
    tickProCareer(game, pr ? { rating: pr.rating, goals: pr.goals, assists: pr.assists } : null);
  }

  /* 6. matchday income */
  const userTeam = dataset.teams.find((t) => t.id === game.clubId);
  if (userTeam && userHome) {
    const income = (userTeam.reputation ?? 50) * 2600;
    game.transferBudget += income;
    addLedger(game, "Matchday income (home)", income);
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
  addLedger(game, `Signed ${p.name} (${dataset.teams.find((t) => t.id === teamId)?.shortName ?? "free"})`, -price);
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
  addLedger(game, `Sold ${p.name}`, fee);
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
      fc: buildFcProfile(p),
    };
  });
  const formationObj = getFormation(game.tactics.formationName);
  const roleFor = (p: PlayerState, slotIndex: number) => {
    const saved = game.tactics.roles?.[String(slotIndex)];
    if (saved) return saved;
    const slot = formationObj.positions[slotIndex];
    return slot ? bestRoleForPlayer(p, slot) : undefined;
  };
  const playersWithRoles = game.lineup.map((id, i) => {
    const p = game.players.find((x) => x.id === id);
    if (!p || !players[i]) return null;
    return { ...players[i], role: roleFor(p, i) };
  });
  while (playersWithRoles.length < 11) playersWithRoles.push(null);
  // v6.0 — Be a Pro: the user's Pro ALWAYS starts (healthy pros swap into the XI)
  if (game.careerMode === "player" && game.proId) {
    const alreadyIn = playersWithRoles.some((p) => p?.id === game.proId);
    const pro = game.players.find((p) => p.id === game.proId);
    if (!alreadyIn && pro && pro.injuryWeeks === 0) {
      // weakest non-GK starter by (affinity x ovr) loses his spot
      let worstIdx = -1;
      let worstScore = Infinity;
      for (let i = 0; i < Math.min(11, playersWithRoles.length); i++) {
        const slot = formationObj.positions[i];
        if (!slot || slot === "GK" || !playersWithRoles[i]) continue;
        const c = playersWithRoles[i]!;
        const score = positionAffinity(c.position, slot) * c.ovr;
        if (score < worstScore) {
          worstScore = score;
          worstIdx = i;
        }
      }
      if (worstIdx >= 0) {
        const slot = formationObj.positions[worstIdx];
        playersWithRoles[worstIdx] = {
          id: pro.id,
          name: pro.name,
          position: pro.position,
          ovr: pro.overallRating,
          attributes: pro.attributes,
          stamina: pro.stamina,
          sharpness: pro.sharpness,
          morale: pro.morale,
          age: pro.age,
          instr: game.tactics.instructions?.[String(worstIdx)] ?? {},
          role: bestRoleForPlayer(pro, slot),
          playStyles: [...computePlayStyles(pro).map((s) => s.id), ...drillStyle(pro.id)],
          fc: buildFcProfile(pro),
        };
      }
    }
  }
  // fill empty slots with best remaining squad players
  const used = new Set(game.lineup.filter(Boolean) as number[]);
  for (let i = 0; i < 11; i++) {
    if (playersWithRoles[i]) continue;
    const slot = formationObj.positions[i];
    const candidates = game.players
      .filter((p) => !used.has(p.id) && p.injuryWeeks === 0)
      .sort((a, b) => b.overallRating - a.overallRating);
    const c = candidates[0];
    if (c) {
      used.add(c.id);
      playersWithRoles[i] = {
        id: c.id, name: c.name, position: c.position, ovr: c.overallRating,
        attributes: c.attributes, stamina: c.stamina, sharpness: c.sharpness, morale: c.morale, age: c.age,
        instr: game.tactics.instructions?.[String(i)] ?? {},
        role: bestRoleForPlayer(c, slot),
        playStyles: [...computePlayStyles(c).map((s) => s.id), ...drillStyle(c.id)],
        fc: buildFcProfile(c),
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
      role: bestRoleForPlayer(p, p.position),
      playStyles: [...computePlayStyles(p).map((s) => s.id)],
      fc: buildFcProfile(p),
    }));
  return {
    id: game.clubId,
    name: team.name,
    shortName: team.shortName,
    formation: game.tactics.formationName,
    mentality: game.tactics.mentality,
    sliders: game.tactics.sliders,
    setPieces: game.tactics.setPieces,
    players: playersWithRoles.filter(Boolean) as NonNullable<(typeof playersWithRoles)[number]>[],
    bench: benchPlayers,
  };
}

/** Recompute overall from attributes (used after imports). */
export function syncOverall(p: PlayerRow): void {
  recomputeOverall(p);
}

/* ============================================================
 * v6.0 — Job offers: accept a new job, keep the manager's legacy
 * ============================================================ */

export interface JobAcceptResult {
  game: GameState | null;
  ok: boolean;
  message: string;
}

/**
 * Accept a job offer: a fresh career starts at the new club while the
 * manager keeps his reputation, history, achievements and name.
 */
export function acceptJobOffer(gameIn: GameState, datasetIn: Dataset, offerId: string): JobAcceptResult {
  const game = structuredClone(gameIn);
  const dataset = structuredClone(datasetIn);
  const offer: JobOffer | undefined = (game.offers ?? []).find((o) => o.id === offerId);
  if (!offer) return { game: null, ok: false, message: "Offer no longer available" };
  const team = dataset.teams.find((t) => t.id === offer.teamId);
  if (!team) return { game: null, ok: false, message: "Club unavailable" };

  const fresh = createCareerState(game.managerName, offer.teamId, dataset, game.difficulty);
  fresh.managerRep = Math.min(100, Math.max(fresh.managerRep, game.managerRep));
  fresh.history = game.history;
  fresh.achievements = game.achievements;
  fresh.boardConfidence = 65;
  fresh.careerMode = game.careerMode ?? "manager";
  fresh.settings = game.settings;
  fresh.youthScouts = []; // staff do not follow the manager
  pushNews(fresh, "board", `${game.managerName} appointed at ${team.name}`, `A fresh start with high expectations: finish top ${fresh.seasonObjective.targetPosition}. Transfer budget: $${(fresh.transferBudget / 1e6).toFixed(1)}M.`);
  return { game: fresh, ok: true, message: `Welcome to ${team.name}!` };
}
