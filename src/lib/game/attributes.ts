import type { GKAttributes, PlayerAttributes, PositionCode, PositionalAttributes } from "./types";

/* ============================================================
 * QUATTRICK ATTRIBUTE SYSTEM
 * Goalkeepers carry their own attribute set, separate from the
 * six outfield attributes (pace/shooting/passing/dribbling/
 * defending/physical):
 *
 *   DIV  Diving       — reach & body control when flying at shots
 *   HAN  Handling     — catching and holding the ball
 *   REF  Reflexes     — reaction speed on close-range efforts
 *   POS  Positioning  — angles, being in the right spot
 *   KIC  Kicking      — goal kicks & distribution
 *   SPD  Speed        — mobility, rushing off the line, sweeper-keeping
 * ============================================================ */

export const OUTFIELD_ATTR_KEYS = [
  "pace", "shooting", "passing", "dribbling", "defending", "physical",
] as const;

export const GK_ATTR_KEYS = [
  "diving", "handling", "reflexes", "positioning", "kicking", "speed",
] as const;

export type OutfieldAttrKey = (typeof OUTFIELD_ATTR_KEYS)[number];
export type GkAttrKey = (typeof GK_ATTR_KEYS)[number];
export type AttrKey = OutfieldAttrKey | GkAttrKey;

/** Short labels shown in the UI (FIFA style). */
export const OUTFIELD_ATTR_LABELS: Record<OutfieldAttrKey, string> = {
  pace: "PAC",
  shooting: "SHO",
  passing: "PAS",
  dribbling: "DRI",
  defending: "DEF",
  physical: "PHY",
};

export const GK_ATTR_LABELS: Record<GkAttrKey, string> = {
  diving: "DIV",
  handling: "HAN",
  reflexes: "REF",
  positioning: "POS",
  kicking: "KIC",
  speed: "SPD",
};

export const GK_ATTR_FULL: Record<GkAttrKey, string> = {
  diving: "Diving",
  handling: "Handling",
  reflexes: "Reflexes",
  positioning: "Positioning",
  kicking: "Kicking",
  speed: "Speed",
};

/** True when the position is a goalkeeper slot. */
export function isGKPosition(pos: PositionCode): boolean {
  return pos === "GK";
}

/** True when the attribute object carries the goalkeeper shape. */
export function isGKAttributes(attrs: PositionalAttributes): attrs is GKAttributes {
  return "diving" in attrs && "reflexes" in attrs;
}

export function isOutfieldAttributes(attrs: PositionalAttributes): attrs is PlayerAttributes {
  return "pace" in attrs;
}

/** Union of every legal attribute key (used by parsers and dev paths). */
export function isAttrKey(key: string): key is AttrKey {
  return (OUTFIELD_ATTR_KEYS as readonly string[]).includes(key) ||
    (GK_ATTR_KEYS as readonly string[]).includes(key);
}

/** Safe numeric read — returns the attribute value if the key exists on the
 *  attribute shape, otherwise the provided fallback. Lets engine math stay
 *  type-safe across the two shapes. */
export function attrValue<K extends AttrKey>(
  attrs: PositionalAttributes,
  key: K,
  fallback: number,
): number {
  const rec = attrs as unknown as Record<string, number | undefined>;
  return rec[key] ?? fallback;
}

/** How much of a shot the keeper stops, independent of xG.
 *  70-quality keeper = neutral 1.0; 90 = ~0.92; 50 = ~1.07. */
export function gkSaveFactor(attrs: GKAttributes): number {
  const quality =
    attrs.reflexes * 0.42 +
    attrs.diving * 0.3 +
    attrs.positioning * 0.16 +
    attrs.handling * 0.12;
  return Math.max(0.82, Math.min(1.14, 1.12 - (quality - 70) / 240));
}

/** Single-number keeper quality for UI badges and quick stats. */
export function gkQuality(attrs: GKAttributes): number {
  return Math.round(
    attrs.reflexes * 0.42 +
    attrs.diving * 0.3 +
    attrs.positioning * 0.16 +
    attrs.handling * 0.12,
  );
}

/**
 * Legacy migration: old saves stored outfield attributes on goalkeepers.
 * Converts them to the GK shape while preserving the player's quality level,
 * then returns the new attribute object (input is not mutated).
 */
export function migrateLegacyGkAttributes(
  old: PlayerAttributes,
): GKAttributes {
  const mean = Math.round(
    (old.defending + old.physical + old.passing + old.pace) / 4,
  );
  // old GK profile deltas were defending+8 / physical+4 / passing-8 / pace-18
  return clampGk({
    diving: mean + 8 + (old.defending - mean) * 0.6,
    handling: mean + 4 + (old.physical - mean) * 0.5,
    reflexes: mean + 4 + (old.pace - mean) * 0.3,
    positioning: mean + 5 + (old.defending - mean) * 0.4,
    kicking: mean - 10 + (old.passing - mean) * 0.5,
    speed: mean - 6 + (old.pace - mean) * 0.3,
  });
}

/** Legacy rename: pre-v4.6 keepers carried "command" (CMD) where "speed"
 *  (SPD) lives now. Maps the value 1:1 so nothing is lost. */
export function migrateCommandToSpeed(attrs: GKAttributes): GKAttributes {
  if ("speed" in attrs && typeof attrs.speed === "number") return attrs;
  const legacy = attrs as unknown as Record<string, number>;
  return clampGk({
    diving: attrs.diving,
    handling: attrs.handling,
    reflexes: attrs.reflexes,
    positioning: attrs.positioning,
    kicking: attrs.kicking,
    speed: legacy.command ?? 50,
  });
}

export function clampGk(attrs: GKAttributes): GKAttributes {
  const c = (v: number) => Math.min(97, Math.max(20, Math.round(v)));
  return {
    diving: c(attrs.diving),
    handling: c(attrs.handling),
    reflexes: c(attrs.reflexes),
    positioning: c(attrs.positioning),
    kicking: c(attrs.kicking),
    speed: c(attrs.speed),
  };
}

/** Migrate one dataset/career player if it still carries a legacy GK shape
 *  (outfield attributes, or the retired "command" key). Returns the (possibly)
 *  updated attributes; `overallChanged` signals the caller to recompute
 *  overallRating. */
export function migratePlayerAttributes(
  position: PositionCode,
  attrs: PositionalAttributes,
): { attributes: PositionalAttributes; changed: boolean } {
  if (position === "GK") {
    if (!isGKAttributes(attrs)) {
      return {
        attributes: migrateLegacyGkAttributes(attrs as PlayerAttributes),
        changed: true,
      };
    }
    // legacy command-keyed GK shape → rename command to speed
    if (!("speed" in attrs) && "command" in (attrs as unknown as Record<string, unknown>)) {
      return {
        attributes: migrateCommandToSpeed(attrs),
        changed: true,
      };
    }
  }
  return { attributes: attrs, changed: false };
}

/* ---------------- Overall rating ---------------- */

/** Keeper OVR weights (diving + reflexes dominate). */
export const GK_OVR_WEIGHTS: Partial<Record<GkAttrKey, number>> = {
  diving: 0.26,
  reflexes: 0.26,
  positioning: 0.18,
  handling: 0.14,
  kicking: 0.1,
  speed: 0.06,
};

/** Outfield weights per position — GK row only serves legacy saves whose
 *  keepers still carry outfield attributes. */
export const OUTFIELD_OVR_WEIGHTS: Record<PositionCode, Partial<Record<OutfieldAttrKey, number>>> = {
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

/** Weighted overall from attributes — picks the GK table automatically when the
 *  attribute object carries the goalkeeper shape. */
export function computeOverall(attrs: PositionalAttributes, pos: PositionCode): number {
  const gk = isGKAttributes(attrs);
  const keys = gk ? GK_ATTR_KEYS : OUTFIELD_ATTR_KEYS;
  const w = gk ? GK_OVR_WEIGHTS : OUTFIELD_OVR_WEIGHTS[pos];
  const rec = attrs as unknown as Record<string, number>;
  let sum = 0, total = 0;
  keys.forEach((k) => {
    const weight = w[k] ?? 0.1;
    sum += rec[k] * weight;
    total += weight;
  });
  return Math.round(sum / total);
}
