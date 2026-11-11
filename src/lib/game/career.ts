/**
 * Quattrick Career Expansion (v4.1 "Bursa Hidup" / v4.2 "Kursi Kepelatih" /
 * v4.3 "Generasi Emas" / v4.4 "Match Day Feel").
 *
 * Everything here is plain-JSON and save-safe: the module only mutates the
 * GameState/Dataset it is handed and never performs IO.
 */
import type {
  AITransferRecord,
  Dataset,
  Difficulty,
  Fixture,
  GameState,
  InboxMessage,
  NewsItem,
  PlayerState,
  PositionalAttributes,
  SocialPost,
} from "./types";
import { computeMarketValue } from "./defaultData";
import { computeOverall } from "./development";

/* ============================================================
 * Small helpers
 * ============================================================ */

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function pushNews(game: GameState, type: NewsItem["type"], title: string, body: string): void {
  game.news.unshift({ id: uid(), date: game.currentDate, type, title, body });
  if (game.news.length > 60) game.news.length = 60;
}

export function pushSocial(game: GameState, post: Omit<SocialPost, "id" | "date" | "likes">): void {
  game.social.unshift({
    ...post,
    id: uid(),
    date: game.currentDate,
    likes: 40 + Math.floor(Math.random() * 4000),
  });
  if (game.social.length > 30) game.social.length = 30;
}

export function weekOfSeason(game: GameState): number {
  // weeks are 1..18 league, cup pseudo-weeks map at .5 offsets
  const played = game.fixtures.filter((f) => f.played && (f.competition ?? "league") === "league").length / 2;
  return Math.floor(played) + 1;
}

/** Effective weekly ordering key: league rounds stay 1..18, cup lands mid-week. */
export function fixtureWeek(f: Fixture): number {
  if ((f.competition ?? "league") === "cup") {
    if (f.round === 100) return 7.5;
    if (f.round === 101) return 13.5;
    return 19; // final after the league ends
  }
  return f.round;
}

export function isDerbyFixture(game: GameState, homeId: number, awayId: number): boolean {
  return Math.abs(homeId - awayId) === 1 && homeId !== awayId;
}

/* ============================================================
 * v4.1 — Transfer world
 * ============================================================ */

export const SUMMER_WINDOW = { start: 1, end: 4 };
export const WINTER_WINDOW = { start: 10, end: 11 };

export function transferWindow(week: number): { open: boolean; deadline: boolean; label: string } {
  if (week >= SUMMER_WINDOW.start && week <= SUMMER_WINDOW.end) {
    return { open: true, deadline: week === SUMMER_WINDOW.end, label: "Summer window" };
  }
  if (week >= WINTER_WINDOW.start && week <= WINTER_WINDOW.end) {
    return { open: true, deadline: week === WINTER_WINDOW.end, label: "Winter window" };
  }
  return { open: false, deadline: false, label: "" };
}

const AI_PRESS_HANDLES = [
  ["Transfer Guru", "@transferguru"],
  ["NTN Sports", "@ntnsports"],
  ["The Gaffer Post", "@gafferpost"],
  ["Deadline Day Live", "@deadlineday"],
  ["Groundhopper", "@groundhopper"],
];

function teamName(dataset: Dataset, id: number): string {
  return dataset.teams.find((t) => t.id === id)?.name ?? `Team ${id}`;
}

function aiBudget(dataset: Dataset, teamId: number): number {
  const t = dataset.teams.find((x) => x.id === teamId);
  return t?.transferBudget ?? 0;
}

/**
 * One weekly pass of the living transfer market.
 * - AI clubs buy players from other AI clubs (never from the user's squad —
 *   bids for user players are created as inbox messages instead).
 * - Deadline day multiplies the chaos and fires a ticker of social posts.
 * - Occasionally an AI club launches a bid for one of the user's top players.
 */
export function runTransferWorld(game: GameState, dataset: Dataset, rng: () => number): void {
  const week = weekOfSeason(game);
  const window = transferWindow(week);
  if (!window.open) return;

  const aiTeams = dataset.teams.filter((t) => t.id !== game.clubId);
  if (aiTeams.length < 2) return;

  const buyers = [...aiTeams].sort(() => rng() - 0.5);
  const deadlineBoost = window.deadline ? 3 : 1;
  const attempts = (rng() < 0.65 ? 1 : 0) + (rng() < 0.35 * deadlineBoost ? 1 : 0) + (window.deadline && rng() < 0.8 ? 1 : 0);

  for (let i = 0; i < attempts; i++) {
    // buyer: pick an AI club, weighted toward richer budgets
    const buyer = buyers[i % buyers.length];
    const budget = aiBudget(dataset, buyer.id);
    // target: best affordable player from another AI club
    const pool = dataset.players
      .filter((p) => p.teamId !== game.clubId && p.teamId !== buyer.id && p.teamId !== -1)
      .filter((p) => p.marketValue <= budget * 0.9)
      .sort((a, b) => b.overallRating - a.overallRating);
    if (pool.length === 0) continue;
    const target = pool[Math.floor(rng() * Math.min(6, pool.length))];
    const fee = Math.round(target.marketValue * (1 + rng() * 0.3));
    const from = target.teamId;
    target.teamId = buyer.id;
    const record: AITransferRecord = {
      id: uid(),
      season: game.season,
      week,
      playerId: target.id,
      playerName: target.name,
      fromTeamId: from,
      toTeamId: buyer.id,
      fee,
      deadlineDay: window.deadline,
    };
    game.aiTransfers.unshift(record);
    if (game.aiTransfers.length > 40) game.aiTransfers.length = 40;

    const title = window.deadline ? `DEADLINE DAY: ${target.name} joins ${buyer.name}` : `${target.name} completes move to ${buyer.name}`;
    pushNews(game, "transfer", title, `${buyer.name} pay $${(fee / 1e6).toFixed(1)}M to ${teamName(dataset, from)} for the ${target.age}-year-old ${target.position} (OVR ${target.overallRating}).`);
    const press = AI_PRESS_HANDLES[Math.floor(rng() * AI_PRESS_HANDLES.length)];
    pushSocial(game, {
      handle: press[0],
      tag: press[1],
      tone: window.deadline ? "news" : "neutral",
      text: window.deadline
        ? `BREAKING: ${buyer.shortName} hijack the deal! ${target.name} signs for $${(fee / 1e6).toFixed(1)}M with minutes to spare!`
        : `Done deal: ${target.name} (${target.overallRating} OVR) to ${buyer.shortName}. Smart business? Time will tell.`,
    });
  }

  /* --- AI bid for one of the user's stars (inbox message) --- */
  const bidChance = window.deadline ? 0.22 : 0.08;
  if (rng() < bidChance && game.players.length > 14) {
    const stars = [...game.players].sort((a, b) => b.overallRating - a.overallRating).slice(0, 4);
    const star = stars[Math.floor(rng() * stars.length)];
    if (star && !game.inbox.some((m) => m.kind === "bid" && !m.resolvedOptionId)) {
      const bidder = buyers[1] ?? buyers[0];
      const fee = Math.round(star.marketValue * (1.15 + rng() * 0.3));
      const msg: InboxMessage = {
        id: uid(),
        date: game.currentDate,
        kind: "bid",
        playerId: star.id,
        playerName: star.name,
        title: `Transfer bid: ${star.name}`,
        body: `${bidder.name} have submitted a formal offer of $${(fee / 1e6).toFixed(2)}M for ${star.name} (OVR ${star.overallRating}). The player is aware of the interest.`,
        options: [
          { id: "accept", label: `Accept $${(fee / 1e6).toFixed(1)}M` },
          { id: "reject", label: "Reject the bid" },
        ],
        bidAmount: fee,
        bidTeamId: bidder.id,
      };
      game.inbox.unshift(msg);
    }
  }

  /* --- playtime / contract conversations --- */
  if (rng() < 0.3 && game.inbox.filter((m) => !m.resolvedOptionId).length < 2) {
    const squad = [...game.players].sort((a, b) => b.overallRating - a.overallRating);
    const top5 = squad.slice(0, 5);
    const unhappy = top5.find((p) => p.morale < 55);
    const expiring = squad.find((p) => p.contractYears <= 1 && p.overallRating >= 70);
    if (unhappy) {
      game.inbox.unshift({
        id: uid(),
        date: game.currentDate,
        kind: "playtime",
        playerId: unhappy.id,
        playerName: unhappy.name,
        title: `${unhappy.name} wants more minutes`,
        body: `"Boss, I'm one of the best players at this club and I'm warming the bench. I need to play or I'll have to consider my future."`,
        options: [
          { id: "promise", label: "Promise more minutes (+morale now, risk later)" },
          { id: "defend", label: "Back the competition" },
        ],
      });
    } else if (expiring) {
      game.inbox.unshift({
        id: uid(),
        date: game.currentDate,
        kind: "contract",
        playerId: expiring.id,
        playerName: expiring.name,
        title: `${expiring.name} wants a new deal`,
        body: `The ${expiring.age}-year-old ${expiring.position} (OVR ${expiring.overallRating}) has ${expiring.contractYears} year(s) left and fancies improved terms.`,
        options: [
          { id: "extend", label: "Offer improved contract" },
          { id: "hold", label: "Hold the line" },
        ],
      });
    }
  }
}

/** Resolve an inbox conversation. Returns a short outcome line for the UI. */
export function resolveInboxMessage(
  game: GameState,
  dataset: Dataset,
  messageId: string,
  optionId: string,
): { ok: boolean; outcome: string } {
  const msg = game.inbox.find((m) => m.id === messageId);
  if (!msg || msg.resolvedOptionId) return { ok: false, outcome: "Already handled" };
  msg.resolvedOptionId = optionId;

  if (msg.kind === "bid" && msg.playerId !== null && msg.bidAmount) {
    const idx = game.players.findIndex((p) => p.id === msg.playerId);
    if (optionId === "accept" && idx >= 0) {
      const p = game.players[idx];
      const fee = msg.bidAmount;
      game.transferBudget += fee;
      game.players.splice(idx, 1);
      game.lineup = game.lineup.map((id) => (id === p.id ? null : id));
      const row = { id: p.id, teamId: msg.bidTeamId ?? -1, name: p.name, age: p.age, position: p.position, overallRating: p.overallRating, potential: p.potential, marketValue: p.marketValue, salary: p.salary, attributes: p.attributes };
      dataset.players.push(row);
      msg.outcome = `Sold to ${teamName(dataset, msg.bidTeamId ?? -1)} for $${(fee / 1e6).toFixed(1)}M`;
      pushNews(game, "transfer", `${p.name} sold for $${(fee / 1e6).toFixed(1)}M`, `The board accepted the offer. Fans will demand the money is reinvested.`);
      pushSocial(game, { handle: "Ultras", tag: "@ultras", tone: "mock", text: `They sold ${p.name}... this club sells everyone. #sacktheboard` });
      return { ok: true, outcome: msg.outcome };
    }
    if (optionId === "reject") {
      msg.outcome = "Bid rejected";
      const p = game.players.find((x) => x.id === msg.playerId);
      if (p) p.morale = Math.min(100, p.morale + 5);
      pushNews(game, "transfer", `Bid for ${msg.playerName} rejected`, `The manager told the board the star man is not for sale at any price.`);
      return { ok: true, outcome: msg.outcome };
    }
  }

  if (msg.kind === "playtime" && msg.playerId !== null) {
    const p = game.players.find((x) => x.id === msg.playerId);
    if (p) {
      if (optionId === "promise") {
        p.morale = Math.min(100, p.morale + 12);
        msg.outcome = "Promised minutes. Deliver or morale will crash";
      } else {
        p.morale = Math.max(5, p.morale - 6);
        msg.outcome = "Told to fight for his place";
      }
    }
    return { ok: true, outcome: msg.outcome ?? "Done" };
  }

  if (msg.kind === "contract" && msg.playerId !== null) {
    const p = game.players.find((x) => x.id === msg.playerId);
    if (p) {
      if (optionId === "extend") {
        const wageHike = Math.round(p.salary * 0.25);
        const cost = wageHike * 40;
        if (game.transferBudget >= cost) {
          game.transferBudget -= cost;
          p.salary += wageHike;
          p.contractYears = Math.max(p.contractYears, 3);
          p.morale = Math.min(100, p.morale + 14);
          msg.outcome = `New 3-year deal, +$${(wageHike / 1000).toFixed(1)}K/w`;
          pushNews(game, "finance", `${p.name} signs new contract`, `Improved terms worth $${(p.salary / 1000).toFixed(1)}K per week keep him at the club until ${game.season + p.contractYears}.`);
        } else {
          p.morale = Math.max(5, p.morale - 8);
          msg.outcome = "Budget too tight, talks collapsed";
        }
      } else {
        p.morale = Math.max(5, p.morale - 10);
        msg.outcome = "Contract talks shelved, player unimpressed";
      }
    }
    return { ok: true, outcome: msg.outcome ?? "Done" };
  }

  return { ok: true, outcome: "Done" };
}

/* ============================================================
 * v4.2 — Board confidence, objectives & sacking
 * ============================================================ */

export function applyBoardResult(game: GameState, won: boolean, drew: boolean, isCup: boolean, isDerby: boolean): void {
  let delta = won ? 3 : drew ? 0 : -4;
  if (isCup) delta = won ? 5 : drew ? -1 : -6;
  if (isDerby && won) delta += 1;
  if (isDerby && !won && !drew) delta -= 1;
  game.boardConfidence = Math.max(0, Math.min(100, game.boardConfidence + delta));
  if (game.boardConfidence < 22 && Math.random() < 0.5) {
    pushNews(game, "board", "Board issues a warning", "The directors publicly backed you for now. Results must improve immediately.");
  }
}

export function applyCupProgression(game: GameState, advanced: boolean, eliminated: boolean): void {
  if (advanced) game.boardConfidence = Math.min(100, game.boardConfidence + 5);
  if (eliminated) {
    game.boardConfidence = Math.max(0, game.boardConfidence - (game.seasonObjective.cupTarget === "none" ? 3 : 8));
    pushNews(game, "cup", "Cup run ends", "The board noted the exit, but the league remains the priority.");
  }
}

export function cupTargetFor(reputation: number): "win" | "final" | "none" {
  if (reputation >= 74) return "win";
  if (reputation >= 62) return "final";
  return "none";
}

/** End-of-season verdict: keep the job, or get sacked with offers elsewhere. */
export function seasonBoardReview(
  game: GameState,
  dataset: Dataset,
  achieved: boolean,
  cupOutcome: "win" | "final" | "none",
  trophies: string[],
): { sacked: boolean; offers: number[] } {
  const leagueOk = achieved;
  const cupOk = game.seasonObjective.cupTarget === "none" || cupOutcome === game.seasonObjective.cupTarget || (game.seasonObjective.cupTarget === "final" && cupOutcome === "win");
  if (trophies.length > 0) game.managerRep = Math.min(100, game.managerRep + 4);
  if (leagueOk) game.managerRep = Math.min(100, game.managerRep + 2);
  else game.managerRep = Math.max(0, game.managerRep - 1);

  const success = (leagueOk ? 1 : 0) + (cupOk ? 1 : 0);
  if (success === 2 || game.boardConfidence >= 55) {
    game.boardConfidence = Math.min(100, game.boardConfidence + 12);
    pushNews(game, "board", "Board renews its trust", "The directors are happy with the direction of the club. Expectations will rise.");
    return { sacked: false, offers: [] };
  }
  if (game.boardConfidence < 28 && !leagueOk) {
    // sacked — offers come from smaller-or-equal clubs
    const pool = dataset.teams.filter((t) => t.id !== game.clubId && t.reputation <= (dataset.teams.find((x) => x.id === game.clubId)?.reputation ?? 50) + 5);
    const offers = [...pool].sort(() => Math.random() - 0.5).slice(0, 2).map((t) => t.id);
    game.sacked = true;
    game.boardConfidence = 0;
    pushNews(game, "board", "SACKED: the board pulls the trigger", "Results were not good enough. Your agent's phone is already ringing...");
    return { sacked: true, offers };
  }
  game.boardConfidence = Math.max(15, game.boardConfidence + 6);
  pushNews(game, "board", "Board expects better next season", "A stern statement: improvements are non-negotiable.");
  return { sacked: false, offers: [] };
}

/* ============================================================
 * v4.2 — Domestic cup (top-8 knockout: QF wk7.5, SF wk13.5, Final wk19)
 * ============================================================ */

export function drawCupRound1(dataset: Dataset, leagueId: number, seasonStartMs: number): Fixture[] {
  const teams = dataset.teams
    .filter((t) => t.leagueId === leagueId)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 8);
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  const ties: Fixture[] = [];
  const date = new Date(seasonStartMs + 7 * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  for (let i = 0; i < 4; i++) {
    ties.push({
      id: 900 + i,
      round: 100,
      date,
      homeId: shuffled[i * 2].id,
      awayId: shuffled[i * 2 + 1].id,
      played: false,
      homeGoals: null,
      awayGoals: null,
      competition: "cup",
      tieLabel: "Quarter-final",
    });
  }
  return ties;
}

export function cupTies(game: GameState, round: number): Fixture[] {
  return game.fixtures.filter((f) => f.competition === "cup" && f.round === round);
}

/** Deterministic cup winner (decides draws via a penalty shootout). */
export function cupWinner(f: Fixture, dataset: Dataset): number {
  if (f.homeGoals === null || f.awayGoals === null) return -1;
  if (f.homeGoals > f.awayGoals) return f.homeId;
  if (f.awayGoals > f.homeGoals) return f.awayId;
  const hs = estimate(dataset, f.homeId);
  const as = estimate(dataset, f.awayId);
  const seed = f.id * 104729 + (f.homeGoals * 7 + f.awayGoals * 13);
  return (seed % (hs + as)) < hs ? f.homeId : f.awayId;
}

function estimate(dataset: Dataset, teamId: number): number {
  const t = dataset.teams.find((x) => x.id === teamId);
  return t?.reputation ?? 50;
}

/** After a round completes, build the next round's ties from the winners. */
export function progressCup(game: GameState, dataset: Dataset): void {
  void dataset;
  const buildNext = (round: number, nextRound: number, label: string, weekOffset: number) => {
    const done = cupTies(game, round);
    if (done.length === 0 || done.some((t) => !t.played)) return;
    if (cupTies(game, nextRound).length > 0) return;
    const winners = done.map((t) => cupWinner(t, dataset));
    const pairs: [number, number][] = [];
    for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1]]);
    const start = Date.UTC(game.season, 6, 12);
    const date = new Date(start + weekOffset * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    pairs.forEach(([h, a], i) => {
      game.fixtures.push({
        id: 900 + nextRound * 10 + i,
        round: nextRound,
        date,
        homeId: h,
        awayId: a,
        played: false,
        homeGoals: null,
        awayGoals: null,
        competition: "cup",
        tieLabel: label,
      });
    });
  };
  buildNext(100, 101, "Semi-final", 13);
  buildNext(101, 102, "Final", 18);
}

export function cupChampion(game: GameState, dataset: Dataset): number | null {
  const finals = cupTies(game, 102);
  if (finals.length === 1 && finals[0].played) return cupWinner(finals[0], dataset);
  return null;
}

export function userCupOutcome(game: GameState, dataset: Dataset): "win" | "final" | "none" {
  const finals = cupTies(game, 102);
  if (finals.length === 1 && finals[0].played) {
    const userIn = finals[0].homeId === game.clubId || finals[0].awayId === game.clubId;
    if (!userIn) return "none";
    return cupWinner(finals[0], dataset) === game.clubId ? "win" : "final";
  }
  return "none";
}

/* ============================================================
 * v4.4 — Achievements
 * ============================================================ */

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-win", name: "Off the Mark", desc: "Win your first match as a manager." },
  { id: "streak-5", name: "Unstoppable", desc: "Win 5 matches in a row." },
  { id: "unbeaten-10", name: "Fortress", desc: "Go 10 league matches unbeaten." },
  { id: "hattrick", name: "Match Ball", desc: "One of your players scores a hat-trick." },
  { id: "wonderkid-signing", name: "Transfer Masterclass", desc: "Sign a player with 88+ potential." },
  { id: "academy-star", name: "Academy Graduate", desc: "Develop a youth prospect to 78+ overall." },
  { id: "cup-win", name: "Cup Glory", desc: "Win the domestic cup." },
  { id: "league-title", name: "Champions", desc: "Win the league title." },
  { id: "clean-sheet-3", name: "Brick Wall", desc: "Keep 3 consecutive clean sheets." },
  { id: "big-signing", name: "Statement Signing", desc: "Spend $30M+ on a single player." },
  { id: "derby-win", name: "Bragging Rights", desc: "Win a derby match." },
  { id: "comeback", name: "Never Say Die", desc: "Win a match after trailing at half-time." },
];

export function unlockAchievement(game: GameState, id: string): boolean {
  if (game.achievements.some((a) => a.id === id)) return false;
  game.achievements.push({ id, date: game.currentDate });
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (def) pushNews(game, "award", `Achievement unlocked: ${def.name}`, def.desc);
  return true;
}

/* ============================================================
 * v4.3 — Scouting helpers
 * ============================================================ */

export function scoutEstimate(p: { overallRating: number }): number {
  // 1-5 star rough guide from OVR
  if (p.overallRating >= 84) return 5;
  if (p.overallRating >= 78) return 4;
  if (p.overallRating >= 71) return 3;
  if (p.overallRating >= 63) return 2;
  return 1;
}

export function scoutCost(p: { marketValue: number }): number {
  return Math.max(50000, Math.round(p.marketValue * 0.005));
}

export function queueScout(game: GameState, playerId: number): boolean {
  if (game.scoutedIds.includes(playerId)) return false;
  if (game.scoutingQueue.some((s) => s.playerId === playerId)) return false;
  if (game.scoutingQueue.length >= 3) return false;
  game.scoutingQueue.push({ playerId, weeksLeft: 1 });
  return true;
}

export function tickScouting(game: GameState): number[] {
  const revealed: number[] = [];
  for (const job of game.scoutingQueue) {
    job.weeksLeft -= 1;
    if (job.weeksLeft <= 0) {
      game.scoutedIds.push(job.playerId);
      revealed.push(job.playerId);
    }
  }
  game.scoutingQueue = game.scoutingQueue.filter((j) => j.weeksLeft > 0);
  return revealed;
}

/* ============================================================
 * v4.3 — Youth academy intake (per season, scaled by facility)
 * ============================================================ */

export function academyIntake(game: GameState, dataset: Dataset, nextId: number, rng: () => number): { id: number; name: string; position: string; age: number; ovr: number; pot: number }[] {
  const count = 2 + (rng() < 0.4 ? 1 : 0);
  const out: { id: number; name: string; position: string; age: number; ovr: number; pot: number }[] = [];
  const positions = ["CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST", "CF", "GK"];
  const firstNames = ["Kai", "Noel", "Rui", "Milo", "Ezra", "Tye", "Idris", "Louie", "Sacha", "Rasmus", "Diego", "Matteo"];
  const lastNames = ["Bennett", "Oyarzun", "Keita", "Hallstrom", "Marchetti", "Dubois", "Ferrer", "Nkemdi", "Aaltonen", "Bravo", "Lindqvist", "Okafor"];
  for (let i = 0; i < count; i++) {
    const pos = positions[Math.floor(rng() * positions.length)] as PlayerState["position"];
    const age = 16 + Math.floor(rng() * 2);
    const base = 44 + Math.floor(rng() * 12) + game.facilityLevel * 2;
    // keepers carry the dedicated GK attribute set
    const attrs: PositionalAttributes = pos === "GK"
      ? {
          diving: base + Math.floor(rng() * 10),
          handling: base + Math.floor(rng() * 10),
          reflexes: base + Math.floor(rng() * 10),
          positioning: base + Math.floor(rng() * 10),
          kicking: base + Math.floor(rng() * 10),
          speed: base + Math.floor(rng() * 10),
        }
      : {
          pace: base + Math.floor(rng() * 10),
          shooting: base + Math.floor(rng() * 10),
          passing: base + Math.floor(rng() * 10),
          dribbling: base + Math.floor(rng() * 10),
          defending: base + Math.floor(rng() * 10),
          physical: base + Math.floor(rng() * 10),
        };
    const { ovr, pot } = (() => {
      const o = computeOverall(attrs, pos);
      return { ovr: o, pot: Math.min(92, o + 14 + Math.floor(rng() * 14) + game.facilityLevel * 2) };
    })();
    const id = nextId + i;
    const name = `${firstNames[Math.floor(rng() * firstNames.length)]} ${lastNames[Math.floor(rng() * lastNames.length)]}`;
    dataset.players.push({
      id,
      teamId: game.clubId,
      name,
      age,
      position: pos,
      overallRating: ovr,
      potential: pot,
      marketValue: computeMarketValue(ovr, age, pot),
      salary: 1000 + Math.floor(rng() * 2000),
      attributes: attrs,
    });
    const st: PlayerState = {
      id,
      teamId: game.clubId,
      name,
      age,
      position: pos,
      overallRating: ovr,
      potential: pot,
      marketValue: computeMarketValue(ovr, age, pot),
      salary: 1000 + Math.floor(rng() * 2000),
      attributes: attrs,
      sharpness: 55,
      morale: 72,
      stamina: 100,
      form: 0,
      injuryWeeks: 0,
      contractYears: 3,
      squadRole: "Prospect",
      trainingPlan: { focus: "balanced", intensity: "normal" },
      retrain: null,
      seasonStats: { apps: 0, goals: 0, assists: 0, ratingSum: 0, cleanSheets: 0 },
      careerStats: { apps: 0, goals: 0, assists: 0 },
      devPath: null,
      mentor: null,
    };
    game.players.push(st);
    out.push({ id, name, position: pos, age, ovr, pot });
  }
  return out;
}

export function facilityUpgradeCost(level: number): number {
  return level * 3_000_000;
}

/* ============================================================
 * v4.4 — Social flavour generators
 * ============================================================ */

const FANS = [
  ["Tricolor Ultras", "@ultras"],
  ["Mrs.stat", "@mrsxg"],
  ["Statman Dave", "@statmandave"],
  ["Away End View", "@awayend"],
];

export function socialAfterMatch(game: GameState, won: boolean, drew: boolean, derby: boolean, myGoals: number, oppGoals: number, oppShort: string): void {
  const fan = FANS[Math.floor(Math.random() * FANS.length)];
  if (won && derby) {
    pushSocial(game, { handle: fan[0], tag: fan[1], tone: "hype", text: `DERBY DAY BELONGS TO US! ${myGoals}-${oppGoals} and the away end is silent. Beautiful.` });
  } else if (won) {
    pushSocial(game, { handle: fan[0], tag: fan[1], tone: "hype", text: `${myGoals}-${oppGoals}! That's what we're about. ${oppShort} couldn't live with us.` });
  } else if (drew) {
    pushSocial(game, { handle: fan[0], tag: fan[1], tone: "neutral", text: `A point is a point. ${myGoals}-${oppGoals} vs ${oppShort}. We move.` });
  } else {
    pushSocial(game, { handle: fan[0], tag: fan[1], tone: "mock", text: `${myGoals}-${oppGoals} against ${oppShort}. I've seen better defending at a bus stop.` });
  }
}
