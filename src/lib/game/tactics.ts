import { getFormation, positionAffinity } from "./formations";
import type { PlayerState, PositionCode } from "./types";

/**
 * Auto-pick the strongest legal XI for a formation: greedy by
 * (affinity × overall), goalkeepers handled first.
 */
export function autoPickLineup(squad: PlayerState[], formationName: string): (number | null)[] {
  const formation = getFormation(formationName);
  const used = new Set<number>();
  const lineup: (number | null)[] = [];

  const score = (p: PlayerState, slot: PositionCode) => {
    const aff = positionAffinity(p.position, slot);
    const sharpAdj = p.sharpness >= 80 ? 5 : p.sharpness >= 60 ? 3 : p.sharpness >= 40 ? 0 : -4;
    const injured = p.injuryWeeks > 0 ? -100 : 0;
    return p.overallRating * aff + sharpAdj + injured + (p.morale - 60) * 0.05;
  };

  formation.positions.forEach((slot) => {
    const candidates = squad
      .filter((p) => !used.has(p.id))
      .map((p) => ({ p, s: score(p, slot) }))
      .sort((a, b) => b.s - a.s);
    const pick = candidates[0];
    if (pick && pick.s > -50) {
      used.add(pick.p.id);
      lineup.push(pick.p.id);
    } else {
      lineup.push(null);
    }
  });
  return lineup;
}

/**
 * v4.8 Auto-rotation: pick a competitive XI that prioritises players who need
 * minutes — fewer season appearances and low sharpness earn a bigger boost,
 * while fatigued (low stamina) players are held back. Keeps the team strong
 * enough to compete but rotates fairly, raising squad sharpness over time.
 */
export function autoRotateLineup(squad: PlayerState[], formationName: string): (number | null)[] {
  const formation = getFormation(formationName);
  const used = new Set<number>();
  const lineup: (number | null)[] = [];

  const fit = squad.filter((p) => p.injuryWeeks === 0);
  const pool = fit.length >= 11 ? fit : squad; // tiny squad: allow crocks as last resort
  const appsOf = (p: PlayerState) => p.seasonStats?.apps ?? 0;
  const maxApps = Math.max(1, ...pool.map(appsOf));

  const score = (p: PlayerState, slot: PositionCode) => {
    const aff = positionAffinity(p.position, slot);
    const sharpAdj = p.sharpness >= 80 ? 5 : p.sharpness >= 60 ? 3 : p.sharpness >= 40 ? 0 : -4;
    // rotation priority: unplayed players float to the top (max +10)
    const rotationBoost = (1 - appsOf(p) / maxApps) * 10;
    // players low on sharpness need matches to raise it
    const sharpnessNeed = p.sharpness < 55 ? 6 : p.sharpness < 70 ? 3 : 0;
    // exhausted players are held back even if they need minutes
    const fatiguePenalty = p.stamina < 55 ? -9 : p.stamina < 70 ? -4 : 0;
    const injured = p.injuryWeeks > 0 ? -100 : 0;
    return p.overallRating * aff + rotationBoost + sharpnessNeed + fatiguePenalty + sharpAdj + injured + (p.morale - 60) * 0.05;
  };

  formation.positions.forEach((slot) => {
    const candidates = pool
      .filter((p) => !used.has(p.id))
      .map((p) => ({ p, s: score(p, slot) }))
      .sort((a, b) => b.s - a.s);
    const pick = candidates[0];
    if (pick && pick.s > -50) {
      used.add(pick.p.id);
      lineup.push(pick.p.id);
    } else {
      lineup.push(null);
    }
  });
  return lineup;
}

/** Effective displayed rating for a squad player in a slot (UI). */
export function effectiveOvr(p: PlayerState, slot: PositionCode): number {
  const aff = positionAffinity(p.position, slot);
  const sharpAdj = p.sharpness >= 80 ? 5 : p.sharpness >= 60 ? 3 : p.sharpness >= 40 ? 0 : -4;
  return Math.round(p.overallRating * aff + sharpAdj);
}

/** Team chemistry 0-100 from slot affinities + role spread. */
export function squadChemistry(squad: PlayerState[], formationName: string, lineup: (number | null)[]): number {
  const formation = getFormation(formationName);
  let sum = 0;
  let count = 0;
  lineup.forEach((id, i) => {
    if (!id) return;
    const p = squad.find((x) => x.id === id);
    if (!p) return;
    sum += positionAffinity(p.position, formation.positions[i]);
    count++;
  });
  if (!count) return 0;
  const base = (sum / count) * 100; // 45..100
  return Math.round(base);
}

export const POSITIONS_BY_GROUP = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CDM", "CM", "CAM", "LM", "RM", "LAM", "RAM"],
  ATT: ["LW", "RW", "LF", "RF", "CF", "ST"],
} as const;
