import type { PlayerAttributes, PlayerRow, PlayerState, PositionCode, SquadRole } from "./types";
import { mulberry32, computeMarketValue, computeSalary } from "./defaultData";
import { positionAffinity, positionGroup } from "./formations";

/* ============================================================
 * DEVELOPMENT MECHANICS (per master spec v4.0)
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

export function keyAttributes(pos: PositionCode): (keyof PlayerAttributes)[] {
  const g = positionGroup(pos);
  switch (g) {
    case "GK": return ["defending", "physical", "passing"];
    case "DEF": return ["defending", "physical", "pace"];
    case "MID": return ["passing", "dribbling", "physical"];
    case "ATT": return ["shooting", "pace", "dribbling"];
  }
}

/* ---------------- Training plans (FIFA-style development) ---------------- */

export const TRAINING_FOCUSES = ["balanced", "attacking", "defensive", "technical", "pace", "shooting"] as const;

/** Attribute pool a focus biases growth toward. */
export const FOCUS_POOL: Record<string, (keyof PlayerAttributes)[]> = {
  attacking: ["shooting", "dribbling", "pace"],
  defensive: ["defending", "physical"],
  technical: ["passing", "dribbling"],
  pace: ["pace", "physical"],
  shooting: ["shooting", "pace"],
};

export const INTENSITY_META = {
  light: { xpMult: 0.7, staminaDelta: 5, injuryRisk: 0, label: "Light — recover fast, slow growth" },
  normal: { xpMult: 1.0, staminaDelta: 0, injuryRisk: 0, label: "Normal — steady development" },
  intense: { xpMult: 1.35, staminaDelta: -6, injuryRisk: 0.02, label: "Intense — fast growth, fatigue & injury risk" },
} as const;

export interface WeeklyTrainingResult {
  xp: number;
  injury: boolean; // training injury this week (intense sessions only)
  staminaDelta: number;
}

/** Growth engine: raises attributes toward potential under the player's training plan. */
export function weeklyDevelopment(
  player: PlayerState,
  playedMinutes: number, // 0-90 this week (0 = did not play)
  coachQuality = 1.0, // 1.05 Novice / 1.15 Accomplished / 1.30 Expert
  rng: () => number = Math.random,
): WeeklyTrainingResult {
  const plan = player.trainingPlan ?? { focus: "balanced", intensity: "normal" };
  const intensity = INTENSITY_META[plan.intensity] ?? INTENSITY_META.normal;
  const ageF = ageFactor(player.age);
  // Sharpness bonus: match-fit players train better
  const sharpBonus = 0.8 + (player.sharpness / 100) * 0.4;
  // Playtime multiplier: 1.0 for full match, 0.6 partial, 0.35 unused
  const playtime = playedMinutes >= 60 ? 1.0 : playedMinutes > 0 ? 0.6 : 0.35;
  const headroom = player.potential - player.overallRating;
  let xp = 0;
  if (headroom > 0) {
    const baseXp = 1.6;
    // position retraining consumes half the weekly development budget
    const retrainPenalty = player.retrain ? 0.5 : 1;
    xp = baseXp * ageF * sharpBonus * coachQuality * playtime * intensity.xpMult * retrainPenalty;
    // Convert XP into attribute points probabilistically (1 attribute tick = 1 point)
    const chance = Math.min(0.95, xp / 3.2);
    if (rng() < chance) {
      const attrs: (keyof PlayerAttributes)[] = ["pace", "shooting", "passing", "dribbling", "defending", "physical"];
      const focusPool = FOCUS_POOL[plan.focus];
      let pool: (keyof PlayerAttributes)[];
      if (plan.focus === "balanced" || !focusPool) {
        // balanced: weigh toward the position's key attributes
        const key = keyAttributes(player.position);
        pool = rng() < 0.65 ? key : attrs;
      } else {
        // focused plan: 70% into the focus attributes, 30% general
        pool = rng() < 0.7 ? focusPool : attrs;
      }
      const attr = pool[Math.floor(rng() * pool.length)];
      if (player.attributes[attr] < 99) {
        player.attributes = { ...player.attributes, [attr]: player.attributes[attr] + 1 };
        recomputeOverall(player);
      }
    }
  }
  return {
    xp,
    injury: headroom > 0 && intensity.injuryRisk > 0 && rng() < intensity.injuryRisk,
    staminaDelta: intensity.staminaDelta,
  };
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

/* ---------------- Position retraining (conversion) ---------------- */

export function retrainWeeksFor(from: PositionCode, to: PositionCode): number {
  const aff = positionAffinity(from, to);
  if (aff >= 0.95) return 4;
  if (aff >= 0.85) return 6;
  if (aff >= 0.8) return 8;
  if (aff >= 0.7) return 12;
  if (aff >= 0.65) return 18;
  return 30;
}

export function canStartRetrain(player: PlayerState): boolean {
  if (player.position === "GK") return false; // keepers never convert
  if (player.retrain) return false;
  if (player.injuryWeeks > 0) return false;
  return player.age <= 32;
}

export function eligibleRetrainTargets(player: PlayerState): { pos: PositionCode; weeks: number }[] {
  return (Object.keys(ADJACENT_FOR_RETRAIN[player.position] ?? {}) as PositionCode[])
    .map((pos) => ({ pos, weeks: retrainWeeksFor(player.position, pos) }))
    .sort((a, b) => a.weeks - b.weeks);
}

const ADJACENT_FOR_RETRAIN: Partial<Record<PositionCode, Partial<Record<PositionCode, number>>>> = {
  CB: { CDM: 0.75, LB: 0.7, RB: 0.7, LWB: 0.65, RWB: 0.65 },
  LB: { LWB: 0.95, RB: 0.8, CB: 0.7, LM: 0.8 },
  RB: { RWB: 0.95, LB: 0.8, CB: 0.7, RM: 0.8 },
  LWB: { LB: 0.95, LM: 0.8, RB: 0.75, CB: 0.65, RWB: 0.85 },
  RWB: { RB: 0.95, RM: 0.8, LB: 0.75, CB: 0.65, LWB: 0.85 },
  CDM: { CM: 0.9, CB: 0.7, CAM: 0.7 },
  CM: { CDM: 0.9, CAM: 0.9, LM: 0.8, RM: 0.8 },
  CAM: { CM: 0.9, CF: 0.8, ST: 0.7, LW: 0.8, RW: 0.8 },
  LM: { LW: 0.85, LWB: 0.8, CM: 0.8, LB: 0.75 },
  RM: { RW: 0.85, RWB: 0.8, CM: 0.8, RB: 0.75 },
  LW: { LM: 0.85, LF: 0.9, ST: 0.75, RW: 0.8, LWB: 0.7 },
  RW: { RM: 0.85, RF: 0.9, ST: 0.75, LW: 0.8, RWB: 0.7 },
  LF: { LW: 0.9, CF: 0.85, ST: 0.8, CAM: 0.8 },
  RF: { RW: 0.9, CF: 0.85, ST: 0.8, CAM: 0.8 },
  CF: { ST: 0.95, CAM: 0.8, LF: 0.85, RF: 0.85 },
  ST: { CF: 0.95, LF: 0.8, RF: 0.8, CAM: 0.65 },
  GK: {},
};

export function startRetrain(player: PlayerState, target: PositionCode): number {
  const weeks = retrainWeeksFor(player.position, target);
  player.retrain = { target, weeksLeft: weeks, totalWeeks: weeks };
  return weeks;
}

/** Weekly retraining tick. Returns true when the conversion completes this week. */
export function tickRetrain(player: PlayerState): boolean {
  if (!player.retrain) return false;
  player.retrain.weeksLeft -= 1;
  if (player.retrain.weeksLeft <= 0) {
    player.position = player.retrain.target;
    player.retrain = null;
    recomputeOverall(player);
    return true;
  }
  return false;
}

/* ---------------- PlayStyles (FIFA-like badges) ---------------- */

export interface PlayStyleDef {
  id: string;
  name: string;
  desc: string;
  attr: keyof PlayerAttributes;
  /** secondary attribute gate for styles built on a combo */
  alt?: keyof PlayerAttributes;
}

export const PLAYSTYLES: PlayStyleDef[] = [
  { id: "rapid", name: "Rapid", desc: "Explosive sprinter who repeatedly breaks the line.", attr: "pace" },
  { id: "clinical", name: "Clinical Finisher", desc: "Ice-cold in front of goal.", attr: "shooting" },
  { id: "playmaker", name: "Playmaker", desc: "Sees and executes passes others cannot.", attr: "passing" },
  { id: "maestro", name: "Maestro", desc: "Glides past defenders with close control.", attr: "dribbling" },
  { id: "rock", name: "Rock", desc: "Reads danger and kills it early.", attr: "defending" },
  { id: "powerhouse", name: "Powerhouse", desc: "Dominates physically in every duel.", attr: "physical" },
  { id: "engine", name: "Engine", desc: "Endless stamina across both penalty areas.", attr: "pace", alt: "physical" },
];

/** Standard badge at 80+, plus-version at 85+ with OVR 85 / POT 90 (master spec). */
export function computePlayStyles(p: { attributes: PlayerAttributes; overallRating: number; potential: number }): { id: string; name: string; plus: boolean }[] {
  const plusEligible = p.overallRating >= 85 && p.potential >= 90;
  const out: { id: string; name: string; plus: boolean }[] = [];
  for (const s of PLAYSTYLES) {
    const main = p.attributes[s.attr] >= 80;
    const alt = s.alt ? p.attributes[s.alt] >= 75 : true;
    if (main && alt) {
      const plus = plusEligible && p.attributes[s.attr] >= 85;
      out.push({ id: s.id, name: s.name, plus });
    }
  }
  return out;
}

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
