import type { DrillGrade, GameState, PlayerState, PreMatchDrillResult } from "./types";
import { positionGroup } from "./formations";

/**
 * v4.7 — Pre-Match Drills.
 *
 * The manager runs the whole drill session once before a fixture (no manual
 * drill-by-drill play). Session quality is graded A/B/C/D from the squad's
 * average sharpness plus coaching quality. Grades A-C temporarily unlock a
 * special PlayStyle on the most suitable starters for that match only.
 */

export interface DrillDef {
  id: string;
  name: string;
  desc: string;
  /** special temporary PlayStyle id handed to granted players */
  styleId: string;
  styleName: string;
  styleDesc: string;
  /** position groups the drill targets when picking recipients */
  suit: ("GK" | "DEF" | "MID" | "ATT")[];
}

export const DRILLS: DrillDef[] = [
  {
    id: "finishing",
    name: "Finishing drill",
    desc: "Repetition in front of goal — first touch, composure, strike.",
    styleId: "drill-finish",
    styleName: "Sharp Finisher",
    styleDesc: "+6% finishing quality for this match.",
    suit: ["ATT"],
  },
  {
    id: "pressing",
    name: "Pressing drill",
    desc: "Coordinated pressing traps and quick rest-defence transitions.",
    styleId: "drill-press",
    styleName: "Press Machine",
    styleDesc: "Sharper midfield pressing, slower stamina drain for this match.",
    suit: ["MID"],
  },
  {
    id: "defensive-shape",
    name: "Defensive shape drill",
    desc: "Back-line spacing, blocking angles and clearances.",
    styleId: "drill-wall",
    styleName: "Disciplined Wall",
    styleDesc: "+4% defensive solidity for this match.",
    suit: ["DEF", "GK"],
  },
];

export const GRADE_META: Record<DrillGrade, { label: string; cls: string; grants: number }> = {
  A: { label: "Grade A — Excellent session", cls: "border-emerald-500/60 bg-emerald-500/10 text-emerald-400", grants: 2 },
  B: { label: "Grade B — Good session", cls: "border-teal-500/60 bg-teal-500/10 text-teal-300", grants: 1 },
  C: { label: "Grade C — Average session", cls: "border-amber-500/60 bg-amber-500/10 text-amber-400", grants: 1 }, // 40% chance
  D: { label: "Grade D — Sloppy session", cls: "border-rose-500/60 bg-rose-500/10 text-rose-400", grants: 0 },
};

/** Session grade from squad sharpness + coach quality, rng-dominant but skill-tilted. */
export function resolveDrillGrade(avgSharpness: number, coachMult: number, rng: () => number): DrillGrade {
  const coachQ = Math.max(0, Math.min(1, (coachMult - 1.05) / 0.25)); // Novice 0 → Expert 1
  const sharpQ = Math.max(0, Math.min(1, (avgSharpness - 35) / 55));
  const q = sharpQ * 0.65 + coachQ * 0.35;
  const roll = rng() * 0.62 + q * 0.38;
  if (roll >= 0.82) return "A";
  if (roll >= 0.58) return "B";
  if (roll >= 0.32) return "C";
  return "D";
}

function grantRecipients(
  drill: DrillDef,
  count: number,
  starters: PlayerState[],
  alreadyGranted: Set<number>,
): PlayerState[] {
  const eligible = starters.filter((p) => p.injuryWeeks === 0 && !alreadyGranted.has(p.id));
  const suited = eligible.filter((p) => drill.suit.includes(positionGroup(p.position)));
  const pool = suited.length > 0 ? suited : eligible;
  return [...pool].sort((a, b) => b.overallRating - a.overallRating).slice(0, count);
}

/** Run the full drill session for the upcoming fixture. One outcome per fixture. */
export function runPreMatchDrills(game: GameState, fixtureRound: number, rng: () => number = Math.random): PreMatchDrillResult {
  const coachMult = 1 + (COACH_BONUS[game.staff?.coachLevel ?? "Accomplished"] ?? 0.15);
  const starters = game.lineup
    .map((id) => game.players.find((p) => p.id === id))
    .filter((p): p is PlayerState => Boolean(p));
  const avgSharp = starters.length ? starters.reduce((s, p) => s + p.sharpness, 0) / starters.length : 50;

  const grades = DRILLS.map((d) => ({ drill: d.id, grade: resolveDrillGrade(avgSharp, coachMult, rng) }));
  const grants: { playerId: number; styleId: string }[] = [];
  const grantedIds = new Set<number>();

  for (const g of grades) {
    const def = DRILLS.find((d) => d.id === g.drill)!;
    let count = GRADE_META[g.grade].grants;
    if (g.grade === "C") count = rng() < 0.4 ? 1 : 0;
    if (count <= 0) continue;
    for (const p of grantRecipients(def, count, starters, grantedIds)) {
      grants.push({ playerId: p.id, styleId: def.styleId });
      grantedIds.add(p.id);
    }
  }

  return { fixtureRound, grades, grants };
}

/** Coach multiplier table mirrored from advance.ts to avoid a circular import. */
const COACH_BONUS: Record<string, number> = {
  Novice: 0.05,
  Accomplished: 0.15,
  Expert: 0.3,
};
