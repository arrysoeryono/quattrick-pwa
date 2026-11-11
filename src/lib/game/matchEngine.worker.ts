/// <reference lib="webworker" />
/**
 * Quattrick Match Engine — Spatial probabilistic simulation driven by 50ms ticks.
 * Runs off the main thread; streams minute-by-minute snapshots to the UI.
 *
 * v4: consumes the advanced tactics layer — game-plan sliders, per-player
 * instructions, playstyles and set-piece takers all feed the probability model.
 *
 * xG model variables: shot angle, distance to goal, defensive pressure.
 * Stamina: LostStamina = f(baseStamina, workrate, distanceCovered) per spec.
 */
import { getFormation, positionAffinity } from "./formations";
import { NEUTRAL_SLIDERS } from "./tacticPresets";
import type {
  MatchEventLog,
  MatchRatingEntry,
  MatchResult,
  MatchStats,
  MatchTeamConfig,
  TacticSliders,
} from "./types";

/* ---------- RNG (seeded) ---------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(Date.now() & 0xffffffff);

/* ---------- types ---------- */
interface SimPlayer {
  id: number;
  name: string;
  position: string;
  slot: string;
  ovr: number;
  attributes: MatchTeamConfig["players"][number]["attributes"];
  staminaAttr: number;
  staminaNow: number;
  sharpness: number;
  morale: number;
  age: number;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  yellow: number;
  sentOff: boolean;
  instr: { att?: string; def?: string };
  playStyles: Set<string>;
}

interface TeamMods {
  /** attacking-phase power multiplier */
  att: number;
  /** midfield/possession power multiplier */
  mid: number;
  /** defensive-phase power multiplier */
  def: number;
  /** extra stamina drain per minute */
  staminaDrain: number;
  /** card probability multiplier */
  card: number;
  /** finishing quality multiplier on xG */
  finish: number;
  /** effective pressing bonus (instructions) */
  press: number;
  /** xG multiplier applied to shots this team faces */
  faceXg: number;
  /** effective attacking width shift */
  width: number;
}

interface TeamSim {
  side: "home" | "away";
  cfg: MatchTeamConfig;
  players: SimPlayer[];
  goals: number;
  shots: number;
  onTarget: number;
  xg: number;
  possessionTicks: number;
  mentality: "defensive" | "balanced" | "attacking";
  mods: TeamMods;
  penaltyTaker: number | null;
}

type WorkerInbound =
  | { type: "start"; fixtureId: number; home: MatchTeamConfig; away: MatchTeamConfig; speed: number }
  | { type: "speed"; speed: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "instant" };

type WorkerOutbound =
  | { type: "tick"; minute: number; half: 1 | 2 | "FT"; snapshot: LiveOut }
  | { type: "fulltime"; result: MatchResult }
  | { type: "ready" };

interface LiveOut {
  homeGoals: number;
  awayGoals: number;
  events: MatchEventLog[];
  stats: MatchStats;
  homeName: string;
  awayName: string;
}

/* ---------- state ---------- */
let home: TeamSim | null = null;
let away: TeamSim | null = null;
let fixtureId = 0;
let minute = 0;
let events: MatchEventLog[] = [];
let addedTime1 = 0;
let addedTime2 = 0;
let speed = 1;
let paused = false;
let instant = false;
let running = false;
let injuries: number[] = [];

const post = (msg: WorkerOutbound) => (self as unknown as Worker).postMessage(msg);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------- tactical modifiers ---------- */
function computeMods(cfg: MatchTeamConfig): TeamMods {
  const s: TacticSliders = { ...NEUTRAL_SLIDERS, ...(cfg.sliders ?? {}) };
  const m = cfg.mentality;
  const mentAtt = m === "attacking" ? 1.06 : m === "defensive" ? 0.94 : 1;
  const mentDef = m === "defensive" ? 1.06 : m === "attacking" ? 0.94 : 1;

  // base slider influence (50 = neutral; ±50 maps to roughly ±12%)
  const rel = (v: number) => 1 + (v - 50) * 0.0024;

  let width = 0;
  let press = 0;
  let faceXg = 1;

  const mods: TeamMods = {
    att: rel((s.buildUpSpeed + s.chanceCreation) / 2) * rel(s.tempo) * mentAtt,
    mid: rel((s.pressingIntensity + s.tempo) / 2),
    def: rel(100 - s.defensiveLine) * rel(100 - s.aggression * 0.4) * mentDef,
    staminaDrain:
      (s.pressingIntensity - 50) * 0.0016 + (s.tempo - 50) * 0.0012 + (s.aggression - 50) * 0.0008,
    card: 0.55 + s.aggression / 90,
    finish: rel(s.chanceCreation) * rel(s.tempo * 0.5 + 50),
    press,
    faceXg,
    width,
  };

  // per-player instruction effects
  for (const p of cfg.players) {
    const att = p.instr?.att;
    const def = p.instr?.def;
    if (att === "stay-wide") mods.width += 6;
    if (att === "get-forward" || att === "overlap") {
      mods.att *= 1.015;
      mods.def *= 0.995;
    }
    if (att === "stay-back") {
      mods.def *= 1.02;
      mods.att *= 0.99;
    }
    if (att === "deep-playmaker") mods.mid *= 1.015;
    if (att === "false-9") {
      mods.mid *= 1.01;
      mods.att *= 0.995;
    }
    if (def === "press-early") mods.press += 5;
    if (def === "hold-line") mods.def *= 1.015;
    if (def === "step-out") {
      mods.def *= 0.995;
      mods.press += 3;
    }
    if (def === "cover-wing") mods.width -= 3;
    if (def === "sweeper-keeper") mods.faceXg *= 0.965;
    if (def === "man-mark") mods.att *= 0.99; // opp attack — applied symmetrically below
  }
  return mods;
}

/* ---------- team preparation ---------- */
function makeTeam(cfg: MatchTeamConfig, side: "home" | "away", oppMods: TeamMods | null): TeamSim {
  const formation = getFormation(cfg.formation);
  const players: SimPlayer[] = cfg.players.map((p, i) => {
    const slot = formation.positions[i] ?? p.position;
    const affinity = positionAffinity(p.position as SimPlayer["position"], slot);
    const sharpAdj = p.sharpness >= 80 ? 5 : p.sharpness >= 60 ? 3 : p.sharpness >= 40 ? 0 : -4;
    const eff = Math.round(p.ovr * affinity + sharpAdj + (p.morale - 60) * 0.03);
    return {
      ...p,
      position: p.position,
      slot,
      ovr: Math.max(20, eff),
      staminaAttr: p.stamina,
      staminaNow: 100,
      rating: 6.4,
      goals: 0,
      assists: 0,
      shots: 0,
      yellow: 0,
      sentOff: false,
      instr: p.instr ?? {},
      playStyles: new Set(p.playStyles ?? []),
    };
  });

  const mods = computeMods(cfg);
  // man-mark from the opponent dulls this team's attack
  if (oppMods) {
    const oppMarkers = cfg.players.filter((p) => p.instr?.def === "man-mark").length;
    if (oppMarkers > 0) mods.att *= Math.max(0.94, 1 - oppMarkers * 0.02);
  }

  return {
    side,
    cfg,
    players,
    goals: 0,
    shots: 0,
    onTarget: 0,
    xg: 0,
    possessionTicks: 0,
    mentality: cfg.mentality,
    mods,
    penaltyTaker: cfg.setPieces?.penalty ?? null,
  };
}

const onPitch = (t: TeamSim) => t.players.filter((p) => !p.sentOff);

function teamPower(t: TeamSim, zone: "att" | "mid" | "def"): number {
  const isAtt = (slot: string) => ["LW", "RW", "LF", "RF", "CF", "ST"].includes(slot);
  const isDef = (slot: string) => ["CB", "LB", "RB", "LWB", "RWB"].includes(slot);
  const mods = t.mods;
  let sum = 0, w = 0;
  for (const p of onPitch(t)) {
    const staminaFactor = 0.72 + 0.28 * (p.staminaNow / 100);
    let eff = p.ovr * staminaFactor;
    // playstyle flavour
    if (zone === "def" && (p.playStyles.has("rock") || p.playStyles.has("powerhouse"))) eff *= 1.03;
    if (zone === "mid" && p.playStyles.has("maestro")) eff *= 1.02;

    if (zone === "att") {
      let weight = isAtt(p.slot) ? 1.3 : isDef(p.slot) ? 0.15 : 0.45;
      if (p.instr.att === "get-forward" || p.instr.att === "overlap") weight += 0.25;
      if (p.instr.att === "stay-back") weight *= 0.3;
      weight *= 1 + mods.width / 400 * (["LW", "RW", "LM", "RM", "LWB", "RWB"].includes(p.slot) ? 2 : -0.4);
      sum += eff * weight; w += weight;
    } else if (zone === "mid") {
      let weight = p.slot === "GK" ? 0.05 : isDef(p.slot) ? 0.55 : isAtt(p.slot) ? 0.5 : 1.4;
      if (p.instr.att === "deep-playmaker" || p.instr.att === "free-roam") weight += 0.2;
      sum += eff * weight; w += weight;
    } else {
      let weight = p.slot === "GK" ? 3.2 : isDef(p.slot) ? 1.35 : isAtt(p.slot) ? 0.12 : 0.5;
      if (p.instr.att === "stay-back") weight += 0.2;
      if (p.instr.def === "hold-line") weight += 0.1;
      sum += eff * weight; w += weight;
    }
  }
  const zoneMod = zone === "att" ? mods.att : zone === "mid" ? mods.mid : mods.def;
  return w ? (sum / w) * zoneMod : 45;
}

function pickWeighted(players: SimPlayer[], weight: (p: SimPlayer) => number): SimPlayer | null {
  const pool = players.filter((p) => !p.sentOff);
  if (pool.length === 0) return null;
  const weights = pool.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[Math.floor(rng() * pool.length)];
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/* ---------- commentary ---------- */
const GOAL_TXT = [
  "{p} finishes it off! What a strike!",
  "{p} smashes it into the net!",
  "GOAL! {p} makes no mistake from close range!",
  "{p} slots it home coolly past the keeper!",
  "Clinical from {p} — the roof comes off!",
];
const SAVE_TXT = [
  "{g} denies {p} with a brilliant save!",
  "{p} forces a sharp save from {g}!",
  "{g} gets down well to keep out {p}'s effort.",
];
const MISS_TXT = [
  "{p} drags it wide of the far post.",
  "{p} blazes it over the bar!",
  "{p}'s shot is blocked by a desperate defender.",
  "Inches wide from {p}!",
];

function fill(tpl: string, p: SimPlayer): string {
  return tpl.replace("{p}", p.name);
}

/* ---------- shot resolution ---------- */
function resolveShot(att: TeamSim, def: TeamSim, shooter: SimPlayer, dist: number, angleDeg: number, pressure: number, xgMult = 1): void {
  const angleFactor = Math.sin((angleDeg * Math.PI) / 180);
  const finishBonus = (1 + (shooter.attributes.shooting - 70) / 160) * att.mods.finish * (shooter.playStyles.has("clinical") ? 1.06 : 1);
  const xg = Math.max(0.015, Math.min(0.72, 1.15 * Math.exp(-dist / 9.2) * (0.35 + 0.65 * angleFactor) * pressure * finishBonus * xgMult));
  att.xg += xg;
  const roll = rng();
  if (roll < xg) {
    att.goals++; shooter.goals++; shooter.rating += 1.0;
    att.onTarget++;
    const assister = pickWeighted(onPitch(att).filter((p) => p.id !== shooter.id), (p) => {
      let w = Math.pow(Math.max(1, p.attributes.passing * 0.7 + p.ovr * 0.3), 2);
      if (p.playStyles.has("playmaker")) w *= 1.25;
      if (p.instr.att === "false-9" || p.instr.att === "free-roam") w *= 1.2;
      return w;
    });
    if (assister && rng() < 0.68) {
      assister.assists++; assister.rating += 0.6;
      events.push({ minute, type: "goal", teamSide: att.side, text: `${assister.name} sets it up — ${fill(GOAL_TXT[Math.floor(rng() * GOAL_TXT.length)], shooter)}` });
    } else {
      events.push({ minute, type: "goal", teamSide: att.side, text: fill(GOAL_TXT[Math.floor(rng() * GOAL_TXT.length)], shooter) });
    }
    for (const p of def.players) p.rating -= 0.04;
    for (const p of att.players) p.rating += 0.05;
  } else if (roll < xg + 0.36) {
    att.onTarget++;
    const gk = onPitch(def).find((p) => p.slot === "GK");
    if (gk && rng() < 0.75) gk.rating += 0.12;
    events.push({ minute, type: "save", teamSide: att.side, text: fill(SAVE_TXT[Math.floor(rng() * SAVE_TXT.length)].replace("{g}", gk?.name ?? "the keeper"), shooter) });
  } else {
    events.push({ minute, type: "miss", teamSide: att.side, text: fill(MISS_TXT[Math.floor(rng() * MISS_TXT.length)], shooter) });
    shooter.rating -= 0.05;
  }
}

/* ---------- minute simulation ---------- */
function simulateMinute(): void {
  const h = home!, a = away!;
  minute++;

  // possession battle (mentality, pressing & tempo shifts)
  const hMid = teamPower(h, "mid") * (1 + h.mods.press / 500);
  const aMid = teamPower(a, "mid") * (1 + a.mods.press / 500);
  const hShare = Math.pow(hMid, 1.35) / (Math.pow(hMid, 1.35) + Math.pow(aMid, 1.35));
  const homeHasBall = rng() < hShare;
  const att = homeHasBall ? h : a;
  const def = homeHasBall ? a : h;
  att.possessionTicks++;

  // stamina drain: base load + tactical intensity + playstyle economy
  for (const t of [h, a]) {
    for (const p of t.players) {
      if (p.sentOff) continue;
      let drain = 0.34 + (100 - p.staminaAttr) / 100 * 0.38 + t.mods.staminaDrain + (t.mentality === "attacking" ? 0.05 : 0);
      if (p.playStyles.has("engine")) drain *= 0.88;
      else if (p.playStyles.has("rapid")) drain *= 0.93;
      p.staminaNow = Math.max(15, p.staminaNow - drain);
    }
  }

  // chance creation
  const attPower = teamPower(att, "att");
  const defPower = teamPower(def, "def");
  const chanceProb = Math.min(0.32, Math.max(0.03, 0.115 * Math.pow(attPower / defPower, 2.4)));

  if (rng() < chanceProb) {
    // PENALTY! (foul in the box) — the designated taker steps up
    if (rng() < 0.035) {
      const taker =
        onPitch(att).find((p) => p.id === att.penaltyTaker) ??
        pickWeighted(onPitch(att), (p) => (p.slot === "GK" ? 0.01 : Math.pow(Math.max(1, p.attributes.shooting), 2.4)));
      if (taker) {
        taker.shots++; att.shots++;
        events.push({ minute, type: "info", teamSide: att.side, text: `PENALTY to ${att.cfg.shortName}! ${taker.name} places the ball on the spot...` });
        resolveShot(att, def, taker, 9, 24, 1, 1.55);
      }
    } else {
      const shooter = pickWeighted(onPitch(att), (p) => {
        if (p.slot === "GK") return 0.01;
        let w = Math.pow(Math.max(1, p.attributes.shooting * 0.6 + p.attributes.dribbling * 0.25 + p.ovr * 0.15), 2.2);
        const ia = p.instr.att;
        if (ia === "get-in-behind") w *= 1.4;
        if (ia === "cut-inside") w *= 1.2;
        if (ia === "stay-wide") w *= 1.15;
        if (ia === "come-short") w *= 0.85;
        if (ia === "false-9") w *= 0.8;
        if (p.playStyles.has("maestro")) w *= 1.1;
        return w;
      });
      if (shooter) {
        shooter.shots++; att.shots++;
        let dist = 5 + Math.pow(rng(), 1.4) * 22; // 5-27m
        if (shooter.instr.att === "get-in-behind") dist = Math.max(5, dist - 2);
        const angleDeg = 12 + rng() * 58;
        // defensive line & width: a high press leaves space; a deep block crowds the box
        const pressure = Math.max(0.35, Math.min(1.25, (0.6 + rng() * 0.5) * (1 - (def.cfg.sliders?.defensiveLine ?? 50) * 0.0012) * (1 + def.mods.width / 900)));
        resolveShot(att, def, shooter, dist, angleDeg, pressure, def.mods.faceXg);
      }
    }
  }

  // cards (aggression slider raises the stakes)
  for (const t of [h, a]) {
    if (rng() < 0.0175 * t.mods.card) {
      const p = pickWeighted(onPitch(t), (p) => (p.slot === "GK" ? 0.05 : p.position === "CB" || p.position === "CDM" ? 1.6 : 1));
      if (p) {
        p.yellow++;
        if (p.yellow >= 2) {
          p.sentOff = true; p.rating -= 1.2;
          events.push({ minute, type: "card", teamSide: t.side, text: `RED CARD! ${p.name} is sent off after a second booking!` });
        } else {
          p.rating -= 0.15;
          events.push({ minute, type: "card", teamSide: t.side, text: `Yellow card for ${p.name} after a late challenge.` });
        }
      }
    }
  }

  // injuries (rare)
  if (rng() < 0.0035) {
    const t = rng() < 0.5 ? h : a;
    const p = pickWeighted(onPitch(t), () => 1);
    if (p && !injuries.includes(p.id)) {
      injuries.push(p.id);
      events.push({ minute, type: "injury", teamSide: t.side, text: `${p.name} pulls up holding his hamstring — he looks in trouble.` });
    }
  }

  // halves
  if (minute === 45 + addedTime1) {
    events.push({ minute, type: "ht", teamSide: "neutral", text: `Half-time: ${h.cfg.shortName} ${h.goals} - ${a.goals} ${a.cfg.shortName}` });
  } else if (minute === 45) {
    addedTime1 = 1 + Math.floor(rng() * 3);
  } else if (minute === 90) {
    addedTime2 = 1 + Math.floor(rng() * 4);
  }
}

/* ---------- result ---------- */
function buildResult(): MatchResult {
  const h = home!, a = away!;
  for (const t of [h, a]) {
    for (const p of t.players) {
      p.rating += (t.goals > 0 ? 0.25 : 0) + (h.goals === a.goals ? 0.05 : 0);
      const defPos = ["GK", "CB", "LB", "RB", "LWB", "RWB"].includes(p.slot);
      const conceded = t.side === "home" ? a.goals : h.goals;
      if (defPos && conceded === 0) p.rating += 0.45;
      p.rating = Math.max(3.8, Math.min(10, Math.round(p.rating * 10) / 10));
    }
  }
  const ratings: MatchRatingEntry[] = [...h.players, ...a.players]
    .filter((p) => p.id > 0)
    .map((p) => ({ playerId: p.id, rating: p.rating, goals: p.goals, assists: p.assists }));
  const motm = ratings.length ? [...ratings].sort((x, y) => y.rating - x.rating)[0] : null;
  const totalTicks = h.possessionTicks + a.possessionTicks || 1;
  const stats: MatchStats = {
    possession: [Math.round((h.possessionTicks / totalTicks) * 100), Math.round((a.possessionTicks / totalTicks) * 100)],
    shots: [h.shots, a.shots],
    onTarget: [h.onTarget, a.onTarget],
    xg: [Math.round(h.xg * 10) / 10, Math.round(a.xg * 10) / 10],
  };
  events.push({ minute: 90 + addedTime2, type: "ft", teamSide: "neutral", text: `Full-time: ${h.cfg.shortName} ${h.goals} - ${a.goals} ${a.cfg.shortName}` });
  return {
    fixtureId,
    homeId: h.cfg.id,
    awayId: a.cfg.id,
    homeGoals: h.goals,
    awayGoals: a.goals,
    events,
    ratings,
    stats,
    injuries,
    motmPlayerId: motm?.playerId ?? null,
  };
}

function snapshot(): LiveOut {
  const h = home!, a = away!;
  const totalTicks = h.possessionTicks + a.possessionTicks || 1;
  return {
    homeGoals: h.goals,
    awayGoals: a.goals,
    events: events.slice(-40),
    stats: {
      possession: [Math.round((h.possessionTicks / totalTicks) * 100), Math.round((a.possessionTicks / totalTicks) * 100)],
      shots: [h.shots, a.shots],
      onTarget: [h.onTarget, a.onTarget],
      xg: [Math.round(h.xg * 10) / 10, Math.round(a.xg * 10) / 10],
    },
    homeName: h.cfg.name,
    awayName: a.cfg.name,
  };
}

/* ---------- main loop ---------- */
async function run(): Promise<void> {
  running = true;
  post({ type: "ready" });
  const finalMinute = 90 + addedTime2;
  while (minute < finalMinute) {
    while (paused && !instant) await sleep(120);
    simulateMinute();
    const half: 1 | 2 | "FT" = minute <= 45 + addedTime1 ? 1 : 2;
    post({ type: "tick", minute, half: minute >= finalMinute ? "FT" : half, snapshot: snapshot() });
    if (!instant) await sleep(Math.max(8, 90 / speed));
  }
  post({ type: "fulltime", result: buildResult() });
  running = false;
}

function begin(fixture: number, hCfg: MatchTeamConfig, aCfg: MatchTeamConfig, spd: number) {
  fixtureId = fixture;
  // build home first without an opponent, then rebuild pairs so man-mark is symmetric
  const awayMods = computeMods(aCfg);
  home = makeTeam(hCfg, "home", awayMods);
  const homeMods = home.mods;
  away = makeTeam(aCfg, "away", homeMods);
  minute = 0;
  events = [{ minute: 0, type: "ko", teamSide: "neutral", text: `Kick-off at ${hCfg.name}! ${hCfg.shortName} vs ${aCfg.shortName}.` }];
  speed = spd;
  injuries = [];
  void run();
}

self.onmessage = (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data;
  switch (msg.type) {
    case "start":
      speed = msg.speed ?? 1;
      begin(msg.fixtureId, msg.home, msg.away, speed);
      break;
    case "speed":
      speed = msg.speed;
      break;
    case "pause":
      paused = true;
      break;
    case "resume":
      paused = false;
      break;
    case "instant":
      instant = true;
      paused = false;
      break;
  }
};

export {};
