import { getFormation, positionAffinity } from "./formations";
import type { PlayerState, PositionCode } from "./types";

/**
 * Shared assignment engine: fills a formation with squad players.
 *
 * v4.9 — position-first placement. Every slot code is offered to players whose
 * NATURAL position matches the slot before anyone else (sorted by the caller's
 * need score), so rotation never drags a striker into defence or a centre-back
 * out to the wing. Only when a code lacks naturals do adjacent roles (best
 * affinity × overall + need) fill the gap.
 *
 * v5.0 — `opts.minAffinity` constrains phase 2: candidates below that affinity
 * are never considered (used by rotation so backups stay position-faithful).
 * A final relaxed pass fills any remaining hole rather than fielding 10 men.
 */
function assignPositions(
  squad: PlayerState[],
  formationName: string,
  needScore: (p: PlayerState) => number,
  opts?: { minAffinity?: number },
): (number | null)[] {
  const formation = getFormation(formationName);
  const minAff = opts?.minAffinity ?? 0.15;
  const fit = squad.filter((p) => p.injuryWeeks === 0);
  const pool = fit.length >= 11 ? fit : squad; // tiny squad: allow crocks as last resort

  const run = (candidates: PlayerState[], minAffinity: number): (number | null)[] => {
    const used = new Set<number>();
    const lineup: (number | null)[] = new Array(formation.positions.length).fill(null);

    // ---- Phase 1: natural positions ----
    const slotsByCode = new Map<PositionCode, number[]>();
    formation.positions.forEach((code, i) => {
      const arr = slotsByCode.get(code) ?? [];
      arr.push(i);
      slotsByCode.set(code, arr);
    });
    const naturalsOf = (code: PositionCode) =>
      candidates.filter((p) => p.position === code && !used.has(p.id));
    // Codes with the smallest natural surplus pick first, so scarce natural
    // players (1 GK, 2 CBs...) are never stolen by a code with many options.
    const codes = [...slotsByCode.keys()].sort(
      (a, b) => naturalsOf(a).length - slotsByCode.get(a)!.length -
        (naturalsOf(b).length - slotsByCode.get(b)!.length),
    );
    for (const code of codes) {
      const slots = slotsByCode.get(code)!;
      const naturals = naturalsOf(code)
        .sort((a, b) => needScore(b) - needScore(a) || b.overallRating - a.overallRating)
        .slice(0, slots.length);
      naturals.forEach((p, k) => {
        used.add(p.id);
        lineup[slots[k]] = p.id;
      });
    }

    // ---- Phase 2: remaining slots → best affinity × overall + need ----
    formation.positions.forEach((slot, i) => {
      if (lineup[i] !== null) return;
      let best: { p: PlayerState; s: number } | null = null;
      for (const p of candidates) {
        if (used.has(p.id)) continue;
        const aff = positionAffinity(p.position, slot);
        if (aff < minAffinity) continue;
        const s = p.overallRating * aff + needScore(p);
        if (!best || s > best.s) best = { p, s };
      }
      if (best && best.s > -50) {
        used.add(best.p.id);
        lineup[i] = best.p.id;
      }
    });
    return lineup;
  };

  let lineup = run(pool, minAff);
  // tiny squad fallback: allow injured players when nothing else fills the XI
  if (lineup.some((id) => id === null) && pool.length < squad.length) {
    const filled = run(squad, minAff);
    lineup = lineup.map((id, i) => (id === null ? filled[i] : id));
  }
  // strict rotation must never field 10 men — relaxed pass for any last hole
  // (0.2 still blocks outfield-in-goal, the 0.15 GK↔outfield pairing)
  if (lineup.some((id) => id === null) && minAff > 0.2) {
    const filled = run(pool, 0.2);
    lineup = lineup.map((id, i) => (id === null ? filled[i] : id));
  }
  return lineup;
}

/**
 * Auto-pick the strongest legal XI. Naturals hold their position first;
 * gaps are filled by the best adjacent role.
 */
export function autoPickLineup(squad: PlayerState[], formationName: string): (number | null)[] {
  return assignPositions(squad, formationName, (p) => {
    const sharpAdj = p.sharpness >= 80 ? 5 : p.sharpness >= 60 ? 3 : p.sharpness >= 40 ? 0 : -4;
    const injured = p.injuryWeeks > 0 ? -100 : 0;
    return sharpAdj + injured + (p.morale - 60) * 0.05;
  });
}

/**
 * v4.9 Auto-rotation: give minutes to players who need them, WITHOUT taking
 * anyone out of their natural position. For each slot code the naturals who
 * most need minutes (few apps, low sharpness) step in; fatigued players are
 * held back; only codes without naturals reach for adjacent roles.
 *
 * v5.0 — strictly position-aware: phase 2 candidates must be at least
 * "Competent" (affinity ≥ 0.8) for the slot, so rotation never fields a
 * striker at centre-back. A relaxed fallback pass guarantees 11 names.
 */
export function autoRotateLineup(squad: PlayerState[], formationName: string): (number | null)[] {
  const appsOf = (p: PlayerState) => p.seasonStats?.apps ?? 0;
  const maxApps = Math.max(1, ...squad.map(appsOf));
  return assignPositions(squad, formationName, (p) => {
    const sharpAdj = p.sharpness >= 80 ? 5 : p.sharpness >= 60 ? 3 : p.sharpness >= 40 ? 0 : -4;
    // rotation priority: unplayed players float to the top (max +10)
    const rotationBoost = (1 - appsOf(p) / maxApps) * 10;
    // players low on sharpness need matches to raise it
    const sharpnessNeed = p.sharpness < 55 ? 6 : p.sharpness < 70 ? 3 : 0;
    // exhausted players are held back even if they need minutes
    const fatiguePenalty = p.stamina < 55 ? -9 : p.stamina < 70 ? -4 : 0;
    const injured = p.injuryWeeks > 0 ? -100 : 0;
    return rotationBoost + sharpnessNeed + fatiguePenalty + sharpAdj + injured + (p.morale - 60) * 0.05;
  }, { minAffinity: 0.8 });
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
