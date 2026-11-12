import type { Dataset, Fixture, GameState, TableRow, TeamRow } from "./types";
import { mulberry32 } from "./defaultData";
import { getFormation, positionAffinity } from "./formations";
import type { MatchTeamConfig, Mentality, PlayerState, PositionCode } from "./types";
import { aiSlidersFor } from "./tacticPresets";
import { computePlayStyles } from "./development";
import { buildFcProfile } from "./fc";
import { bestRoleForPlayer, defaultRoleForSlot } from "./fcIq";

/** Double round-robin (circle method). Returns 2*(n-1) rounds, weekly dates. */
export function generateFixtures(teamIds: number[], seasonStart: Date): Fixture[] {
  const ids = [...teamIds];
  const n = ids.length;
  if (n % 2 !== 0) ids.push(-1);
  const m = ids.length;
  const rounds: [number, number][][] = [];
  let arr = [...ids];

  for (let r = 0; r < m - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i];
      const b = arr[m - 1 - i];
      if (a !== -1 && b !== -1) {
        // alternate home/away for variety
        pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
    }
    rounds.push(pairs);
    // rotate all but first
    arr = [arr[0], arr[m - 1], ...arr.slice(1, m - 1)];
  }
  const secondHalf = rounds.map((ps) => ps.map(([h, a]) => [a, h] as [number, number]));
  const all = [...rounds, ...secondHalf];

  const fixtures: Fixture[] = [];
  let fixtureId = 1;
  all.forEach((pairs, roundIdx) => {
    const date = new Date(seasonStart.getTime() + roundIdx * 7 * 24 * 3600 * 1000);
    pairs.forEach(([homeId, awayId]) => {
      fixtures.push({
        id: fixtureId++,
        round: roundIdx + 1,
        date: date.toISOString().slice(0, 10),
        homeId,
        awayId,
        played: false,
        homeGoals: null,
        awayGoals: null,
        competition: "league",
      });
    });
  });
  return fixtures;
}

export function computeTable(teams: TeamRow[], fixtures: Fixture[]): TableRow[] {
  const rows = new Map<number, TableRow>();
  teams.forEach((t) =>
    rows.set(t.id, { teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }),
  );
  fixtures.forEach((fx) => {
    if (!fx.played || fx.homeGoals === null || fx.awayGoals === null) return;
    const h = rows.get(fx.homeId);
    const a = rows.get(fx.awayId);
    if (!h || !a) return;
    h.played++; a.played++;
    h.gf += fx.homeGoals; h.ga += fx.awayGoals;
    a.gf += fx.awayGoals; a.ga += fx.homeGoals;
    if (fx.homeGoals > fx.awayGoals) { h.won++; h.points += 3; a.lost++; }
    else if (fx.homeGoals < fx.awayGoals) { a.won++; a.points += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  });
  return [...rows.values()]
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.teamId - y.teamId);
}

/**
 * Effective team strength from a starting XI — weighted by zone and slot affinity,
 * plus sharpness & morale modifiers (development-mechanics compliant).
 */
export function computeTeamStrength(team: MatchTeamConfig): { att: number; mid: number; def: number } {
  const formation = getFormation(team.formation);
  let attSum = 0, attW = 0, midSum = 0, midW = 0, defSum = 0, defW = 0;

  formation.positions.forEach((slot, i) => {
    const p = team.players[i];
    if (!p) return;
    const affinity = positionAffinity(p.position, slot);
    const sharpAdj = p.sharpness >= 80 ? 5 : p.sharpness >= 60 ? 3 : p.sharpness >= 40 ? 0 : -4;
    const eff = p.ovr * affinity + sharpAdj + (p.morale - 60) * 0.03;

    const isGK = slot === "GK";
    const isDef = ["CB", "LB", "RB", "LWB", "RWB"].includes(slot);
    const isAtt = ["LW", "RW", "LF", "RF", "CF", "ST"].includes(slot);

    if (isGK || isDef) {
      const w = isGK ? 3 : 1.4;
      defSum += eff * w; defW += w;
      if (isDef) { midSum += eff * 0.5; midW += 0.5; }
    } else if (isAtt) {
      const w = 1.3;
      attSum += eff * w; attW += w;
      midSum += eff * 0.5; midW += 0.5;
    } else {
      const w = 1.5;
      midSum += eff * w; midW += w;
      attSum += eff * 0.4; attW += 0.4;
      defSum += eff * 0.55; defW += 0.55;
    }
  });

  return {
    att: attW ? attSum / attW : 50,
    mid: midW ? midSum / midW : 50,
    def: defW ? defSum / defW : 50,
  };
}

function poisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

/** Fast AI-vs-AI result from overall team strengths (used for other fixtures in the round). */
export function quickSimulateScore(
  homeStrength: number,
  awayStrength: number,
  seed: number,
): { homeGoals: number; awayGoals: number } {
  const rng = mulberry32(seed);
  const ratio = Math.max(0.6, Math.min(1.7, homeStrength / Math.max(awayStrength, 30)));
  const homeLambda = Math.max(0.25, 1.45 * Math.pow(ratio, 1.35) * 1.12);
  const awayLambda = Math.max(0.2, 1.25 / Math.pow(ratio, 1.35));
  return { homeGoals: poisson(homeLambda, rng), awayGoals: poisson(awayLambda, rng) };
}

/** Average overall of a club's best XI approximated from its dataset players. */
export function estimateClubStrength(dataset: Dataset, teamId: number): number {
  const squad = dataset.players.filter((p) => p.teamId === teamId);
  if (squad.length === 0) return 55;
  const best = [...squad].sort((a, b) => b.overallRating - a.overallRating).slice(0, 11);
  return best.reduce((s, p) => s + p.overallRating, 0) / best.length;
}

/** Builds a MatchTeamConfig for AI clubs straight from the dataset (auto best-XI for formation). */
export function buildAiTeamConfig(dataset: Dataset, team: TeamRow, formationName: string, mentality: Mentality = "balanced"): MatchTeamConfig {
  const formation = getFormation(formationName);
  const squad = dataset.players
    .filter((p) => p.teamId === team.id)
    .sort((a, b) => b.overallRating - a.overallRating);
  const players: MatchTeamConfig["players"] = [];
  const used = new Set<number>();
  formation.positions.forEach((slot) => {
    let pick = squad.find((p) => !used.has(p.id) && p.position === slot);
    if (!pick) {
      // fallback: best remaining by affinity then ovr
      const candidates = squad
        .filter((p) => !used.has(p.id))
        .map((p) => ({ p, aff: positionAffinity(p.position, slot) }))
        .sort((x, y) => y.aff - x.aff || y.p.overallRating - x.p.overallRating);
      pick = candidates[0]?.p;
    }
    if (!pick) pick = squad[0];
    if (!pick) {
      const fallbackAttrs = slot === "GK"
        ? { diving: 50, handling: 50, reflexes: 50, positioning: 50, kicking: 50, speed: 50 }
        : { pace: 50, shooting: 50, passing: 50, dribbling: 50, defending: 50, physical: 50 };
      players.push({
        id: -1, name: "Unknown", position: slot as PositionCode, ovr: 50,
        attributes: fallbackAttrs,
        stamina: 100, sharpness: 70, morale: 60, age: 24,
        role: defaultRoleForSlot(slot as PositionCode),
      });
      return;
    }
    used.add(pick.id);
    players.push({
      id: pick.id,
      name: pick.name,
      position: pick.position,
      ovr: pick.overallRating,
      attributes: pick.attributes,
      stamina: 100,
      sharpness: 70,
      morale: 60,
      age: pick.age,
      role: bestRoleForPlayer(pick, slot as PositionCode),
      playStyles: computePlayStyles(pick).map((s) => s.id),
      fc: buildFcProfile(pick),
    });
  });
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    formation: formationName,
    mentality,
    sliders: aiSlidersFor(formation.category, mentality),
    players,
  };
}

/** Total wage bill of a squad. */
export function wageBill(players: PlayerState[]): number {
  return players.reduce((s, p) => s + p.salary, 0);
}

/* ================= v6.0 — Quick Sim (user match without the live engine) ================= */

import type { MatchRatingEntry, MatchResult } from "./types";

/**
 * Simulate the user's fixture instantly (Central > Quick Sim) and produce a
 * MatchResult that the weekly advance pipeline can consume. Player ratings,
 * goals, assists and stats are derived deterministically from the squad.
 */
export function simulateUserMatchQuick(
  game: GameState,
  dataset: Dataset,
  fixture: Fixture,
): MatchResult {
  const userHome = fixture.homeId === game.clubId;
  const oppId = userHome ? fixture.awayId : fixture.homeId;
  const hs = estimateClubStrength(dataset, fixture.homeId) * 1.12;
  const as = estimateClubStrength(dataset, fixture.awayId);
  const diffBoost = { amateur: -3, pro: 0, legend: 3 }[game.difficulty] ?? 0;
  const score = quickSimulateScore(
    userHome ? hs + diffBoost * 0 : hs,
    as + diffBoost,
    fixture.id * 7919 + game.season + 13,
  );

  /* distribute the user's goals + assists across the starting XI */
  const starters = game.lineup
    .filter((id): id is number => id !== null)
    .map((id) => game.players.find((p) => p.id === id))
    .filter((p): p is PlayerState => Boolean(p));
  // v6.0 — Be a Pro: the Pro always features (swap him in for the weakest non-GK starter)
  if (game.careerMode === "player" && game.proId) {
    const alreadyIn = starters.some((p) => p.id === game.proId);
    const pro = game.players.find((p) => p.id === game.proId);
    if (!alreadyIn && pro && pro.injuryWeeks === 0 && starters.length > 1) {
      let worstIdx = -1;
      let worstScore = Infinity;
      for (let i = 0; i < starters.length; i++) {
        const s = starters[i];
        if (s.position === "GK" || s.id === pro.id) continue;
        const score = positionAffinity(s.position, s.position) * s.overallRating;
        if (score < worstScore) {
          worstScore = score;
          worstIdx = i;
        }
      }
      if (worstIdx >= 0) starters[worstIdx] = pro;
    }
  }
  const myGoals = userHome ? score.homeGoals : score.awayGoals;
  const oppGoals = userHome ? score.awayGoals : score.homeGoals;

  const rng = mulberry32(fixture.id * 9241 + game.season);
  const attackers = starters.filter((p) => ["ST", "CF", "LW", "RW", "CAM", "LF", "RF"].includes(p.position));
  const pool = attackers.length > 0 ? attackers : starters;

  const goalDist = new Map<number, number>();
  for (let i = 0; i < myGoals; i++) {
    const scorer = pool[Math.floor(rng() * pool.length)];
    goalDist.set(scorer.id, (goalDist.get(scorer.id) ?? 0) + 1);
  }
  const assistDist = new Map<number, number>();
  const creators = starters.filter((p) => !["GK", "CB"].includes(p.position));
  for (let i = 0; i < Math.round(myGoals * 0.7); i++) {
    const c = creators[Math.floor(rng() * creators.length)];
    if (c) assistDist.set(c.id, (assistDist.get(c.id) ?? 0) + 1);
  }

  const entries: MatchRatingEntry[] = starters.map((p) => {
    const goals = goalDist.get(p.id) ?? 0;
    const assists = assistDist.get(p.id) ?? 0;
    let rating = 6.1 + (p.overallRating - 60) * 0.028 + (p.sharpness - 50) * 0.008 + (p.morale - 50) * 0.004;
    rating += goals * 0.85 + assists * 0.45;
    const won = myGoals > oppGoals;
    const drew = myGoals === oppGoals;
    rating += won ? 0.45 : drew ? 0.1 : -0.35;
    if (p.position === "GK" && oppGoals === 0) rating += 0.7;
    if (["CB", "LB", "RB", "LWB", "RWB", "CDM"].includes(p.position)) rating += oppGoals === 0 ? 0.45 : oppGoals >= 3 ? -0.4 : 0.1;
    rating = Math.max(4.5, Math.min(9.9, rating));
    return { playerId: p.id, rating: Math.round(rating * 10) / 10, goals, assists };
  });

  const motm = [...entries].sort((a, b) => b.rating - a.rating)[0];
  const events: MatchResult["events"] = [
    { minute: 0, type: "ko", teamSide: "neutral", text: "Kick off" },
  ];
  const oppName = dataset.teams.find((t) => t.id === oppId)?.shortName ?? "opponent";
  for (const e of entries) {
    const p = game.players.find((x) => x.id === e.playerId);
    for (let g = 0; g < e.goals; g++) {
      events.push({ minute: 5 + Math.floor(rng() * 85), type: "goal", teamSide: "home", text: `${p?.name ?? "Unknown"} ${myGoals > 0 ? "scores" : ""} vs ${oppName}` });
    }
  }
  events.push({ minute: 90, type: "ft", teamSide: "neutral", text: `Full time: ${fixture.homeId === game.clubId ? score.homeGoals : score.awayGoals}-${fixture.homeId === game.clubId ? score.awayGoals : score.homeGoals}` });

  const poss = Math.round(50 + (userHome ? hs - as : as - hs) * 0.9);
  const shots = Math.max(3, Math.round(6 + myGoals * 2.4 + rng() * 5));
  const oppShots = Math.max(2, Math.round(5 + oppGoals * 2.2 + rng() * 5));
  const userShots = userHome ? shots : oppShots;
  const oppSideShots = userHome ? oppShots : shots;

  const injuries: number[] = [];
  if (rng() < 0.12 && starters.length > 0) {
    const victim = starters[Math.floor(rng() * starters.length)];
    injuries.push(victim.id);
  }

  return {
    fixtureId: fixture.id,
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    homeGoals: score.homeGoals,
    awayGoals: score.awayGoals,
    events,
    ratings: entries,
    stats: {
      possession: [userHome ? poss : 100 - poss, userHome ? 100 - poss : poss],
      shots: [shots, oppShots],
      onTarget: [Math.max(1, Math.round(userShots * 0.4)), Math.max(1, Math.round(oppSideShots * 0.38))],
      xg: [Math.round((myGoals * 0.85 + 0.4) * 10) / 10, Math.round((oppGoals * 0.85 + 0.35) * 10) / 10],
    },
    injuries,
    motmPlayerId: motm?.playerId ?? null,
    shotLog: [],
    momentum: userHome ? 20 : -20,
  };
}
