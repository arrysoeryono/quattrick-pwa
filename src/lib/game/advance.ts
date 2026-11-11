import type {
  Dataset,
  GameState,
  MatchResult,
  NewsItem,
  PlayerRow,
  PlayerState,
  TeamRow,
} from "./types";
import { computeTable, estimateClubStrength, generateFixtures, quickSimulateScore } from "./season";
import { getFormation } from "./formations";
import {
  applySeasonDecay,
  autoSquadRole,
  computeOverall,
  computePlayStyles,
  generateRegen,
  recalcPotential,
  recomputeOverall,
  shouldRetire,
  tickRetrain,
  weeklyDevelopment,
} from "./development";
import { computeMarketValue, computeSalary, mulberry32 } from "./defaultData";
import { autoPickLineup } from "./tactics";
import { defaultTactics, migrateTactics } from "./tacticPresets";

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

function uid(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
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
  };
}

function objectiveFor(reputation: number, teamsCount: number): number {
  if (reputation >= 78) return 1;
  if (reputation >= 72) return Math.min(3, teamsCount);
  if (reputation >= 64) return 5;
  if (reputation >= 58) return 8;
  return Math.max(6, teamsCount - 2);
}

export function createCareerState(managerName: string, clubId: number, dataset: Dataset): GameState {
  const team = dataset.teams.find((t) => t.id === clubId)!;
  const leagueTeams = dataset.teams.filter((t) => t.leagueId === team.leagueId);
  const squad = dataset.players.filter((p) => p.teamId === clubId).map(toPlayerState);
  squad.forEach((p) => (p.squadRole = autoSquadRole(p, squad)));
  const formationName = "4-3-3 Holding";
  const fixtures = generateFixtures(leagueTeams.map((t) => t.id), seasonStartDate(2025));

  return {
    version: SAVE_VERSION,
    managerName: managerName.trim() || "The Gaffer",
    clubId,
    leagueId: team.leagueId,
    season: 2025,
    currentDate: isoDate(seasonStartDate(2025)),
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
        date: isoDate(seasonStartDate(2025)),
        type: "season",
        title: `${managerName} appointed at ${team.name}`,
        body: `The board welcomes the new manager. Season objective: finish top ${objectiveFor(team.reputation, leagueTeams.length)} of the ${dataset.leagues.find((l) => l.id === team.leagueId)?.name}. Transfer budget: $${(team.transferBudget / 1e6).toFixed(1)}M.`,
      },
    ],
    seasonObjective: { targetPosition: objectiveFor(team.reputation, leagueTeams.length) },
    history: [],
    lastRoundResults: [],
  };
}

/* ---------------- helpers for match day ---------------- */

/** Migrate a legacy save (v1-v3) to the current v4 shape, in place. */
export function migrateGameState(raw: GameState): GameState {
  const game = raw as GameState;
  game.tactics = migrateTactics(game.tactics, game.tactics?.formationName ?? "4-3-3 Holding");
  if (!game.staff) game.staff = { coachLevel: "Accomplished" };
  for (const p of game.players) {
    if (!p.trainingPlan) p.trainingPlan = { focus: "balanced", intensity: "normal" };
    if (p.retrain === undefined) p.retrain = null;
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
      .sort((a, b) => a.round - b.round)[0] ?? null
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
  };
}

function pushNews(game: GameState, type: NewsItem["type"], title: string, body: string): void {
  game.news.unshift({ id: uid(), date: game.currentDate, type, title, body });
  if (game.news.length > 60) game.news.length = 60;
}

function endSeason(game: GameState, dataset: Dataset): { summary: NonNullable<AdvanceOutcome["seasonSummary"]> } {
  const leagueTeams = dataset.teams.filter((t) => t.leagueId === game.leagueId);
  const league = dataset.leagues.find((l) => l.id === game.leagueId);
  const table = computeTable(leagueTeams, game.fixtures);
  const position = Math.max(1, table.findIndex((r) => r.teamId === game.clubId) + 1);
  const row = table[position - 1];
  const team = dataset.teams.find((t) => t.id === game.clubId)!;
  const trophies: string[] = [];
  if (position === 1 && league) trophies.push(`${league.name} Title ${game.season}`);

  const achieved = position <= game.seasonObjective.targetPosition;
  const prize = (leagueTeams.length - position + 1) * 1200000 + (team.reputation ?? 50) * 9000;
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

  pushNews(game, "award", `Season ${game.season} complete — finished ${position}${position === 1 ? "st" : position === 2 ? "nd" : position === 3 ? "rd" : "th"}`,
    `Record: ${row.won}W ${row.drawn}D ${row.lost}L, ${row.gf}:${row.ga}. Prize money: $${(prize / 1e6).toFixed(2)}M.`);
  pushNews(game, "season", achieved ? "Board delighted — objective achieved" : "Board disappointed — objective missed",
    achieved
      ? `Target was top ${game.seasonObjective.targetPosition}; you delivered position ${position}.`
      : `Target was top ${game.seasonObjective.targetPosition}; you finished ${position}. Expect higher expectations next season.`);

  /* --- dynamic potential recalculation --- */
  const leagueMatches = game.fixtures.length / 2;
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
  }

  /* --- aging, decay, retirement --- */
  const retiredUser: PlayerState[] = [];
  for (const p of game.players) {
    p.age += 1;
    applySeasonDecay(p, rng);
    p.marketValue = computeMarketValue(p.overallRating, p.age, p.potential);
    p.contractYears = Math.max(0, p.contractYears - 1);
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
      aged.attributes = {
        ...aged.attributes,
        pace: Math.max(20, aged.attributes.pace - 2),
        physical: Math.max(25, aged.attributes.physical - 2),
      };
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
  game.fixtures = generateFixtures(leagueTeams.map((t) => t.id), start);
  game.currentDate = isoDate(start);
  game.seasonObjective = { targetPosition: objectiveFor(team.reputation ?? 50, leagueTeams.length) };
  game.lastRoundResults = [];
  pushNews(game, "season", `Season ${newSeason} kicks off`, `Fresh fixture list released. New objective: finish top ${game.seasonObjective.targetPosition}.`);

  return { summary: { position, points: row.points, targetPosition: game.seasonObjective.targetPosition, achieved, trophies } };
}

export function advanceAfterUserMatch(
  gameIn: GameState,
  datasetIn: Dataset,
  userResult: MatchResult,
): AdvanceOutcome {
  const game: GameState = structuredClone(gameIn);
  const dataset: Dataset = structuredClone(datasetIn);
  const squadIds = new Set(game.players.map((p) => p.id));

  /* 1. apply user fixture */
  const fx = game.fixtures.find((f) => f.id === userResult.fixtureId);
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

  /* 2. simulate remaining AI fixtures this round */
  const round = fx?.round ?? 1;
  const roundFixtures = game.fixtures.filter((f) => f.round === round);
  game.lastRoundResults = [];
  for (const f of roundFixtures) {
    if (f.played) {
      game.lastRoundResults.push({ homeId: f.homeId, awayId: f.awayId, homeGoals: f.homeGoals ?? 0, awayGoals: f.awayGoals ?? 0 });
      continue;
    }
    const hs = estimateClubStrength(dataset, f.homeId);
    const as = estimateClubStrength(dataset, f.awayId);
    const score = quickSimulateScore(hs, as, f.id * 7919 + game.season);
    f.played = true;
    f.homeGoals = score.homeGoals;
    f.awayGoals = score.awayGoals;
    game.lastRoundResults.push({ homeId: f.homeId, awayId: f.awayId, homeGoals: score.homeGoals, awayGoals: score.awayGoals });
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
      p.sharpness = Math.max(0, p.sharpness - 9);
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

  /* 5. weekly development tick — training plans, coach level, retraining */
  const coachQ = coachMultiplier(game.staff?.coachLevel);
  const staffWage = COACH_LEVELS[game.staff?.coachLevel ?? "Accomplished"].wage;
  game.transferBudget -= staffWage; // weekly staff salary
  for (const p of game.players) {
    const mins = minutesPlayed.get(p.id) ?? 0;
    const train = weeklyDevelopment(p, mins, coachQ, rng);
    p.stamina = Math.min(100, (p.stamina ?? 100) + 14 + train.staminaDelta);
    if (train.injury && p.injuryWeeks === 0) {
      p.injuryWeeks = 1;
      pushNews(game, "injury", `${p.name} injured in training`, "An intense gym session ended with a knock — one week on the sidelines.");
    }
    if (p.retrain) {
      const done = tickRetrain(p);
      if (done) {
        pushNews(game, "season", `${p.name} completes position conversion`, `After ${p.retrain ? "weeks of hard work" : "retraining"}, he is now a natural ${p.position}.`);
        p.squadRole = autoSquadRole(p, game.players);
      }
    }
    if (p.injuryWeeks > 0) {
      p.injuryWeeks -= 1;
      if (p.injuryWeeks === 0) pushNews(game, "injury", `${p.name} back in training`, "The medical team has cleared him for selection.");
    }
    p.squadRole = autoSquadRole(p, game.players);
  }

  /* 6. matchday income */
  const userTeam = dataset.teams.find((t) => t.id === game.clubId);
  if (userTeam && userHome) {
    game.transferBudget += (userTeam.reputation ?? 50) * 2600;
  }

  /* 7. date + match news */
  const nextDate = new Date(new Date(game.currentDate + "T12:00:00Z").getTime() + 7 * 24 * 3600 * 1000);
  game.currentDate = isoDate(nextDate);
  const oppId = userHome ? userResult.awayId : userResult.homeId;
  const oppName = teamName(dataset, oppId);
  pushNews(
    game,
    "match",
    `${won ? "Victory" : drew ? "Draw" : "Defeat"} ${userGoals}-${oppGoals} vs ${oppName}`,
    `Round ${round}: ${userHome ? "home" : "away"} fixture. xG ${userResult.stats.xg[0]}-${userResult.stats.xg[1]}. Possession ${userResult.stats.possession[0]}%-${userResult.stats.possession[1]}%.`,
  );

  /* 8. season end? */
  const allPlayed = game.fixtures.every((f) => f.played);
  let seasonSummary: AdvanceOutcome["seasonSummary"];
  if (allPlayed) {
    const res = endSeason(game, dataset);
    seasonSummary = res.summary;
  }

  return { game, dataset, seasonEnded: allPlayed, seasonSummary };
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
      playStyles: computePlayStyles(p).map((s) => s.id),
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
        playStyles: computePlayStyles(c).map((s) => s.id),
      };
    }
  }
  return {
    id: game.clubId,
    name: team.name,
    shortName: team.shortName,
    formation: game.tactics.formationName,
    mentality: game.tactics.mentality,
    sliders: game.tactics.sliders,
    setPieces: game.tactics.setPieces,
    players: players.filter(Boolean) as NonNullable<(typeof players)[number]>[],
  };
}

/** Recompute overall from attributes (used after imports). */
export function syncOverall(p: PlayerRow): void {
  recomputeOverall(p);
}
