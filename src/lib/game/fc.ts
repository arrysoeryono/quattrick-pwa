/**
 * v4.9 — EA Sports FC-style attribute mechanics.
 *
 * Face stats (PAC/SHO/PAS/DRI/DEF/PHY) remain the stored source of truth the
 * engine and overall rating use — exactly like FC 27, where base stats keep
 * the leading role. On top of them this module DERIVES, deterministically
 * from (player id, position, face stats):
 *
 *   · 29 outfield in-game stats (the FC specific-attribute set), spread inside
 *     each face-stat group with position flavour and seeded personality noise,
 *     weighted so every group averages back to its face stat.
 *   · Profile attributes: Skill Moves (1-5), Weak Foot (1-5), Preferred Foot,
 *     Body Type and AcceleRATE (Explosive / Controlled / Lengthy).
 *   · Player Roles with + / ++ mastery levels (False 9, Box-to-Box, ...).
 *
 * Keepers already carry the FC goalkeeper set 1:1 (DIV/HAN/REF/POS/KIC/SPD),
 * so no sub-attribute derivation is needed for them.
 *
 * Pure & stateless: no save migration, works for legacy saves, datasets and
 * AI squads alike.
 */
import type { GKAttributes, PlayerAttributes, PlayerRow, PositionCode, PositionalAttributes } from "./types";
import { isGKAttributes } from "./attributes";

/* ============================================================
 * In-game stat catalog (29 outfield specifics)
 * ============================================================ */

export type FcAttrKey =
  // Pace
  | "acceleration" | "sprintSpeed"
  // Shooting
  | "attackingPositioning" | "finishing" | "shotPower" | "longShots" | "volleys" | "penalties"
  // Passing
  | "vision" | "crossing" | "fkAccuracy" | "shortPassing" | "longPassing" | "curve"
  // Dribbling
  | "agility" | "balance" | "reactions" | "ballControl" | "dribbling" | "composure"
  // Defending
  | "interceptions" | "headingAccuracy" | "defAwareness" | "standingTackle" | "slidingTackle"
  // Physical
  | "jumping" | "staminaAttr" | "strength" | "aggression";

export interface FcAttrDef {
  key: FcAttrKey;
  label: string;
  /** weight inside its face-stat group (sums to 1 per group) */
  weight: number;
}

export interface FcGroupDef {
  face: keyof PlayerAttributes;
  code: string; // PAC / SHO / ...
  label: string;
  attrs: FcAttrDef[];
}

export const FC_GROUPS: FcGroupDef[] = [
  {
    face: "pace", code: "PAC", label: "Pace",
    attrs: [
      { key: "acceleration", label: "Acceleration", weight: 0.45 },
      { key: "sprintSpeed", label: "Sprint Speed", weight: 0.55 },
    ],
  },
  {
    face: "shooting", code: "SHO", label: "Shooting",
    attrs: [
      { key: "attackingPositioning", label: "Att. Positioning", weight: 0.15 },
      { key: "finishing", label: "Finishing", weight: 0.30 },
      { key: "shotPower", label: "Shot Power", weight: 0.20 },
      { key: "longShots", label: "Long Shots", weight: 0.14 },
      { key: "volleys", label: "Volleys", weight: 0.11 },
      { key: "penalties", label: "Penalties", weight: 0.10 },
    ],
  },
  {
    face: "passing", code: "PAS", label: "Passing",
    attrs: [
      { key: "vision", label: "Vision", weight: 0.22 },
      { key: "crossing", label: "Crossing", weight: 0.14 },
      { key: "fkAccuracy", label: "FK Accuracy", weight: 0.08 },
      { key: "shortPassing", label: "Short Passing", weight: 0.32 },
      { key: "longPassing", label: "Long Passing", weight: 0.16 },
      { key: "curve", label: "Curve", weight: 0.08 },
    ],
  },
  {
    face: "dribbling", code: "DRI", label: "Dribbling",
    attrs: [
      { key: "agility", label: "Agility", weight: 0.15 },
      { key: "balance", label: "Balance", weight: 0.10 },
      { key: "reactions", label: "Reactions", weight: 0.10 },
      { key: "ballControl", label: "Ball Control", weight: 0.25 },
      { key: "dribbling", label: "Dribbling", weight: 0.30 },
      { key: "composure", label: "Composure", weight: 0.10 },
    ],
  },
  {
    face: "defending", code: "DEF", label: "Defending",
    attrs: [
      { key: "interceptions", label: "Interceptions", weight: 0.20 },
      { key: "headingAccuracy", label: "Heading Acc.", weight: 0.13 },
      { key: "defAwareness", label: "Def. Awareness", weight: 0.30 },
      { key: "standingTackle", label: "Standing Tackle", weight: 0.25 },
      { key: "slidingTackle", label: "Sliding Tackle", weight: 0.12 },
    ],
  },
  {
    face: "physical", code: "PHY", label: "Physicality",
    attrs: [
      { key: "jumping", label: "Jumping", weight: 0.18 },
      { key: "staminaAttr", label: "Stamina", weight: 0.27 },
      { key: "strength", label: "Strength", weight: 0.34 },
      { key: "aggression", label: "Aggression", weight: 0.21 },
    ],
  },
];

/* ============================================================
 * Position flavour — sparse deltas blended into the seeded noise.
 * They are re-centred per group so the face stat stays invariant.
 * ============================================================ */

type Profile = Partial<Record<FcAttrKey, number>>;

const POSITION_PROFILE: Partial<Record<PositionCode, Profile>> = {
  ST: {
    finishing: 6, attackingPositioning: 5, volleys: 3, penalties: 3, shotPower: 2,
    longShots: -8, crossing: -10, fkAccuracy: -8, curve: -6, vision: -6, shortPassing: -6, longPassing: -4,
    headingAccuracy: 3, defAwareness: -10, interceptions: -12, standingTackle: -12, slidingTackle: -14,
    strength: 4, aggression: 3, jumping: 4,
  },
  CF: {
    finishing: 3, attackingPositioning: 3, vision: 4, shortPassing: 3, dribbling: 2, curve: 2,
    defAwareness: -8, interceptions: -10, standingTackle: -10, slidingTackle: -12, crossing: -5,
    longShots: -3, fkAccuracy: -5,
  },
  LF: {
    acceleration: 5, sprintSpeed: 3, dribbling: 5, agility: 5, balance: 2, ballControl: 4, curve: 3, crossing: 3,
    strength: -6, aggression: -6, jumping: -5, standingTackle: -8, slidingTackle: -10, defAwareness: -8, headingAccuracy: -9,
  },
  RF: {
    acceleration: 5, sprintSpeed: 3, dribbling: 5, agility: 5, balance: 2, ballControl: 4, curve: 3, crossing: 3,
    strength: -6, aggression: -6, jumping: -5, standingTackle: -8, slidingTackle: -10, defAwareness: -8, headingAccuracy: -9,
  },
  LW: {
    acceleration: 5, sprintSpeed: 4, crossing: 5, curve: 4, dribbling: 6, agility: 6, balance: 3, ballControl: 5,
    strength: -7, aggression: -7, jumping: -6, standingTackle: -8, slidingTackle: -10, defAwareness: -8, headingAccuracy: -10,
    penalties: -3,
  },
  RW: {
    acceleration: 5, sprintSpeed: 4, crossing: 5, curve: 4, dribbling: 6, agility: 6, balance: 3, ballControl: 5,
    strength: -7, aggression: -7, jumping: -6, standingTackle: -8, slidingTackle: -10, defAwareness: -8, headingAccuracy: -10,
    penalties: -3,
  },
  CAM: {
    vision: 6, shortPassing: 5, fkAccuracy: 4, curve: 5, ballControl: 5, dribbling: 5, composure: 5, agility: 4,
    defAwareness: -8, standingTackle: -8, slidingTackle: -10, strength: -6, headingAccuracy: -6, aggression: -5,
  },
  LAM: {
    vision: 5, shortPassing: 4, fkAccuracy: 3, curve: 4, ballControl: 4, dribbling: 4, agility: 4,
    defAwareness: -7, standingTackle: -7, slidingTackle: -9, strength: -5, headingAccuracy: -5,
  },
  RAM: {
    vision: 5, shortPassing: 4, fkAccuracy: 3, curve: 4, ballControl: 4, dribbling: 4, agility: 4,
    defAwareness: -7, standingTackle: -7, slidingTackle: -9, strength: -5, headingAccuracy: -5,
  },
  CM: {
    vision: 6, shortPassing: 6, longPassing: 4, ballControl: 4, composure: 4, reactions: 3, staminaAttr: 5,
    slidingTackle: -3, headingAccuracy: -4, jumping: -4,
  },
  CDM: {
    defAwareness: 6, interceptions: 6, standingTackle: 6, strength: 5, aggression: 4, shortPassing: 4, longPassing: 3,
    finishing: -8, volleys: -6, penalties: -6, crossing: -6, fkAccuracy: -8, longShots: -4,
  },
  LM: {
    crossing: 5, staminaAttr: 5, sprintSpeed: 3, dribbling: 3, curve: 3,
    defAwareness: -5, standingTackle: -5, slidingTackle: -6, headingAccuracy: -5, strength: -4,
  },
  RM: {
    crossing: 5, staminaAttr: 5, sprintSpeed: 3, dribbling: 3, curve: 3,
    defAwareness: -5, standingTackle: -5, slidingTackle: -6, headingAccuracy: -5, strength: -4,
  },
  CB: {
    headingAccuracy: 8, defAwareness: 6, standingTackle: 6, slidingTackle: 6, interceptions: 6,
    aggression: 4, strength: 5, jumping: 6,
    finishing: -10, attackingPositioning: -8, longShots: -10, penalties: -8, volleys: -8,
    crossing: -12, curve: -8, fkAccuracy: -12, dribbling: -8, agility: -4,
  },
  LB: {
    crossing: 5, defAwareness: 5, interceptions: 5, standingTackle: 5, staminaAttr: 6, sprintSpeed: 3,
    finishing: -12, attackingPositioning: -10, penalties: -10, volleys: -10, longShots: -8, fkAccuracy: -10,
  },
  RB: {
    crossing: 5, defAwareness: 5, interceptions: 5, standingTackle: 5, staminaAttr: 6, sprintSpeed: 3,
    finishing: -12, attackingPositioning: -10, penalties: -10, volleys: -10, longShots: -8, fkAccuracy: -10,
  },
  LWB: {
    crossing: 6, staminaAttr: 8, sprintSpeed: 4, defAwareness: 3, standingTackle: 2,
    finishing: -12, attackingPositioning: -10, penalties: -10, volleys: -10, longShots: -8, fkAccuracy: -10, strength: -4,
  },
  RWB: {
    crossing: 6, staminaAttr: 8, sprintSpeed: 4, defAwareness: 3, standingTackle: 2,
    finishing: -12, attackingPositioning: -10, penalties: -10, volleys: -10, longShots: -8, fkAccuracy: -10, strength: -4,
  },
};

/* ============================================================
 * Deterministic PRNG (mulberry32) — same id + face stats = same profile.
 * ============================================================ */

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ============================================================
 * In-game stat derivation
 * ============================================================ */

export type FcStats = Record<FcAttrKey, number>;

/** Derive the 29 FC in-game stats from the stored face stats. GK → null. */
export function deriveFcStats(p: { id: number; position: PositionCode; attributes: PositionalAttributes }): FcStats | null {
  const attrs = p.attributes;
  if (isGKAttributes(attrs)) return null;
  const out = {} as FcStats;
  const rng = seeded(p.id * 2654435761 + 97);
  const profile = POSITION_PROFILE[p.position] ?? {};
  for (const group of FC_GROUPS) {
    const face = attrs[group.face];
    // raw delta = position flavour + personality noise
    const raw = group.attrs.map((a) => (profile[a.key] ?? 0) + (rng() * 7 - 3.5));
    // re-centre so the weighted mean stays exactly on the face stat
    const wmean = group.attrs.reduce((s, a, i) => s + a.weight * raw[i], 0);
    group.attrs.forEach((a, i) => {
      out[a.key] = clamp(Math.round(face + raw[i] - wmean), 1, 99);
    });
  }
  return out;
}

/* ============================================================
 * Profile attributes — Skill Moves, Weak Foot, foot, body, AcceleRATE
 * ============================================================ */

export type AcceleRate = "Explosive" | "Controlled" | "Lengthy";
export type BodyType = "Lean" | "Average" | "Sturdy";

/** Left-flank & creative spots run noticeably more left-footed. */
const LEFT_FOOT_BIAS: Partial<Record<PositionCode, number>> = {
  LB: 0.5, LWB: 0.5, LM: 0.5, LAM: 0.45, LW: 0.5, LF: 0.45, CAM: 0.32, CF: 0.32,
};

/** 1-5 star skill moves from dribbling quality with a seeded nudge. */
export function deriveSkillMoves(id: number, attrs: PlayerAttributes): number {
  const rng = seeded(id * 747796405 + 2891336453);
  let sm = attrs.dribbling >= 88 ? 5 : attrs.dribbling >= 80 ? 4 : attrs.dribbling >= 68 ? 3 : attrs.dribbling >= 55 ? 2 : 1;
  const roll = rng();
  if (roll < 0.22) sm += 1;
  else if (roll > 0.78) sm -= 1;
  return clamp(sm, 1, 5);
}

/** 1-5 star weak foot from technical quality with a seeded nudge. */
export function deriveWeakFoot(id: number, attrs: PlayerAttributes): number {
  const rng = seeded(id * 374761393 + 668265263);
  const tech = (attrs.passing + attrs.dribbling) / 2;
  let wf = tech >= 86 ? 5 : tech >= 78 ? 4 : tech >= 68 ? 3 : tech >= 55 ? 2 : 1;
  const roll = rng();
  if (roll < 0.3) wf += 1;
  else if (roll > 0.7) wf -= 1;
  return clamp(wf, 1, 5);
}

export function derivePreferredFoot(id: number, position: PositionCode): "Left" | "Right" {
  const rng = seeded(id * 1274126177 + 1013904223);
  return rng() < (LEFT_FOOT_BIAS[position] ?? 0.24) ? "Left" : "Right";
}

function deriveBodyType(attrs: PlayerAttributes): BodyType {
  const diff = attrs.physical - attrs.dribbling;
  if (diff >= 12) return "Sturdy";
  if (diff <= -12) return "Lean";
  return "Average";
}

function deriveAcceleRate(stats: FcStats, attrs: PlayerAttributes): AcceleRate {
  if (stats.acceleration >= stats.sprintSpeed + 5 && stats.agility >= 68) return "Explosive";
  if (stats.sprintSpeed >= stats.acceleration + 3 && attrs.physical >= 74) return "Lengthy";
  return "Controlled";
}

/* ============================================================
 * Player Roles (+ / ++)
 * ============================================================ */

export interface FcRoleDef {
  id: string;
  name: string;
  positions: PositionCode[];
  /** weighted key attributes — first carries the most weight */
  attrs: string[]; // FcAttrKey for outfield, GkAttrKey for keepers
}

export const FC_ROLES: FcRoleDef[] = [
  // GK
  { id: "gk-goalkeeper", name: "Goalkeeper", positions: ["GK"], attrs: ["reflexes", "diving", "positioning"] },
  { id: "sweeper-keeper", name: "Sweeper Keeper", positions: ["GK"], attrs: ["speed", "kicking", "reflexes"] },
  // CB
  { id: "defender", name: "Defender", positions: ["CB"], attrs: ["defAwareness", "standingTackle", "strength"] },
  { id: "stopper", name: "Stopper", positions: ["CB"], attrs: ["slidingTackle", "aggression", "jumping"] },
  { id: "ball-playing-defender", name: "Ball-Playing Defender", positions: ["CB"], attrs: ["shortPassing", "longPassing", "vision"] },
  // Full-backs & wing-backs
  { id: "fullback", name: "Fullback", positions: ["LB", "RB", "LWB", "RWB"], attrs: ["defAwareness", "crossing", "staminaAttr"] },
  { id: "wingback", name: "Wingback", positions: ["LB", "RB", "LWB", "RWB"], attrs: ["staminaAttr", "sprintSpeed", "crossing"] },
  { id: "attacking-wingback", name: "Attacking Wingback", positions: ["LWB", "RWB"], attrs: ["crossing", "sprintSpeed", "staminaAttr"] },
  { id: "falseback", name: "Falseback", positions: ["LB", "RB"], attrs: ["shortPassing", "ballControl", "composure"] },
  // Midfield
  { id: "holding", name: "Holding", positions: ["CDM", "CM"], attrs: ["defAwareness", "standingTackle", "interceptions"] },
  { id: "centre-half", name: "Centre-Half", positions: ["CDM"], attrs: ["standingTackle", "strength", "headingAccuracy"] },
  { id: "deep-lying-playmaker", name: "Deep-Lying Playmaker", positions: ["CDM", "CM"], attrs: ["longPassing", "vision", "shortPassing"] },
  { id: "box-to-box", name: "Box-to-Box", positions: ["CM"], attrs: ["staminaAttr", "shortPassing", "strength"] },
  { id: "playmaker", name: "Playmaker", positions: ["CM", "CAM"], attrs: ["vision", "shortPassing", "longPassing"] },
  { id: "shadow-striker", name: "Shadow Striker", positions: ["CAM", "LAM", "RAM", "LF", "RF"], attrs: ["finishing", "attackingPositioning", "dribbling"] },
  { id: "half-winger", name: "Half-Winger", positions: ["CM", "CAM", "LM", "RM"], attrs: ["staminaAttr", "vision", "defAwareness"] },
  // Wide
  { id: "winger", name: "Winger", positions: ["LW", "RW", "LM", "RM", "LAM", "RAM", "LF", "RF"], attrs: ["sprintSpeed", "acceleration", "crossing"] },
  { id: "inside-forward", name: "Inside Forward", positions: ["LW", "RW", "LF", "RF"], attrs: ["finishing", "dribbling", "acceleration"] },
  { id: "wide-playmaker", name: "Wide Playmaker", positions: ["LW", "RW", "LM", "RM", "LAM", "RAM"], attrs: ["vision", "crossing", "shortPassing"] },
  { id: "wide-midfielder", name: "Wide Midfielder", positions: ["LM", "RM"], attrs: ["staminaAttr", "defAwareness", "crossing"] },
  // Strikers
  { id: "advanced-forward", name: "Advanced Forward", positions: ["ST", "CF"], attrs: ["finishing", "attackingPositioning", "sprintSpeed"] },
  { id: "poacher", name: "Poacher", positions: ["ST"], attrs: ["finishing", "attackingPositioning", "volleys"] },
  { id: "target-forward", name: "Target Forward", positions: ["ST"], attrs: ["strength", "headingAccuracy", "jumping"] },
  { id: "false-9", name: "False 9", positions: ["ST", "CF"], attrs: ["vision", "shortPassing", "dribbling"] },
];

export type RoleLevel = "++" | "+" | "familiar";

export interface FcRole {
  id: string;
  name: string;
  level: RoleLevel;
}

/** Roles the player masters at their natural position, best first (max 3). */
export function deriveRoles(
  position: PositionCode,
  attributes: PositionalAttributes,
  stats: FcStats | null,
): FcRole[] {
  const read = (key: string): number => {
    if (stats) return stats[key as FcAttrKey];
    // keepers read straight off their attribute shape
    const rec = attributes as unknown as Record<string, number>;
    return rec[key] ?? 0;
  };
  const out: FcRole[] = [];
  for (const role of FC_ROLES) {
    if (!role.positions.includes(position)) continue;
    // 0.45 first key attribute, remaining split evenly
    const w0 = 0.45;
    const wr = (1 - w0) / Math.max(1, role.attrs.length - 1);
    let score = 0;
    role.attrs.forEach((k, i) => {
      score += read(k) * (i === 0 ? w0 : wr);
    });
    const level: RoleLevel = score >= 86 ? "++" : score >= 76 ? "+" : score >= 66 ? "familiar" : "familiar";
    if (score >= 66) out.push({ id: role.id, name: role.name, level });
    if (out.length >= 3) break;
  }
  // ensure the strongest sorts first
  return out.sort((a, b) => (a.level === "++" ? -1 : 0) - (b.level === "++" ? -1 : 0)).slice(0, 3);
}

/* ============================================================
 * Full profile (UI + match engine payload)
 * ============================================================ */

export interface FcProfile {
  /** derived in-game stats — null for keepers (their 6 attrs ARE the specifics) */
  stats: FcStats | null;
  skillMoves: number; // 1-5
  weakFoot: number; // 1-5
  preferredFoot: "Left" | "Right";
  bodyType: BodyType;
  acceleRATE: AcceleRate;
  roles: FcRole[];
}

export function buildFcProfile(p: Pick<PlayerRow, "id" | "position" | "attributes">): FcProfile {
  const stats = deriveFcStats(p);
  if (isGKAttributes(p.attributes)) {
    const attrs = p.attributes as GKAttributes;
    return {
      stats: null,
      skillMoves: 1,
      weakFoot: 1,
      preferredFoot: derivePreferredFoot(p.id, p.position),
      bodyType: attrs.speed >= 78 ? "Lean" : attrs.speed <= 58 ? "Sturdy" : "Average",
      acceleRATE: attrs.speed >= 80 ? "Explosive" : attrs.speed <= 58 ? "Lengthy" : "Controlled",
      roles: deriveRoles(p.position, p.attributes, null),
    };
  }
  const attrs = p.attributes as PlayerAttributes;
  return {
    stats,
    skillMoves: deriveSkillMoves(p.id, attrs),
    weakFoot: deriveWeakFoot(p.id, attrs),
    preferredFoot: derivePreferredFoot(p.id, p.position),
    bodyType: deriveBodyType(attrs),
    acceleRATE: deriveAcceleRate(stats as FcStats, attrs),
    roles: deriveRoles(p.position, p.attributes, stats),
  };
}
