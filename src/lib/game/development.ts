import type { PlayerAttributes, PlayerRow, PlayerState, PositionCode, SquadRole } from "./types";
import { mulberry32, computeMarketValue, computeSalary } from "./defaultData";
import { positionGroup } from "./formations";

/* ============================================================
 * DEVELOPMENT MECHANICS (per master spec v3.0)
 *  - Weekly XP  = Base * AgeFactor * SharpnessBonus * Coach * Playtime
 *  - Sharpness boosts (+5/+3/0/-4)
 *  - Age decay after 31 (pace first, then physical, technical slow)
 *  - Retirement 34-38 outfield / 36-41 GK  ->  regens
 *  - End-of-season dynamic potential recalculation (max +7 / -6)
 * ============================================================ */

export function ageFactor(age: number): number {
  if (age < 18) return 1.5;
  if (age <= 26) return 1.0;
  if (age <= 30) return 0.6;
  return 0.1;
}

export function sharpnessBoost(sharpness: number): number {
  if (sharpness >= 80) return 5;
  if (sharpness >= 60) return 3;
  if (sharpness >= 40) return 0;
  return -4;
}

export function sharpnessMorale(sharpness: number): "Very High" | "High" | "Neutral" | "Low" {
  if (sharpness >= 80) return "Very High";
  if (sharpness >= 60) return "High";
  if (sharpness >= 40) return "Neutral";
  return "Low";
}

/** Growth engine: raises attributes toward potential. Returns XP gained. */
export function weeklyDevelopment(
  player: PlayerState,
  playedMinutes: number, // 0-90 this week (0 = did not play)
  coachQuality = 1.0, // 1.05 Novice / 1.15 Accomplished / 1.30 Expert
  rng: () => number = Math.random,
): number {
  const ageF = ageFactor(player.age);
  // Sharpness bonus: match-fit players train better
  const sharpBonus = 0.8 + (player.sharpness / 100) * 0.4;
  // Playtime multiplier: 1.0 for full match, 0.35 if unused
  const playtime = playedMinutes >= 60 ? 1.0 : playedMinutes > 0 ? 0.6 : 0.35;
  const headroom = player.potential - player.overallRating;
  if (headroom <= 0) {
    // At/above potential — only tiny maintenance growth for youngsters
    return 0;
  }
  const baseXp = 1.6;
  const xp = baseXp * ageF * sharpBonus * coachQuality * playtime;
  // Convert XP into attribute points probabilistically (1 attribute tick = 1 point)
  const chance = Math.min(0.95, xp / 3.2);
  if (rng() < chance) {
    const attrs: (keyof PlayerAttributes)[] = ["pace", "shooting", "passing", "dribbling", "defending", "physical"];
    // weigh growth toward the player's key attributes for the position
    const key = keyAttributes(player.position);
    const pool = rng() < 0.65 ? key : attrs;
    const attr = pool[Math.floor(rng() * pool.length)];
    if (player.attributes[attr] < 99) {
      player.attributes = { ...player.attributes, [attr]: player.attributes[attr] + 1 };
      recomputeOverall(player);
    }
  }
  return xp;
}

export function keyAttributes(pos: PositionCode): (keyof PlayerAttributes)[] {
  const g = positionGroup(pos);
  switch (g) {
    case "GK": return ["defending", "physical", "passing"];
    case "DEF": return ["defending", "physical", "pace"];
    case "MID": return ["passing", "dribbling", "physical"];
    case "ATT": return ["shooting", "pace", "dribbling"];
  }
}

const OVR_WEIGHTS: Record<PositionCode, Partial<Record<keyof PlayerAttributes, number>>> = {
  GK: { defending: 0.5, physical: 0.2, passing: 0.15, pace: 0.1, dribbling: 0.05 },
  CB: { defending: 0.4, physical: 0.25, pace: 0.15, passing: 0.12, dribbling: 0.08 },
  LB: { defending: 0.25, pace: 0.25, physical: 0.15, passing: 0.2, dribbling: 0.15 },
  RB: { defending: 0.25, pace: 0.25, physical: 0.15, passing: 0.2, dribbling: 0.15 },
  LWB: { pace: 0.28, defending: 0.2, passing: 0.2, dribbling: 0.18, physical: 0.14 },
  RWB: { pace: 0.28, defending: 0.2, passing: 0.2, dribbling: 0.18, physical: 0.14 },
  CDM: { defending: 0.3, passing: 0.25, physical: 0.22, pace: 0.1, dribbling: 0.13 },
  CM: { passing: 0.32, dribbling: 0.2, physical: 0.16, defending: 0.14, pace: 0.18 },
  CAM: { passing: 0.3, dribbling: 0.3, shooting: 0.22, pace: 0.18 },
  LM: { pace: 0.28, dribbling: 0.26, passing: 0.24, shooting: 0.12, physical: 0.1 },
  RM: { pace: 0.28, dribbling: 0.26, passing: 0.24, shooting: 0.12, physical: 0.1 },
  LAM: { passing: 0.28, dribbling: 0.3, shooting: 0.22, pace: 0.2 },
  RAM: { passing: 0.28, dribbling: 0.3, shooting: 0.22, pace: 0.2 },
  LW: { pace: 0.3, dribbling: 0.32, shooting: 0.2, passing: 0.18 },
  RW: { pace: 0.3, dribbling: 0.32, shooting: 0.2, passing: 0.18 },
  LF: { shooting: 0.28, dribbling: 0.3, pace: 0.24, passing: 0.18 },
  RF: { shooting: 0.28, dribbling: 0.3, pace: 0.24, passing: 0.18 },
  CF: { shooting: 0.34, dribbling: 0.26, pace: 0.2, physical: 0.12, passing: 0.08 },
  ST: { shooting: 0.4, pace: 0.24, dribbling: 0.18, physical: 0.18 },
};

export function computeOverall(attrs: PlayerAttributes, pos: PositionCode): number {
  const w = OVR_WEIGHTS[pos];
  let sum = 0, total = 0;
  (Object.keys(attrs) as (keyof PlayerAttributes)[]).forEach((k) => {
    const weight = w[k] ?? 0.1;
    sum += attrs[k] * weight;
    total += weight;
  });
  return Math.round(sum / total);
}

export function recomputeOverall(player: { attributes: PlayerAttributes; position: PositionCode; overallRating: number }): void {
  player.overallRating = computeOverall(player.attributes, player.position);
}

/* ---------------- Age decay & retirement ---------------- */

export function applySeasonDecay(player: PlayerState, rng: () => number = Math.random): void {
  if (player.age < 31) return;
  const intensity = player.age - 30; // 1,2,3...
  const decline = (n: number) => Math.max(1, Math.round(n * (0.7 + rng() * 0.6)));
  // Priority: pace first, then physical, technical slowest
  const paceDrop = decline(intensity * 1.6);
  const physDrop = decline(intensity * 1.1);
  const techDrop = rng() < 0.5 ? decline(intensity * 0.4) : 0;
  player.attributes = {
    ...player.attributes,
    pace: Math.max(20, player.attributes.pace - paceDrop),
    physical: Math.max(25, player.attributes.physical - physDrop),
    shooting: Math.max(25, player.attributes.shooting - techDrop),
    dribbling: Math.max(25, player.attributes.dribbling - techDrop),
  };
  recomputeOverall(player);
}

export function shouldRetire(player: { age: number; position: PositionCode; overallRating: number }, rng: () => number = Math.random): boolean {
  const [minAge, maxAge] = player.position === "GK" ? [36, 41] : [34, 38];
  if (player.age < minAge) return false;
  if (player.age >= maxAge) return true;
  // probability ramps up between min and max age
  const t = (player.age - minAge) / (maxAge - minAge);
  return rng() < 0.15 + t * 0.6;
}

/** New youth spawned when a real player retires (same nation/league context). */
export function generateRegen(retired: PlayerRow, newId: number, rng: () => number = mulberry32(Date.now() & 0xffffffff)): PlayerRow {
  const age = 16 + Math.floor(rng() * 3); // 16-18
  const pos = retired.position;
  const attrs: PlayerAttributes = {
    pace: 45 + Math.floor(rng() * 25),
    shooting: 40 + Math.floor(rng() * 25),
    passing: 42 + Math.floor(rng() * 25),
    dribbling: 44 + Math.floor(rng() * 25),
    defending: 38 + Math.floor(rng() * 28),
    physical: 42 + Math.floor(rng() * 25),
  };
  const ovr = computeOverall(attrs, pos);
  const potential = Math.min(94, Math.max(retired.potential - 6, ovr + 8 + Math.floor(rng() * 18)));
  const firstNames = ["Kai", "Noel", "Rui", "Milo", "Ezra", "Tye", "Idris", "Louie", "Sacha", "Rasmus"];
  const lastNames = ["Bennett", "Oyarzun", "Keita", "Hallstrom", "Marchetti", "Dubois", "Ferrer", "Nkemdi", "Aaltonen", "Bravo"];
  const name = `${firstNames[Math.floor(rng() * firstNames.length)]} ${lastNames[Math.floor(rng() * lastNames.length)]}`;
  return {
    id: newId,
    teamId: rng() < 0.5 ? retired.teamId : -1, // -1 = free agency pool
    name,
    age,
    position: pos,
    overallRating: ovr,
    potential,
    marketValue: computeMarketValue(ovr, age, potential),
    salary: computeSalary(ovr),
    attributes: attrs,
  };
}

/* ---------------- Dynamic potential (end of season) ---------------- */

export interface SeasonPerformanceSummary {
  apps: number;
  leagueMatches: number;
  avgRating: number; // 0 if no apps
  goals: number;
  assists: number;
  cleanSheets: number;
  teamTrophies: number;
}

export function recalcPotential(
  player: PlayerState,
  perf: SeasonPerformanceSummary,
  rng: () => number = Math.random,
): { delta: number; reason: string } {
  if (player.overallRating >= player.potential) return { delta: 0, reason: "At potential ceiling" };
  const appRatio = perf.leagueMatches > 0 ? perf.apps / perf.leagueMatches : 0;
  let delta = 0;
  const reasons: string[] = [];

  if (appRatio >= 0.7) { delta += 3; reasons.push("regular starter"); }
  else if (appRatio < 0.3 && appRatio >= 0) { delta -= 2; reasons.push("lack of minutes"); }

  if (perf.avgRating >= 7.2 && perf.apps >= 5) { delta += 2; reasons.push("high match ratings"); }
  else if (perf.avgRating > 0 && perf.avgRating < 6.4 && perf.apps >= 5) { delta -= 1; reasons.push("poor form"); }

  const g = positionGroup(player.position);
  if ((g === "ATT" || g === "MID") && perf.goals + perf.assists >= Math.max(8, perf.apps * 0.55)) {
    delta += 2; reasons.push("G/A output");
  }
  if ((g === "DEF" || g === "GK") && perf.cleanSheets >= Math.max(6, perf.apps * 0.4)) {
    delta += 1; reasons.push("defensive record");
  }
  if (perf.teamTrophies > 0) { delta += 1; reasons.push("team success"); }

  delta = Math.max(-6, Math.min(7, delta));
  if (rng() < 0.15) delta = Math.max(-6, delta - 1); // small noise
  return { delta, reason: reasons.length ? reasons.join(", ") : "steady development" };
}

export function autoSquadRole(player: PlayerState, squad: PlayerState[]): SquadRole {
  const sorted = [...squad].sort((a, b) => b.overallRating - a.overallRating);
  const idx = sorted.findIndex((p) => p.id === player.id);
  const rank = idx < 0 ? sorted.length : idx;
  if (rank < 3) return "Star Player";
  if (rank < 8) return "Important";
  if (player.age <= 21 && player.potential >= player.overallRating + 6) return "Prospect";
  return "Rotation";
}
