/**
 * v5.1 — Development Center projections.
 *
 * Pure, side-effect-free helpers that power the per-player Development
 * screen: a weekly XP breakdown explaining every growth multiplier, and a
 * deterministic multi-week growth simulation (seeded per player) that shows
 * where the current training plan is heading.
 */

import type { PlayerState } from "./types";
import { INTENSITY_META, ageFactor, tickRetrain, weeklyDevelopment } from "./development";
import { mulberry32 } from "./defaultData";
import { isGKAttributes } from "./attributes";

/** Weekly XP for a player under the current plan (mirrors the engine formula). */
export function estimateWeeklyXp(
  player: PlayerState,
  minutes: number,
  coachQ: number,
): number {
  const plan = player.trainingPlan ?? { focus: "balanced", intensity: "normal" };
  const intensity = INTENSITY_META[plan.intensity]?.xpMult ?? 1;
  const ageF = ageFactor(player.age);
  const sharpBonus = 0.8 + (player.sharpness / 100) * 0.4;
  const playtime = minutes >= 60 ? 1.0 : minutes > 0 ? 0.6 : 0.35;
  const headroom = player.potential - player.overallRating;
  if (headroom <= 0) return 0;
  return (
    1.6 * ageF * sharpBonus * coachQ * playtime * intensity *
    (player.retrain ? 0.5 : 1) *
    (player.devPath ? 1.1 : 1) *
    (player.mentor ? 1.25 : 1)
  );
}

export interface GrowthMultiplier {
  key: string;
  label: string;
  value: number;
  tone: "good" | "bad" | "neutral";
}

/** The full multiplier chain, for the breakdown chips on the dev screen. */
export function growthMultipliers(
  player: PlayerState,
  minutes: number,
  coachQ: number,
): GrowthMultiplier[] {
  const plan = player.trainingPlan ?? { focus: "balanced", intensity: "normal" };
  const ageF = ageFactor(player.age);
  const sharpMult = 0.8 + (player.sharpness / 100) * 0.4;
  const playMult = minutes >= 60 ? 1.0 : minutes > 0 ? 0.6 : 0.35;
  const intensity = INTENSITY_META[plan.intensity]?.xpMult ?? 1;
  return [
    { key: "age", label: `Age ${player.age}`, value: ageF, tone: ageF >= 1 ? "good" : ageF >= 0.6 ? "neutral" : "bad" },
    { key: "sharp", label: `Sharpness ${player.sharpness}`, value: sharpMult, tone: sharpMult >= 1.05 ? "good" : sharpMult >= 0.95 ? "neutral" : "bad" },
    { key: "minutes", label: minutes >= 60 ? "Full minutes" : minutes > 0 ? "Part minutes" : "No minutes", value: playMult, tone: playMult >= 1 ? "good" : playMult >= 0.6 ? "neutral" : "bad" },
    { key: "coach", label: "Coach", value: coachQ, tone: coachQ >= 1.25 ? "good" : "neutral" },
    { key: "intensity", label: `${plan.intensity} load`, value: intensity, tone: intensity > 1 ? "good" : intensity < 1 ? "bad" : "neutral" },
    ...(player.devPath ? [{ key: "path", label: "Evolution path", value: 1.1, tone: "good" as const }] : []),
    ...(player.mentor ? [{ key: "mentor", label: "Mentor", value: 1.25, tone: "good" as const }] : []),
    ...(player.retrain ? [{ key: "retrain", label: "Retraining", value: 0.5, tone: "bad" as const }] : []),
    ...(player.potential - player.overallRating <= 0 ? [{ key: "ceiling", label: "At potential ceiling", value: 0, tone: "bad" as const }] : []),
  ];
}

export interface GrowthProjection {
  weeks: number;
  startOvr: number;
  projectedOvr: number;
  /** attributes that grew, sorted by biggest gain first */
  gains: { attr: string; delta: number }[];
  /** position after the horizon (retraining may complete mid-simulation) */
  position: string;
}

/** Simulate `weeks` of development on a throwaway clone. Deterministic:
 *  the same player + plan always yields the same trajectory (seeded RNG). */
export function projectGrowth(
  player: PlayerState,
  weeks: number,
  ctx: { minutes: number; coachQ: number; mentor: PlayerState | null },
): GrowthProjection {
  const clone = JSON.parse(JSON.stringify(player)) as PlayerState;
  const rng = mulberry32((player.id * 2654435761) ^ 0x9e3779b9);
  const before = { ...clone.attributes } as Record<string, number>;
  const startOvr = clone.overallRating;
  for (let w = 0; w < weeks; w++) {
    weeklyDevelopment(clone, ctx.minutes, ctx.coachQ, rng, ctx.mentor);
    tickRetrain(clone); // conversions completing mid-horizon change OVR weighting
  }
  const after = clone.attributes as unknown as Record<string, number>;
  const gains = Object.keys(before)
    .map((attr) => ({ attr, delta: after[attr] - before[attr] }))
    .filter((g) => g.delta > 0)
    .sort((a, b) => b.delta - a.delta);
  return { weeks, startOvr, projectedOvr: clone.overallRating, gains, position: clone.position };
}

/** Estimated weekly minutes used by projections (lineup = full match). */
export function assumedMinutes(player: PlayerState, inLineup: boolean): number {
  if (inLineup) return 90;
  return isGKAttributes(player.attributes) ? 15 : 25;
}
