/**
 * v5.0 — FC IQ: Player Roles & Focus (EA Sports FC 25/26/27 style).
 *
 * Every slot position offers a catalogue of ROLES; each role offers 1-3
 * FOCUSES that tune the player's movement inside that role. Selections are
 * stored per lineup slot in `Tactics.roles` and shipped into the match engine
 * via `MatchPlayerConfig.role`, where they translate into concrete
 * simulation effects (zone weights, finishing, stamina drain, pressing,
 * width, sweeping keepers, card risk...).
 *
 * Engine effects are intentionally subtle (±2-6% band) — base attributes and
 * face stats keep the leading role, exactly like the real game.
 */
import type { PositionCode, SlotRole } from "./types";
import { FC_ROLES, buildFcProfile, type FcRoleDef, type RoleLevel } from "./fc";

/* ============================================================
 * Focus catalogue
 * ============================================================ */

export interface FocusDef {
  id: string;
  name: string;
  desc: string;
}

export const FOCUS_DEFS: Record<string, FocusDef> = {
  balanced: { id: "balanced", name: "Balanced", desc: "Default behaviour — no extreme commitment either phase." },
  defend: { id: "defend", name: "Defend", desc: "Prioritises defensive duties, rarely joins the attack." },
  support: { id: "support", name: "Support", desc: "Joins attacking moves moderately while keeping shape." },
  attack: { id: "attack", name: "Attack", desc: "Pushes hard into the final third at every opportunity." },
  "build-up": { id: "build-up", name: "Build-Up", desc: "Drops in to help circulate possession from deeper areas." },
  roaming: { id: "roaming", name: "Roaming", desc: "Wanders horizontally and vertically to find space." },
  complete: { id: "complete", name: "Complete", desc: "Does a bit of everything — links, runs and finishes." },
  wide: { id: "wide", name: "Wide", desc: "Stretches play, hugging the touchline for crosses." },
};

/* ============================================================
 * Role → Focus catalogue (per EA FC position tables)
 * ============================================================ */

/** Roles a keeper slot can take. */
const GK_ROLES = ["gk-goalkeeper", "sweeper-keeper"] as const;

export const ROLE_FOCUSES: Record<string, string[]> = {
  // GK
  "gk-goalkeeper": ["defend", "balanced"],
  "sweeper-keeper": ["balanced"],
  // CB
  defender: ["defend", "balanced"],
  stopper: ["balanced"],
  "ball-playing-defender": ["defend", "build-up"],
  // Fullbacks & wingbacks
  fullback: ["defend", "balanced"],
  wingback: ["balanced", "support"],
  falseback: ["defend", "balanced"],
  "attacking-wingback": ["balanced", "attack"],
  // CDM
  holding: ["defend", "roaming"],
  "centre-half": ["defend"],
  "deep-lying-playmaker": ["defend", "build-up", "roaming"],
  // CM
  "box-to-box": ["balanced"],
  playmaker: ["attack", "roaming"],
  "half-winger": ["balanced", "attack"],
  // CAM
  "shadow-striker": ["attack"],
  // Wide
  winger: ["balanced", "attack"],
  "inside-forward": ["balanced", "attack", "roaming"],
  "wide-playmaker": ["attack", "build-up"],
  "wide-midfielder": ["defend", "balanced"],
  // ST
  "advanced-forward": ["attack", "support", "complete"],
  poacher: ["attack"],
  "false-9": ["build-up"],
  "target-forward": ["balanced", "attack", "wide"],
};

/* ============================================================
 * Engine effect surface
 * ============================================================ */

export interface RoleEffect {
  /** added to the player's weight inside the ATTACK zone */
  attJoin?: number;
  /** multiplier on the player's weight inside the ATTACK zone (<1 = stays out) */
  attMult?: number;
  /** added to the player's weight inside the MIDFIELD zone */
  midJoin?: number;
  /** added to the player's weight inside the DEFENSIVE zone */
  defJoin?: number;
  /** personal finishing multiplier on xG */
  finishMult?: number;
  /** multiplier on being picked as the shooter inside the box */
  boxMult?: number;
  /** multiplier on being picked as the assister */
  assistMult?: number;
  /** extra stamina drain per minute */
  drainAdd?: number;
  /** team card-probability multiplier contribution */
  cardMult?: number;
  /** team attacking width contribution (±) */
  widthDelta?: number;
  /** team pressing bonus contribution */
  pressDelta?: number;
  /** team xG-face multiplier (GK sweeping/cross claims) */
  faceXgMult?: number;
}

const EMPTY_EFFECT: RoleEffect = {};

/** Base effect of the ROLE itself. */
const ROLE_BASE: Record<string, RoleEffect> = {
  "gk-goalkeeper": {},
  "sweeper-keeper": { faceXgMult: 0.965, drainAdd: 0.02 },
  defender: { defJoin: 0.05 },
  stopper: { defJoin: 0.06, pressDelta: 3, cardMult: 1.04 },
  "ball-playing-defender": { midJoin: 0.2, defJoin: -0.03 },
  fullback: {},
  wingback: { attJoin: 0.1, drainAdd: 0.02 },
  falseback: { midJoin: 0.25, widthDelta: -4, attJoin: -0.05 },
  "attacking-wingback": { attJoin: 0.3, widthDelta: 3, drainAdd: 0.05 },
  holding: { defJoin: 0.12, attMult: 0.75 },
  "centre-half": { defJoin: 0.16, attMult: 0.6 },
  "deep-lying-playmaker": { midJoin: 0.25, attMult: 0.85 },
  "box-to-box": { attJoin: 0.15, defJoin: 0.15, drainAdd: 0.07 },
  playmaker: { midJoin: 0.2, attJoin: 0.05 },
  "shadow-striker": { attJoin: 0.3 },
  "half-winger": { midJoin: 0.1, widthDelta: 4 },
  winger: { widthDelta: 5, attJoin: 0.1 },
  "inside-forward": { attJoin: 0.2, widthDelta: -3, finishMult: 1.02 },
  "wide-playmaker": { midJoin: 0.2, widthDelta: 2, assistMult: 1.12 },
  "wide-midfielder": { defJoin: 0.15, attMult: 0.85 },
  "advanced-forward": { attJoin: 0.15, finishMult: 1.02 },
  poacher: { attJoin: 0.2, boxMult: 1.15 },
  "false-9": { midJoin: 0.3, attMult: 0.8, assistMult: 1.2 },
  "target-forward": { attJoin: 0.1, widthDelta: 2, boxMult: 1.1, assistMult: 1.1 },
};

/** Extra effect contributed by each FOCUS on top of the role base. */
const FOCUS_BASE: Record<string, RoleEffect> = {
  balanced: {},
  defend: { defJoin: 0.12, attJoin: -0.12 },
  support: { attJoin: 0.1, midJoin: 0.05 },
  attack: { attJoin: 0.2, defJoin: -0.05, drainAdd: 0.03 },
  "build-up": { midJoin: 0.15, defJoin: 0.04 },
  roaming: { midJoin: 0.1, drainAdd: 0.04 },
  complete: { attJoin: 0.1, midJoin: 0.05, drainAdd: 0.05 },
  wide: { widthDelta: 5 },
};

/** Compose the full effect of a role+focus pair. */
export function roleEffectFor(roleId: string | undefined, focusId: string | undefined): RoleEffect {
  if (!roleId || !ROLE_BASE[roleId]) return EMPTY_EFFECT;
  const base = ROLE_BASE[roleId];
  const focus = focusId ? FOCUS_BASE[focusId] : undefined;
  if (!focus) return base;
  return {
    attJoin: (base.attJoin ?? 0) + (focus.attJoin ?? 0),
    attMult: (base.attMult ?? 1) * (focus.attMult ?? 1),
    midJoin: (base.midJoin ?? 0) + (focus.midJoin ?? 0),
    defJoin: (base.defJoin ?? 0) + (focus.defJoin ?? 0),
    finishMult: (base.finishMult ?? 1) * (focus.finishMult ?? 1),
    boxMult: (base.boxMult ?? 1) * (focus.boxMult ?? 1),
    assistMult: (base.assistMult ?? 1) * (focus.assistMult ?? 1),
    drainAdd: (base.drainAdd ?? 0) + (focus.drainAdd ?? 0),
    cardMult: (base.cardMult ?? 1) * (focus.cardMult ?? 1),
    widthDelta: (base.widthDelta ?? 0) + (focus.widthDelta ?? 0),
    pressDelta: (base.pressDelta ?? 0) + (focus.pressDelta ?? 0),
    faceXgMult: (base.faceXgMult ?? 1) * (focus.faceXgMult ?? 1),
  };
}

/** Neutral effect used when a player has no role assigned (AI squads etc.). */
export function emptyRoleEffect(): RoleEffect {
  return EMPTY_EFFECT;
}

/* ============================================================
 * Short codes for pitch chips
 * ============================================================ */

export const ROLE_SHORT: Record<string, string> = {
  "gk-goalkeeper": "GK",
  "sweeper-keeper": "SK",
  defender: "DEF",
  stopper: "STP",
  "ball-playing-defender": "BPD",
  fullback: "FB",
  wingback: "WB",
  falseback: "FLB",
  "attacking-wingback": "AWB",
  holding: "HLD",
  "centre-half": "CH",
  "deep-lying-playmaker": "DLP",
  "box-to-box": "B2B",
  playmaker: "PM",
  "shadow-striker": "SS",
  "half-winger": "HW",
  winger: "W",
  "inside-forward": "IF",
  "wide-playmaker": "WPM",
  "wide-midfielder": "WM",
  "advanced-forward": "AF",
  poacher: "POA",
  "false-9": "F9",
  "target-forward": "TF",
};

/* ============================================================
 * Selection helpers
 * ============================================================ */

/** All roles selectable for a slot position, in catalogue order. */
export function rolesForSlot(slot: PositionCode): FcRoleDef[] {
  return FC_ROLES.filter((r) => r.positions.includes(slot));
}

/** Human-readable one-liner of what a role does on the pitch. */
export function roleBlurb(roleId: string): string {
  const blurbs: Record<string, string> = {
    "gk-goalkeeper": "Shot-stopper who guards the goal and organises the line.",
    "sweeper-keeper": "Rushes off the line to kill through balls and starts attacks.",
    defender: "Pure defender — holds the line and wins duels.",
    stopper: "Steps out aggressively to bully the lead striker.",
    "ball-playing-defender": "Steps into midfield with the ball to start attacks.",
    fullback: "Disciplined wide defender, joins moderately.",
    wingback: "Marries the flank end to end all match long.",
    falseback: "Tucks inside into midfield when the team attacks.",
    "attacking-wingback": "Overlaps relentlessly to the byline.",
    holding: "Screens the back four, simple and safe on the ball.",
    "centre-half": "Drops between the centre-backs in build-up, defensive first.",
    "deep-lying-playmaker": "Dictates tempo from deep with raking passes.",
    "box-to-box": "Covers every blade of grass, both boxes.",
    playmaker: "Finds space between the lines to create chances.",
    "shadow-striker": "Second striker bursting into the box.",
    "half-winger": "Drifts wide to create overloads in possession.",
    winger: "Touchline hugger — crosses and wide dribbles.",
    "inside-forward": "Cuts inside onto the strong foot to shoot.",
    "wide-playmaker": "Moves inside from the flank to orchestrate play.",
    "wide-midfielder": "Disciplined wide worker, helps the fullback defend.",
    "advanced-forward": "Lives on the shoulder of the last defender.",
    poacher: "Stays in the box, feeds on service.",
    "false-9": "Drops into midfield, dragging centre-backs out.",
    "target-forward": "Holds up play and wins everything in the air.",
  };
  return blurbs[roleId] ?? "";
}

function defaultFocusFor(roleId: string): string {
  const focuses = ROLE_FOCUSES[roleId];
  if (!focuses || focuses.length === 0) return "balanced";
  return focuses.includes("balanced") ? "balanced" : focuses[0];
}

const DEFAULT_ROLE_BY_SLOT: Partial<Record<PositionCode, SlotRole>> = {
  GK: { roleId: "gk-goalkeeper", focusId: "balanced" },
  CB: { roleId: "defender", focusId: "balanced" },
  LB: { roleId: "fullback", focusId: "balanced" },
  RB: { roleId: "fullback", focusId: "balanced" },
  LWB: { roleId: "wingback", focusId: "balanced" },
  RWB: { roleId: "wingback", focusId: "balanced" },
  CDM: { roleId: "holding", focusId: "defend" },
  CM: { roleId: "box-to-box", focusId: "balanced" },
  CAM: { roleId: "playmaker", focusId: "balanced" },
  LM: { roleId: "wide-midfielder", focusId: "balanced" },
  RM: { roleId: "wide-midfielder", focusId: "balanced" },
  LAM: { roleId: "playmaker", focusId: "balanced" },
  RAM: { roleId: "playmaker", focusId: "balanced" },
  LW: { roleId: "winger", focusId: "balanced" },
  RW: { roleId: "winger", focusId: "balanced" },
  LF: { roleId: "inside-forward", focusId: "balanced" },
  RF: { roleId: "inside-forward", focusId: "balanced" },
  CF: { roleId: "advanced-forward", focusId: "support" },
  ST: { roleId: "advanced-forward", focusId: "attack" },
};

/** Sensible default role for a formation slot (used by AI teams & fallbacks). */
export function defaultRoleForSlot(slot: PositionCode): SlotRole {
  return DEFAULT_ROLE_BY_SLOT[slot] ?? { roleId: "defender", focusId: "balanced" };
}

const MASTERY_ORDER: Record<RoleLevel, number> = { "++": 3, "+": 2, familiar: 1 };

/** Resolve the player's mastery level for a given role id (or null if unknown). */
export function roleMasteryFor(
  player: { id: number; position: PositionCode; attributes: Parameters<typeof buildFcProfile>[0]["attributes"] },
  roleId: string,
): RoleLevel | null {
  const profile = buildFcProfile(player);
  const found = profile.roles.find((r) => r.id === roleId);
  return found ? found.level : null;
}

/**
 * Best role for a player in a slot: the highest-mastery role the player owns
 * that is legal for the slot, falling back to the slot default.
 */
export function bestRoleForPlayer(
  player: { id: number; position: PositionCode; attributes: Parameters<typeof buildFcProfile>[0]["attributes"] },
  slot: PositionCode,
): SlotRole {
  const legal = rolesForSlot(slot);
  if (legal.length === 0) return defaultRoleForSlot(slot);
  const profile = buildFcProfile(player);
  let best: { id: string; rank: number } | null = null;
  for (const role of legal) {
    const owned = profile.roles.find((r) => r.id === role.id);
    if (!owned) continue;
    const rank = MASTERY_ORDER[owned.level];
    if (!best || rank > best.rank) best = { id: role.id, rank };
  }
  // keepers only ever take keeper roles
  if (slot === "GK" && !GK_ROLES.includes(best?.id as (typeof GK_ROLES)[number])) {
    return defaultRoleForSlot(slot);
  }
  if (!best) return defaultRoleForSlot(slot);
  return { roleId: best.id, focusId: defaultFocusFor(best.id) };
}

/** True when the roleId+focusId pair is legal for the slot. */
export function isValidRoleFor(slot: PositionCode, role?: SlotRole | null): boolean {
  if (!role) return false;
  const legal = rolesForSlot(slot);
  if (!legal.some((r) => r.id === role.roleId)) return false;
  const focuses = ROLE_FOCUSES[role.roleId];
  return !focuses || focuses.length === 0 || focuses.includes(role.focusId);
}
