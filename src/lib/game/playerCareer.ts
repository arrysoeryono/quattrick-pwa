/**
 * v6.0 — Player Career (Be a Pro).
 * The user creates a 17-year-old wonderkid, joins a club as a player and
 * grows him through skill points, PlayStyles, personality and activities.
 */
import type {
  Dataset,
  GameState,
  PositionCode,
  PlayerRow,
  PlayerState,
  ProDecision,
  ProObjective,
  ProState,
} from "./types";
import { createCareerState, SAVE_VERSION, toPlayerState } from "./advance";
import { computeMarketValue, computeSalary, mulberry32 } from "./defaultData";
import { pushNews, pushSocial, uid } from "./career";

/* ---------------- pro creation ---------------- */

const rng = mulberry32((Date.now() ^ 0x5f5f5f) & 0xffffffff);

/** Attribute blueprint per archetype so a new Pro feels position-true. */
const PRO_BLUEPRINT: Record<string, Partial<Record<string, number>>> = {
  ST: { pace: 68, shooting: 62, passing: 48, dribbling: 60, defending: 28, physical: 58 },
  CF: { pace: 65, shooting: 60, passing: 52, dribbling: 62, defending: 30, physical: 56 },
  LW: { pace: 72, shooting: 55, passing: 52, dribbling: 66, defending: 26, physical: 46 },
  RW: { pace: 72, shooting: 55, passing: 52, dribbling: 66, defending: 26, physical: 46 },
  CAM: { pace: 60, shooting: 52, passing: 62, dribbling: 66, defending: 32, physical: 46 },
  CM: { pace: 56, shooting: 48, passing: 63, dribbling: 60, defending: 48, physical: 56 },
  CDM: { pace: 52, shooting: 40, passing: 58, dribbling: 52, defending: 62, physical: 64 },
  CB: { pace: 54, shooting: 30, passing: 46, dribbling: 42, defending: 64, physical: 66 },
  LB: { pace: 66, shooting: 36, passing: 52, dribbling: 54, defending: 58, physical: 54 },
  RB: { pace: 66, shooting: 36, passing: 52, dribbling: 54, defending: 58, physical: 54 },
  GK: { diving: 62, handling: 58, reflexes: 64, positioning: 58, kicking: 48, speed: 52 },
};

export const PRO_POSITIONS: PositionCode[] = [
  "ST", "CF", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB", "GK",
];

/** Build the wonderkid PlayerRow (age 17, strong potential, modest current ability). */
export function createProRow(name: string, position: PositionCode, clubId: number, nextId: number): PlayerRow {
  const bp = PRO_BLUEPRINT[position] ?? PRO_BLUEPRINT.CM;
  const attrs: Record<string, number> = {};
  if (position === "GK") {
    attrs.diving = bp.diving ?? 55;
    attrs.handling = bp.handling ?? 55;
    attrs.reflexes = bp.reflexes ?? 55;
    attrs.positioning = bp.positioning ?? 55;
    attrs.kicking = bp.kicking ?? 55;
    attrs.speed = bp.speed ?? 55;
  } else {
    attrs.pace = bp.pace ?? 55;
    attrs.shooting = bp.shooting ?? 55;
    attrs.passing = bp.passing ?? 55;
    attrs.dribbling = bp.dribbling ?? 55;
    attrs.defending = bp.defending ?? 45;
    attrs.physical = bp.physical ?? 55;
  }
  // small deterministic variance
  for (const k of Object.keys(attrs)) {
    attrs[k] = Math.max(30, Math.min(78, attrs[k] + Math.floor(rng() * 7) - 3));
  }
  const ovrBase = position === "GK" ? 60 : 62;
  return {
    id: nextId,
    teamId: clubId,
    name: name.trim() || "Alex Pro",
    age: 17,
    position,
    overallRating: ovrBase + Math.floor(rng() * 5),
    potential: 85 + Math.floor(rng() * 6),
    marketValue: 900_000,
    salary: computeSalary(64),
    attributes: attrs as unknown as PlayerRow["attributes"],
  };
}

function objectivesFor(position: PositionCode): ProObjective[] {
  const o = (id: string, label: string, kind: ProObjective["kind"], target: number, reward: number): ProObjective =>
    ({ id, label, kind, target, current: 0, reward, done: false });
  if (position === "GK") {
    return [
      o("apps", "Play 20 matches this season", "apps", 20, 3),
      o("cs", "Keep 8 clean sheets", "cleanSheets", 8, 4),
      o("rating", "Average rating of 6.90", "avgRating", 690, 3),
    ];
  }
  if (["ST", "CF", "LW", "RW"].includes(position)) {
    return [
      o("goals", "Score 10 goals this season", "goals", 10, 4),
      o("assists", "Provide 5 assists", "assists", 5, 3),
      o("rating", "Average rating of 7.00", "avgRating", 700, 3),
    ];
  }
  if (["CAM", "CM"].includes(position)) {
    return [
      o("assists", "Provide 8 assists this season", "assists", 8, 4),
      o("goals", "Score 4 goals", "goals", 4, 2),
      o("rating", "Average rating of 6.90", "avgRating", 690, 3),
    ];
  }
  return [
    o("apps", "Play 25 matches this season", "apps", 25, 3),
    o("cs", "Be part of 10 clean sheets", "cleanSheets", 10, 3),
    o("rating", "Average rating of 6.80", "avgRating", 680, 3),
  ];
}

export interface PlayerCareerResult {
  game: GameState;
  dataset: Dataset;
}

/** Create a full Player Career save: insert the Pro into the club, init state. */
export function createPlayerCareerState(
  proName: string,
  position: PositionCode,
  clubId: number,
  datasetIn: Dataset,
  difficulty: GameState["difficulty"],
): PlayerCareerResult {
  const dataset: Dataset = structuredClone(datasetIn);
  const nextId = Math.max(1000, ...dataset.players.map((p) => p.id)) + 1;
  const proRow = createProRow(proName, position, clubId, nextId);

  // manager career state is reused as the carrier (fixtures, world, economy)
  // NOTE: dataset does NOT contain the Pro yet — createCareerState materializes
  // the club squad from it; we insert the Pro into both worlds right after.
  const game = createCareerState(proRow.name, clubId, dataset, difficulty);
  game.careerMode = "player";
  game.version = SAVE_VERSION;
  game.proId = proRow.id;

  dataset.players.push(proRow);
  const existing = game.players.find((p) => p.id === proRow.id);
  if (existing) {
    existing.squadRole = "Prospect";
    existing.contractYears = 4;
  } else {
    const proPlayer: PlayerState = toPlayerState(proRow);
    proPlayer.squadRole = "Prospect";
    proPlayer.contractYears = 4;
    game.players.push(proPlayer);
  }

  const pro: ProState = {
    playerId: proRow.id,
    wallet: 250_000,
    skillPoints: 4,
    personality: { maverick: 0, virtuoso: 0, heartbeat: 0 },
    managerTrust: 55,
    objectives: objectivesFor(position),
    agentTargetClubId: null,
    items: [],
    pendingDecision: null,
    lastMatchRating: null,
  };
  game.pro = pro;

  pushNews(game, "season", `${proRow.name} signs first professional contract`, `The ${proRow.age}-year-old ${proRow.position} (OVR ${proRow.overallRating}, POT ${proRow.potential}) joins the senior squad. Objectives set by the manager.`);
  pushSocial(game, { handle: "Academy Watch", tag: "@academywatch", tone: "hype", text: `${proRow.name} is the name everyone at the academy is whispering about. Remember where you read it first.` });
  return { game, dataset };
}

/* ---------------- weekly progression (called from the advance pipeline) ---------------- */

/** Advance Pro objectives + trust + wallet after a played match. */
export function tickProCareer(game: GameState, proRating: { rating: number; goals: number; assists: number } | null): void {
  const pro = game.pro;
  if (!pro) return;
  const p = game.players.find((x) => x.id === pro.playerId);
  if (!p) return;

  // wallet: weekly salary allowance
  pro.wallet += Math.round(p.salary * 0.3);

  // objectives from season stats
  for (const o of pro.objectives) {
    if (o.done) continue;
    if (o.kind === "goals") o.current = p.seasonStats.goals;
    else if (o.kind === "assists") o.current = p.seasonStats.assists;
    else if (o.kind === "apps") o.current = p.seasonStats.apps;
    else if (o.kind === "cleanSheets") o.current = p.seasonStats.cleanSheets;
    else if (o.kind === "avgRating") {
      o.current = p.seasonStats.apps > 0 ? Math.round((p.seasonStats.ratingSum / p.seasonStats.apps) * 100) : 0;
    }
    // avgRating stores current/target in hundredths (690 = 6.90) so the raw
    // comparison works for every objective kind
    if (o.current >= o.target) {
      o.done = true;
      pro.skillPoints += o.reward;
      pushNews(game, "award", `Objective complete: ${o.label}`, `Your Pro earned ${o.reward} skill points. Spend them in My Pro.`);
    }
  }

  if (proRating) {
    pro.lastMatchRating = proRating.rating;
    pro.skillPoints += proRating.goals * 2 + proRating.assists + (proRating.rating >= 8 ? 2 : proRating.rating >= 7 ? 1 : 0);
    pro.managerTrust = Math.max(0, Math.min(100, pro.managerTrust + (proRating.rating >= 7.2 ? 2 : proRating.rating < 6.2 ? -3 : 0)));
    if (proRating.rating >= 8.2) {
      pushSocial(game, { handle: "Match Report", tag: "@matchreport", tone: "hype", text: `${p.name} was untouchable tonight — a performance beyond his years.` });
    }
  } else if (p.injuryWeeks === 0 && p.sharpness > 30) {
    pro.managerTrust = Math.max(0, pro.managerTrust - 1);
  }

  // random off-pitch decision (25% weekly)
  if (!pro.pendingDecision && rng() < 0.25) {
    pro.pendingDecision = rollProDecision(p.name, rng);
  }
}

function rollProDecision(name: string, r: () => number): ProDecision {
  const pool: ProDecision[] = [
    {
      id: uid(), title: "Viral interview moment", body: `${name} is invited to a late-night show. How does he play it?`,
      options: [
        { id: "banter", label: "Crack jokes and tease a rival club", maverick: 3, virtuoso: 0, heartbeat: 0, wallet: 50_000 },
        { id: "humble", label: "Credit teammates and coaches", maverick: 0, virtuoso: 2, heartbeat: 2, wallet: 0 },
        { id: "skip", label: "Decline — rest before the match", maverick: 0, virtuoso: 1, heartbeat: 0, wallet: 0 },
      ],
    },
    {
      id: uid(), title: "Charity gala invite", body: "A children's hospital fundraiser wants the club's rising star on stage.",
      options: [
        { id: "attend", label: "Attend and donate a week's wages", maverick: 0, virtuoso: 1, heartbeat: 4, wallet: -120_000 },
        { id: "video", label: "Send a video message instead", maverick: 0, virtuoso: 1, heartbeat: 1, wallet: 0 },
        { id: "no", label: "Politely decline", maverick: 1, virtuoso: 0, heartbeat: -1, wallet: 0 },
      ],
    },
    {
      id: uid(), title: "Dressing room friction", body: "A senior player publicly criticised the training intensity. The squad looks to you.",
      options: [
        { id: "clap", label: "Clap back publicly", maverick: 4, virtuoso: 0, heartbeat: -1, wallet: 0 },
        { id: "mediate", label: "Defuse it privately at lunch", maverick: 0, virtuoso: 2, heartbeat: 3, wallet: 15_000 },
        { id: "focus", label: "Say nothing, let the coach handle it", maverick: 0, virtuoso: 1, heartbeat: 0, wallet: 0 },
      ],
    },
    {
      id: uid(), title: "Boot sponsor deal", body: "Two brands want your signature: a legacy giant and a bold newcomer.",
      options: [
        { id: "giant", label: "Sign the legacy deal", maverick: 0, virtuoso: 2, heartbeat: 0, wallet: 400_000 },
        { id: "new", label: "Back the newcomer brand", maverick: 3, virtuoso: 1, heartbeat: 0, wallet: 650_000 },
        { id: "wait", label: "Hold out for a better offer", maverick: 1, virtuoso: 2, heartbeat: 0, wallet: 0 },
      ],
    },
    {
      id: uid(), title: "Extra hours", body: "The gym is empty. Nobody would know if you stayed out all night — or trained twice.",
      options: [
        { id: "train", label: "Double session under the lights", maverick: 0, virtuoso: 4, heartbeat: 1, wallet: 0 },
        { id: "night", label: "Night out with friends", maverick: 3, virtuoso: 0, heartbeat: 1, wallet: -40_000 },
        { id: "rest", label: "Full recovery day", maverick: 0, virtuoso: 1, heartbeat: 0, wallet: 0 },
      ],
    },
  ];
  return pool[Math.floor(r() * pool.length)];
}

export function answerProDecision(game: GameState, optionId: string): void {
  const pro = game.pro;
  if (!pro?.pendingDecision) return;
  const opt = pro.pendingDecision.options.find((o) => o.id === optionId);
  if (!opt) return;
  pro.personality.maverick = Math.max(0, Math.min(100, pro.personality.maverick + opt.maverick));
  pro.personality.virtuoso = Math.max(0, Math.min(100, pro.personality.virtuoso + opt.virtuoso));
  pro.personality.heartbeat = Math.max(0, Math.min(100, pro.personality.heartbeat + opt.heartbeat));
  pro.wallet = Math.max(0, pro.wallet + opt.wallet);
  const title = pro.pendingDecision.title;
  pro.pendingDecision = null;
  pushNews(game, "social", `${title} resolved`, "The media reacted to your Pro's choice. Personality profile updated.");
}

/* ---------------- skill points ---------------- */

/** Attribute groups for the Skill Tree UI (My Pro). */
export function proSkillTree(p: PlayerState): { key: string; label: string; value: number; max: number }[] {
  const a = p.attributes as unknown as Record<string, number>;
  if (p.position === "GK") {
    return [
      { key: "diving", label: "GK Diving", value: a.diving ?? 50, max: 99 },
      { key: "handling", label: "GK Handling", value: a.handling ?? 50, max: 99 },
      { key: "kicking", label: "GK Kicking", value: a.kicking ?? 50, max: 99 },
      { key: "reflexes", label: "GK Reflexes", value: a.reflexes ?? 50, max: 99 },
      { key: "positioning", label: "GK Positioning", value: a.positioning ?? 50, max: 99 },
      { key: "speed", label: "Speed", value: a.speed ?? 50, max: 99 },
    ];
  }
  return [
    { key: "pace", label: "Pace", value: a.pace ?? 50, max: 99 },
    { key: "shooting", label: "Shooting", value: a.shooting ?? 50, max: 99 },
    { key: "passing", label: "Passing", value: a.passing ?? 50, max: 99 },
    { key: "dribbling", label: "Dribbling", value: a.dribbling ?? 50, max: 99 },
    { key: "defending", label: "Defending", value: a.defending ?? 50, max: 99 },
    { key: "physical", label: "Physical", value: a.physical ?? 50, max: 99 },
  ];
}

/** Spend one skill point on an attribute (hard-capped by remaining potential headroom). */
export function proSpendSkillPoint(game: GameState, attrKey: string): { ok: boolean; message: string } {
  const pro = game.pro;
  if (!pro) return { ok: false, message: "Not a Player Career save" };
  if (pro.skillPoints < 1) return { ok: false, message: "No skill points left — play matches to earn more" };
  const p = game.players.find((x) => x.id === pro.playerId);
  if (!p) return { ok: false, message: "Pro not found" };
  const attrs = p.attributes as unknown as Record<string, number>;
  if (!(attrKey in attrs)) return { ok: false, message: "Unknown attribute" };
  const headroom = p.potential + 4 - p.overallRating;
  if (attrs[attrKey] >= 99 || headroom <= 0) {
    return { ok: false, message: "At the ceiling — potential must grow first" };
  }
  pro.skillPoints -= 1;
  attrs[attrKey] = Math.min(99, attrs[attrKey] + 1);
  // recompute overall (weights live in attributes.ts)
  recomputeProOverall(p);
  p.marketValue = computeMarketValue(p.overallRating, p.age, p.potential);
  return { ok: true, message: `${attrKey.toUpperCase()} improved` };
}

function recomputeProOverall(p: PlayerState): void {
  // lazy import avoidance: local weighted average consistent with attributes.ts face stats
  const a = p.attributes as unknown as Record<string, number>;
  const vals = Object.values(a);
  const avg = vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
  p.overallRating = Math.max(40, Math.min(99, Math.round(avg)));
}

/* ---------------- personality & lifestyle ---------------- */

export interface LifestyleItem {
  id: string;
  name: string;
  desc: string;
  cost: number;
  personality: { maverick: number; virtuoso: number; heartbeat: number };
}

export const LIFESTYLE_ITEMS: LifestyleItem[] = [
  { id: "boots", name: "Custom Boots", desc: "Hand-crafted colourways. Extra swagger on the wing.", cost: 250_000, personality: { maverick: 1, virtuoso: 2, heartbeat: 0 } },
  { id: "chef", name: "Personal Chef", desc: "Nutrition dialled in. Recovery improves week by week.", cost: 400_000, personality: { maverick: 0, virtuoso: 3, heartbeat: 0 } },
  { id: "media", name: "Media Training", desc: "Never lost for words in a press conference again.", cost: 300_000, personality: { maverick: 0, virtuoso: 1, heartbeat: 3 } },
  { id: "car", name: "Supercar", desc: "Arrive at the training ground like a headline.", cost: 1_200_000, personality: { maverick: 3, virtuoso: 0, heartbeat: 0 } },
  { id: "charity", name: "Charity Foundation", desc: "Give back to the community that raised you.", cost: 2_000_000, personality: { maverick: 0, virtuoso: 0, heartbeat: 5 } },
  { id: "mansion", name: "Mansion", desc: "The dream home. Stability, status, serenity.", cost: 8_000_000, personality: { maverick: 1, virtuoso: 1, heartbeat: 2 } },
];

export function buyProItem(game: GameState, itemId: string): { ok: boolean; message: string } {
  const pro = game.pro;
  if (!pro) return { ok: false, message: "Not a Player Career save" };
  const item = LIFESTYLE_ITEMS.find((i) => i.id === itemId);
  if (!item) return { ok: false, message: "Unknown item" };
  if (pro.items.includes(itemId)) return { ok: false, message: "Already owned" };
  if (pro.wallet < item.cost) return { ok: false, message: "Not enough savings" };
  pro.wallet -= item.cost;
  pro.items.push(itemId);
  pro.personality.maverick = Math.min(100, pro.personality.maverick + item.personality.maverick);
  pro.personality.virtuoso = Math.min(100, pro.personality.virtuoso + item.personality.virtuoso);
  pro.personality.heartbeat = Math.min(100, pro.personality.heartbeat + item.personality.heartbeat);
  const p = game.players.find((x) => x.id === pro.playerId);
  if (p) p.morale = Math.min(100, p.morale + 4);
  return { ok: true, message: `${item.name} purchased` };
}

/* ---------------- agent / transfer ---------------- */

/** Pro can force a transfer when performing at a high level for long enough. */
export function proTransferReady(game: GameState): boolean {
  const pro = game.pro;
  if (!pro || pro.agentTargetClubId === null) return false;
  const p = game.players.find((x) => x.id === pro.playerId);
  if (!p) return false;
  if (p.seasonStats.apps < 15) return false;
  const avg = p.seasonStats.ratingSum / p.seasonStats.apps;
  return avg >= 7.15 || pro.managerTrust <= 15;
}

/** Move the Pro to the agent's target club, preserving growth + history. */
export function proRequestTransfer(gameIn: GameState, datasetIn: Dataset): { game: GameState; dataset: Dataset; ok: boolean; message: string } {
  const game = structuredClone(gameIn);
  const dataset = structuredClone(datasetIn);
  const pro = game.pro;
  if (!pro || !proTransferReady(game)) return { game: gameIn, dataset: datasetIn, ok: false, message: "Requirements not met yet" };
  const targetId = pro.agentTargetClubId!;
  const target = dataset.teams.find((t) => t.id === targetId);
  if (!target) return { game: gameIn, dataset: datasetIn, ok: false, message: "Target club unavailable" };

  const oldTeam = dataset.teams.find((t) => t.id === game.clubId);
  const pRow = dataset.players.find((x) => x.id === pro.playerId);
  if (pRow) pRow.teamId = targetId;

  // fresh career shell at the new club, then graft the Pro's growth back on
  const proRow = game.players.find((x) => x.id === pro.playerId)!;
  const fresh = createCareerState(game.managerName, targetId, dataset, game.difficulty);
  fresh.careerMode = "player";
  fresh.proId = pro.playerId;
  fresh.history = game.history;
  fresh.managerRep = Math.min(100, game.managerRep + 2);
  fresh.achievements = game.achievements;

  // the Pro was materialized by createCareerState from the (already-moved)
  // dataset row — overwrite that row with his grown state, no duplicates
  const existing = fresh.players.find((p) => p.id === pro.playerId);
  if (existing) {
    existing.contractYears = 4;
    existing.squadRole = "Important";
    existing.overallRating = proRow.overallRating;
    existing.potential = proRow.potential;
    existing.attributes = proRow.attributes;
    existing.marketValue = proRow.marketValue;
    existing.salary = Math.max(proRow.salary, computeSalary(proRow.overallRating + 2));
    existing.sharpness = proRow.sharpness;
    existing.morale = proRow.morale;
    existing.seasonStats = proRow.seasonStats;
    existing.careerStats = proRow.careerStats;
  } else {
    const moved = toPlayerState({ ...proRow, teamId: targetId });
    moved.contractYears = 4;
    moved.squadRole = "Important";
    fresh.players.push(moved);
  }

  fresh.pro = { ...pro, managerTrust: 60, objectives: objectivesFor(proRow.position).map((o) => ({ ...o, current: 0, done: false })) };
  proRequestTransferResultPush(fresh, oldTeam?.name ?? "the club", target.name, proRow.name);
  return { game: fresh, dataset, ok: true, message: `${proRow.name} completes the move to ${target.name}` };
}

function proRequestTransferResultPush(game: GameState, from: string, to: string, name: string): void {
  pushNews(game, "transfer", `${name} signs for ${to}`, `A dream switch confirmed. Departure from ${from} announced via the agent. New objectives set.`);
  pushSocial(game, { handle: "Fabrizio Romano", tag: "@FabrizioRomano", tone: "news", text: `${name} to ${to}, here we go! Personal terms agreed, medical booked. Story of the window.` });
}
