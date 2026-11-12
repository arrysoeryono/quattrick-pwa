/**
 * Quattrick Advanced Tactics — FIFA/EA FC style game plans, sliders,
 * player instructions and set pieces.
 *
 * Sliders feed straight into the Web Worker match engine; every preset is a
 * balanced starting point the manager can then fine-tune per match.
 */

import type { Mentality, PlayerInstruction, Tactics, TacticSliders } from "./types";
import { positionGroup, type PositionGroup } from "./formations";

/* ---------------- Sliders ---------------- */

export const SLIDER_META: {
  key: keyof TacticSliders;
  label: string;
  low: string;
  high: string;
  desc: string;
}[] = [
  { key: "buildUpSpeed", label: "Build-up speed", low: "Patient", high: "Fast", desc: "How quickly the ball moves from the back line into attack." },
  { key: "chanceCreation", label: "Chance creation", low: "Safe passing", high: "Risky runs", desc: "Conservative circulation versus ambitious through balls and dribbles." },
  { key: "attackingWidth", label: "Attacking width", low: "Narrow", high: "Wide", desc: "Overload the middle or stretch play to the flanks." },
  { key: "defensiveWidth", label: "Defensive width", low: "Compact", high: "Stretched", desc: "Stay tight centrally or cover the full pitch out of possession." },
  { key: "pressingIntensity", label: "Pressing", low: "Drop off", high: "Gegenpress", desc: "How aggressively the team hunts the ball after losing it." },
  { key: "defensiveLine", label: "Defensive line", low: "Deep block", high: "High line", desc: "Where the back line positions on the pitch." },
  { key: "tempo", label: "Tempo", low: "Slow", high: "Fast", desc: "Overall rhythm of passing and movement." },
  { key: "aggression", label: "Tackling", low: "Cautious", high: "Aggressive", desc: "Standing tackles versus full-blooded challenges (cards risk)." },
];

export const NEUTRAL_SLIDERS: TacticSliders = {
  buildUpSpeed: 50,
  chanceCreation: 50,
  attackingWidth: 50,
  defensiveWidth: 50,
  pressingIntensity: 50,
  defensiveLine: 50,
  tempo: 50,
  aggression: 40,
};

/* ---------------- Game plans ---------------- */

export interface GamePlan {
  id: string;
  name: string;
  tagline: string;
  mentality: Mentality;
  sliders: TacticSliders;
}

export const GAME_PLANS: GamePlan[] = [
  {
    id: "balanced",
    name: "Balanced",
    tagline: "Adaptive default. No extreme commitments either phase.",
    mentality: "balanced",
    sliders: { ...NEUTRAL_SLIDERS },
  },
  {
    id: "tiki-taka",
    name: "Tiki-Taka",
    tagline: "Short passes, patient circles, strangle the ball.",
    mentality: "attacking",
    sliders: { buildUpSpeed: 22, chanceCreation: 30, attackingWidth: 62, defensiveWidth: 48, pressingIntensity: 66, defensiveLine: 68, tempo: 72, aggression: 34 },
  },
  {
    id: "gegenpress",
    name: "Gegenpress",
    tagline: "Win it back high, suffocate, strike before they blink.",
    mentality: "attacking",
    sliders: { buildUpSpeed: 62, chanceCreation: 58, attackingWidth: 50, defensiveWidth: 52, pressingIntensity: 92, defensiveLine: 82, tempo: 80, aggression: 62 },
  },
  {
    id: "counter",
    name: "Counter Attack",
    tagline: "Compact shape, then explode into the open space.",
    mentality: "defensive",
    sliders: { buildUpSpeed: 78, chanceCreation: 60, attackingWidth: 66, defensiveWidth: 42, pressingIntensity: 34, defensiveLine: 30, tempo: 76, aggression: 40 },
  },
  {
    id: "park-the-bus",
    name: "Park the Bus",
    tagline: "Two banks of steel. Resist everything.",
    mentality: "defensive",
    sliders: { buildUpSpeed: 40, chanceCreation: 25, attackingWidth: 40, defensiveWidth: 34, pressingIntensity: 20, defensiveLine: 12, tempo: 34, aggression: 58 },
  },
  {
    id: "wing-play",
    name: "Wing Play",
    tagline: "Stretch the pitch, service from the touchlines.",
    mentality: "balanced",
    sliders: { buildUpSpeed: 52, chanceCreation: 48, attackingWidth: 88, defensiveWidth: 58, pressingIntensity: 48, defensiveLine: 50, tempo: 56, aggression: 38 },
  },
  {
    id: "long-ball",
    name: "Direct / Long Ball",
    tagline: "Second balls, knock-downs, target man up top.",
    mentality: "balanced",
    sliders: { buildUpSpeed: 88, chanceCreation: 70, attackingWidth: 44, defensiveWidth: 46, pressingIntensity: 40, defensiveLine: 38, tempo: 84, aggression: 52 },
  },
  {
    id: "total-football",
    name: "Total Football",
    tagline: "Fluid positions, relentless pressing, brave build-up.",
    mentality: "attacking",
    sliders: { buildUpSpeed: 58, chanceCreation: 62, attackingWidth: 60, defensiveWidth: 60, pressingIntensity: 78, defensiveLine: 76, tempo: 66, aggression: 44 },
  },
];

export function getGamePlan(id: string): GamePlan {
  return GAME_PLANS.find((p) => p.id === id) ?? GAME_PLANS[0];
}

/* ---------------- Player instructions ---------------- */

export interface InstructionOption {
  id: string;
  name: string;
  desc: string;
  groups: PositionGroup[]; // which slot groups can take it
}

export const ATTACK_INSTRUCTIONS: InstructionOption[] = [
  { id: "none", name: "Default", desc: "No special attacking instruction.", groups: ["GK", "DEF", "MID", "ATT"] },
  { id: "get-in-behind", name: "Get in behind", desc: "Constantly runs the channels toward goal.", groups: ["ATT"] },
  { id: "come-short", name: "Come short", desc: "Drops toward the ball to link play.", groups: ["ATT"] },
  { id: "false-9", name: "False 9", desc: "Drifts into midfield, dragging markers away.", groups: ["ATT"] },
  { id: "target-man", name: "Target man", desc: "Holds the ball up centrally and wins aerial duels.", groups: ["ATT"] },
  { id: "stay-forward", name: "Stay forward", desc: "Rarely tracks back — stays upfield for counters.", groups: ["ATT"] },
  { id: "come-back", name: "Come back on defence", desc: "Drops deep to help the team out of possession.", groups: ["MID", "ATT"] },
  { id: "stay-wide", name: "Stay wide", desc: "Hugs the touchline to stretch the block.", groups: ["ATT", "MID"] },
  { id: "cut-inside", name: "Cut inside", desc: "Inverts toward the box onto the stronger foot.", groups: ["ATT", "MID"] },
  { id: "box-cross", name: "Get into the box for cross", desc: "Attacks the six-yard box whenever a cross is coming.", groups: ["ATT", "MID"] },
  { id: "edge-box", name: "Stay on edge of box for cross", desc: "Waits at the top of the box for clearances and volleys.", groups: ["ATT", "MID"] },
  { id: "stick-position", name: "Stick to position", desc: "Keeps the shape disciplined instead of chasing space.", groups: ["MID", "ATT"] },
  { id: "free-roam", name: "Free roam", desc: "Wanders off the line to find space.", groups: ["MID", "ATT"] },
  { id: "get-forward", name: "Get forward", desc: "Joins attacks whenever possession is secured.", groups: ["MID", "DEF"] },
  { id: "deep-playmaker", name: "Deep-lying playmaker", desc: "Drops between the centre-backs to dictate.", groups: ["MID", "DEF"] },
  { id: "stay-back", name: "Stay back while attacking", desc: "Rarely crosses halfway in possession.", groups: ["DEF"] },
  { id: "overlap", name: "Overlap runs", desc: "Bursts around the winger's outside shoulder.", groups: ["DEF"] },
  { id: "inverted-wb", name: "Inverted wing-back", desc: "Tucks into midfield when attacking.", groups: ["DEF"] },
  { id: "mixed-runs", name: "Mixed attack", desc: "Alternates overlapping and tucking in dynamically.", groups: ["DEF"] },
];

export const DEFEND_INSTRUCTIONS: InstructionOption[] = [
  { id: "none", name: "Default", desc: "Standard defensive duties.", groups: ["GK", "DEF", "MID", "ATT"] },
  { id: "hold-line", name: "Hold the line", desc: "Never steps out of the back line.", groups: ["DEF", "MID"] },
  { id: "step-out", name: "Step up", desc: "Engages the ball-carrier early.", groups: ["DEF", "MID"] },
  { id: "cut-lanes", name: "Cut passing lanes", desc: "Intercepts passes instead of chasing the carrier.", groups: ["DEF", "MID"] },
  { id: "cover-center", name: "Cover centre", desc: "Collapses centrally to close the dangerous zone.", groups: ["DEF", "MID"] },
  { id: "cover-wing", name: "Cover the wing", desc: "Shifts wide to double up on wingers.", groups: ["DEF", "MID"] },
  { id: "aggressive-int", name: "Aggressive interceptions", desc: "Jumps every pass early — burns stamina, wins ball.", groups: ["DEF", "MID"] },
  { id: "conservative-int", name: "Conservative interceptions", desc: "Only steps in on near-certain wins. Saves energy.", groups: ["DEF", "MID"] },
  { id: "man-mark", name: "Man mark", desc: "Shadows the opponents' key creator.", groups: ["DEF", "MID"] },
  { id: "press-early", name: "Press early", desc: "Charges the receiver before they turn.", groups: ["MID", "ATT"] },
  { id: "contain", name: "Contain", desc: "Shepherds away from goal instead of diving in.", groups: ["DEF", "MID", "ATT"] },
  { id: "sweeper-keeper", name: "Sweeper keeper", desc: "Rushes behind the high line to kill through balls.", groups: ["GK"] },
  { id: "comes-crosses", name: "Comes for crosses", desc: "Attacks crosses aggressively to claim or punch.", groups: ["GK"] },
  { id: "cautious-crosses", name: "Cautious with crosses", desc: "Stays on the line and lets defenders head clear.", groups: ["GK"] },
  { id: "stay-on-line", name: "Stay on line", desc: "Guards the posts, rarely leaves the area.", groups: ["GK"] },
];

export function instructionsForGroup(group: PositionGroup): { att: InstructionOption[]; def: InstructionOption[] } {
  return {
    att: ATTACK_INSTRUCTIONS.filter((i) => i.groups.includes(group)),
    def: DEFEND_INSTRUCTIONS.filter((i) => i.groups.includes(group)),
  };
}

export function findInstruction(id: string | undefined, phase: "att" | "def"): InstructionOption | null {
  if (!id) return null;
  const list = phase === "att" ? ATTACK_INSTRUCTIONS : DEFEND_INSTRUCTIONS;
  return list.find((i) => i.id === id) ?? null;
}

/* ---------------- Defaults & migration ---------------- */

export function defaultTactics(formationName: string): Tactics {
  const plan = getGamePlan("balanced");
  return {
    formationName,
    mentality: plan.mentality,
    gamePlan: plan.id,
    sliders: { ...plan.sliders },
    instructions: {},
    roles: {},
    setPieces: { captain: null, penalty: null, freeKick: null, cornerLeft: null, cornerRight: null },
  };
}

/** Upgrade a v3 tactics object in place to the full v5 shape. */
export function migrateTactics(raw: Partial<Tactics> | undefined, formationName: string): Tactics {
  const base = defaultTactics(formationName);
  if (!raw) return base;
  return {
    formationName: raw.formationName ?? base.formationName,
    mentality: raw.mentality ?? base.mentality,
    gamePlan: raw.gamePlan ?? base.gamePlan,
    sliders: { ...base.sliders, ...(raw.sliders ?? {}) },
    instructions: raw.instructions ?? {},
    roles: raw.roles ?? {},
    setPieces: { ...base.setPieces, ...(raw.setPieces ?? {}) },
  };
}

/* ---------------- AI slider profiles ---------------- */

/** Derive believable AI tactical sliders from the formation category + mentality. */
export function aiSlidersFor(category: string, mentality: Mentality): TacticSliders {
  const base: TacticSliders = { ...NEUTRAL_SLIDERS };
  const c = category.toLowerCase();
  if (c.includes("ultra defensive")) {
    Object.assign(base, getGamePlan("park-the-bus").sliders);
  } else if (c.includes("counter")) {
    Object.assign(base, getGamePlan("counter").sliders);
  } else if (c.includes("high press")) {
    Object.assign(base, getGamePlan("gegenpress").sliders);
  } else if (c.includes("possession") || c.includes("total football")) {
    Object.assign(base, getGamePlan("tiki-taka").sliders);
  } else if (c.includes("ultra attacking") || c.includes("attacking")) {
    Object.assign(base, getGamePlan("wing-play").sliders, { pressingIntensity: 62, defensiveLine: 64 });
  } else if (c.includes("control") || c.includes("midfield")) {
    Object.assign(base, { ...NEUTRAL_SLIDERS, tempo: 62, chanceCreation: 44 });
  }
  if (mentality === "attacking") {
    base.pressingIntensity = Math.min(95, base.pressingIntensity + 10);
    base.defensiveLine = Math.min(95, base.defensiveLine + 10);
  } else if (mentality === "defensive") {
    base.pressingIntensity = Math.max(10, base.pressingIntensity - 10);
    base.defensiveLine = Math.max(10, base.defensiveLine - 12);
  }
  return base;
}
