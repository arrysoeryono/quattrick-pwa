import type { PositionCode } from "./types";

export interface Formation {
  name: string;
  category: string;
  /** number of defenders in back line (3, 4 or 5) */
  backLine: 3 | 4 | 5;
  /** 11 slot codes, ordered GK -> defence -> midfield -> attack */
  positions: PositionCode[];
}

const f = (name: string, category: string, backLine: 3 | 4 | 5, positions: PositionCode[]): Formation => ({
  name,
  category,
  backLine,
  positions,
});

export const FORMATIONS: Formation[] = [
  // ---------------- Back 4 ----------------
  f("4-3-3 Standard", "Balanced", 4, ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "RW", "ST", "LW"]),
  f("4-3-3 Attack", "Attacking", 4, ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CAM", "RW", "ST", "LW"]),
  f("4-3-3 Defend", "Defensive", 4, ["GK", "RB", "CB", "CB", "LB", "CDM", "CDM", "CM", "RW", "ST", "LW"]),
  f("4-3-3 Holding", "Balanced", 4, ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CM", "RW", "ST", "LW"]),
  f("4-3-3 False 9", "Possession", 4, ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CM", "RW", "CF", "LW"]),
  f("4-4-2 Flat", "Balanced", 4, ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "LM", "ST", "ST"]),
  f("4-4-2 Holding", "Defensive", 4, ["GK", "RB", "CB", "CB", "LB", "RM", "CDM", "CDM", "LM", "ST", "ST"]),
  f("4-2-3-1 Wide", "Balanced", 4, ["GK", "RB", "CB", "CB", "LB", "CDM", "CDM", "CAM", "RM", "LM", "ST"]),
  f("4-2-3-1 Narrow", "Meta / Control", 4, ["GK", "RB", "CB", "CB", "LB", "CDM", "CDM", "LAM", "CAM", "RAM", "ST"]),
  f("4-1-2-1-2 Narrow", "Central Attack", 4, ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CM", "CAM", "ST", "ST"]),
  f("4-1-2-1-2 Wide", "Wide Attack", 4, ["GK", "RB", "CB", "CB", "LB", "CDM", "RM", "LM", "CAM", "ST", "ST"]),
  f("4-3-2-1 Tree", "Counter Attack", 4, ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "LF", "RF", "ST"]),
  f("4-3-1-2", "Central Attack", 4, ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "CM", "CAM", "ST", "ST"]),
  f("4-2-2-2", "Meta / Balanced Attack", 4, ["GK", "RB", "CB", "CB", "LB", "CDM", "CDM", "CAM", "CAM", "ST", "ST"]),
  f("4-1-4-1", "Control", 4, ["GK", "RB", "CB", "CB", "LB", "CDM", "RM", "CM", "CM", "LM", "ST"]),
  f("4-5-1 Flat", "Midfield Control", 4, ["GK", "RB", "CB", "CB", "LB", "RM", "CM", "CM", "CM", "LM", "ST"]),
  f("4-5-1 Attack", "Heavy Attacking Midfield", 4, ["GK", "RB", "CB", "CB", "LB", "CM", "RM", "CAM", "CAM", "LM", "ST"]),
  f("4-2-4", "Ultra Attacking", 4, ["GK", "RB", "CB", "CB", "LB", "CM", "CM", "RW", "LW", "ST", "ST"]),
  // ---------------- Back 3 ----------------
  f("3-5-2", "Balanced Wing Control", 3, ["GK", "CB", "CB", "CB", "CDM", "CDM", "RM", "LM", "CAM", "ST", "ST"]),
  f("3-4-1-2", "Attacking Midfield", 3, ["GK", "CB", "CB", "CB", "CM", "CM", "RM", "LM", "CAM", "ST", "ST"]),
  f("3-4-2-1", "High Press", 3, ["GK", "CB", "CB", "CB", "CM", "CM", "RM", "LM", "LF", "RF", "ST"]),
  f("3-4-3 Flat", "Attacking Possession", 3, ["GK", "CB", "CB", "CB", "RM", "CM", "CM", "LM", "RW", "ST", "LW"]),
  f("3-1-4-2", "Single Pivot Control", 3, ["GK", "CB", "CB", "CB", "CDM", "RM", "CM", "CM", "LM", "ST", "ST"]),
  f("3-4-3 Diamond", "Total Football", 3, ["GK", "CB", "CB", "CB", "CDM", "RM", "LM", "CAM", "RW", "ST", "LW"]),
  f("3-4-3 Wing Backs", "Attacking Wing Play", 3, ["GK", "CB", "CB", "CB", "RWB", "CDM", "CM", "LWB", "RW", "ST", "LW"]),
  // ---------------- Back 5 ----------------
  f("5-3-2", "Counter Attack / Solid", 5, ["GK", "RWB", "CB", "CB", "CB", "LWB", "CM", "CM", "CM", "ST", "ST"]),
  f("5-2-1-2", "Counter Attack", 5, ["GK", "RWB", "CB", "CB", "CB", "LWB", "CM", "CM", "CAM", "ST", "ST"]),
  f("5-4-1 Flat", "Ultra Defensive", 5, ["GK", "RWB", "CB", "CB", "CB", "LWB", "RM", "CM", "CM", "LM", "ST"]),
  f("5-4-1 Diamond", "Defensive Control", 5, ["GK", "RWB", "CB", "CB", "CB", "LWB", "CDM", "RM", "LM", "CAM", "ST"]),
  f("5-2-3", "Wing Counter Attack", 5, ["GK", "RWB", "CB", "CB", "CB", "LWB", "CM", "CM", "RW", "ST", "LW"]),
];

export function getFormation(name: string): Formation {
  return FORMATIONS.find((x) => x.name === name) ?? FORMATIONS[0];
}

export type PositionGroup = "GK" | "DEF" | "MID" | "ATT";

const GROUPS: Record<PositionCode, PositionGroup> = {
  GK: "GK",
  CB: "DEF", LB: "DEF", RB: "DEF", LWB: "DEF", RWB: "DEF",
  CDM: "MID", CM: "MID", CAM: "MID", LM: "MID", RM: "MID", LAM: "MID", RAM: "MID",
  LW: "ATT", RW: "ATT", LF: "ATT", RF: "ATT", CF: "ATT", ST: "ATT",
};

export function positionGroup(p: PositionCode): PositionGroup {
  return GROUPS[p];
}

/** Adjacent-role pairs that convert with minor retraining (0.70–0.95 band). */
const ADJACENT: Partial<Record<PositionCode, Partial<Record<PositionCode, number>>>> = {
  LB: { LWB: 0.95, RB: 0.8, CB: 0.7, LM: 0.8 },
  LWB: { LB: 0.95, LM: 0.8, CB: 0.65, RB: 0.75 },
  RB: { RWB: 0.95, LB: 0.8, CB: 0.7, RM: 0.8 },
  RWB: { RB: 0.95, RM: 0.8, CB: 0.65, LB: 0.75 },
  CB: { CDM: 0.75, LB: 0.7, RB: 0.7, LWB: 0.65, RWB: 0.65 },
  CDM: { CM: 0.9, CB: 0.7, CAM: 0.7 },
  CM: { CDM: 0.9, CAM: 0.9, LM: 0.8, RM: 0.8, LAM: 0.8, RAM: 0.8 },
  CAM: { CM: 0.9, CF: 0.8, ST: 0.7, LF: 0.8, RF: 0.8, LAM: 0.95, RAM: 0.95 },
  LAM: { CAM: 0.95, LM: 0.85, CM: 0.8, LF: 0.8, LW: 0.8 },
  RAM: { CAM: 0.95, RM: 0.85, CM: 0.8, RF: 0.8, RW: 0.8 },
  LM: { LW: 0.85, LWB: 0.8, CM: 0.8, LB: 0.75, LF: 0.8, LAM: 0.85, RM: 0.8 },
  RM: { RW: 0.85, RWB: 0.8, CM: 0.8, RB: 0.75, RF: 0.8, RAM: 0.85, LM: 0.8 },
  LW: { LM: 0.85, LF: 0.9, ST: 0.75, LAM: 0.8, RW: 0.8, CF: 0.75 },
  RW: { RM: 0.85, RF: 0.9, ST: 0.75, RAM: 0.8, LW: 0.8, CF: 0.75 },
  LF: { LW: 0.9, CF: 0.85, CAM: 0.8, ST: 0.8, RF: 0.85, LAM: 0.8 },
  RF: { RW: 0.9, CF: 0.85, CAM: 0.8, ST: 0.8, LF: 0.85, RAM: 0.8 },
  CF: { ST: 0.95, CAM: 0.8, LF: 0.85, RF: 0.85, LW: 0.75, RW: 0.75 },
  ST: { CF: 0.95, LF: 0.8, RF: 0.8, LW: 0.7, RW: 0.7, CAM: 0.65 },
};

/**
 * Slot affinity multiplier — drives chemistry & effective rating.
 * 1.0 exact role · 0.7–0.95 adjacent role · 0.8 same group · 0.45 out of position · 0.15 GK↔outfield.
 */
export function positionAffinity(playerPos: PositionCode, slotPos: PositionCode): number {
  if (playerPos === slotPos) return 1;
  if (playerPos === "GK" || slotPos === "GK") return 0.15;
  const adj = ADJACENT[playerPos]?.[slotPos];
  if (adj) return adj;
  const rev = ADJACENT[slotPos]?.[playerPos];
  if (rev) return rev;
  if (GROUPS[playerPos] === GROUPS[slotPos]) return 0.8;
  return 0.45;
}

export function affinityLabel(a: number): { label: string; tone: "great" | "good" | "ok" | "bad" } {
  if (a >= 0.95) return { label: "Natural", tone: "great" };
  if (a >= 0.8) return { label: "Competent", tone: "good" };
  if (a >= 0.65) return { label: "Unfamiliar", tone: "ok" };
  return { label: "Out of position", tone: "bad" };
}

/**
 * Base pitch coordinates (x: 0..1 left→right, y: 0..1 own-goal→opponent-goal)
 * used to draw formations on the tactics pitch. Same-code slots are spread
 * horizontally so e.g. 3 CBs or 2 STs render side by side.
 */
export function formationCoordinates(positions: PositionCode[]): { code: PositionCode; x: number; y: number }[] {
  const base: Partial<Record<PositionCode, { x: number; y: number }>> = {
    GK: { x: 0.5, y: 0.94 },
    CB: { x: 0.5, y: 0.8 },
    LB: { x: 0.14, y: 0.74 },
    RB: { x: 0.86, y: 0.74 },
    LWB: { x: 0.1, y: 0.68 },
    RWB: { x: 0.9, y: 0.68 },
    CDM: { x: 0.5, y: 0.62 },
    CM: { x: 0.5, y: 0.54 },
    LM: { x: 0.13, y: 0.5 },
    RM: { x: 0.87, y: 0.5 },
    CAM: { x: 0.5, y: 0.4 },
    LAM: { x: 0.3, y: 0.4 },
    RAM: { x: 0.7, y: 0.4 },
    LW: { x: 0.14, y: 0.24 },
    RW: { x: 0.86, y: 0.24 },
    LF: { x: 0.33, y: 0.28 },
    RF: { x: 0.67, y: 0.28 },
    CF: { x: 0.5, y: 0.3 },
    ST: { x: 0.5, y: 0.14 },
  };
  const byCode = new Map<PositionCode, number[]>();
  positions.forEach((code, i) => {
    const arr = byCode.get(code) ?? [];
    arr.push(i);
    byCode.set(code, arr);
  });
  const out: { code: PositionCode; x: number; y: number }[] = new Array(positions.length);
  byCode.forEach((indices, code) => {
    const b = base[code] ?? { x: 0.5, y: 0.5 };
    const n = indices.length;
    indices.forEach((slotIndex, k) => {
      let x = b.x;
      if (n > 1) {
        const spread = n === 2 ? 0.22 : n === 3 ? 0.3 : 0.36;
        x = b.x + (k - (n - 1) / 2) * spread;
      }
      out[slotIndex] = { code, x: Math.min(0.94, Math.max(0.06, x)), y: b.y };
    });
  });
  return out;
}
