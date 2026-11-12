/**
 * v6.0 — Press Conferences (FC Career "Central > Press Conferences").
 * Pre-match media sessions for big fixtures. Answers nudge squad morale,
 * board confidence and generate social buzz.
 */
import type { Dataset, GameState, PressQuestion, PressSession } from "./types";
import { isDerbyFixture, pushNews, pushSocial, uid, weekOfSeason } from "./career";
import { computeTable } from "./season";

/* ---------- question pool ---------- */
const QUESTION_POOL: PressQuestion[] = [
  {
    id: "pq-expectations",
    question: "The press are asking — what result do you expect from your side?",
    options: [
      { id: "a", label: "\"We go all out for the win.\"", morale: 4, board: 1, tone: "confident" },
      { id: "b", label: "\"We take it one game at a time.\"", morale: 1, board: 1, tone: "neutral" },
      { id: "c", label: "\"We respect them, but fear nobody.\"", morale: 3, board: 0, tone: "defiant" },
    ],
  },
  {
    id: "pq-pressure",
    question: "There's mounting pressure on the club. Does it affect your preparation?",
    options: [
      { id: "a", label: "\"Pressure is a privilege at this club.\"", morale: 2, board: 2, tone: "confident" },
      { id: "b", label: "\"My job is to shield the players.\"", morale: 3, board: 1, tone: "neutral" },
      { id: "c", label: "\"The table doesn't lie. We must respond.\"", morale: -1, board: 2, tone: "defiant" },
    ],
  },
  {
    id: "pq-star",
    question: "Your key man has been in the headlines. Care to comment on his form?",
    options: [
      { id: "a", label: "\"He's world class — the numbers speak.\"", morale: 3, board: 0, tone: "confident" },
      { id: "b", label: "\"Form is temporary, quality is permanent.\"", morale: 2, board: 0, tone: "neutral" },
      { id: "c", label: "\"Everyone in my squad earns their place.\"", morale: -2, board: 1, tone: "defiant" },
    ],
  },
  {
    id: "pq-transfer",
    question: "Any movements expected in the transfer market before the deadline?",
    options: [
      { id: "a", label: "\"We're always looking to improve.\"", morale: 0, board: 1, tone: "neutral" },
      { id: "b", label: "\"I'm fully focused on the players I have.\"", morale: 2, board: 0, tone: "confident" },
      { id: "c", label: "\"No comment on other clubs' players.\"", morale: 0, board: 0, tone: "neutral" },
    ],
  },
  {
    id: "pq-rivals",
    question: "Your opponents have been talking trash in the media. A response?",
    options: [
      { id: "a", label: "\"We'll answer on the pitch.\"", morale: 4, board: 1, tone: "defiant" },
      { id: "b", label: "\"I never comment on other managers.\"", morale: 1, board: 1, tone: "neutral" },
      { id: "c", label: "\"Respect is earned. We'll remind them.\"", morale: 3, board: 0, tone: "defiant" },
    ],
  },
  {
    id: "pq-rotation",
    question: "Will you rotate the squad with such a congested calendar?",
    options: [
      { id: "a", label: "\"Everyone gets minutes — trust the group.\"", morale: 3, board: 0, tone: "confident" },
      { id: "b", label: "\"My best XI plays when it matters.\"", morale: -1, board: 1, tone: "neutral" },
      { id: "c", label: "\"Fitness data decides, not headlines.\"", morale: 1, board: 1, tone: "neutral" },
    ],
  },
  {
    id: "pq-derby",
    question: "A derby atmosphere awaits. How are the nerves in the dressing room?",
    options: [
      { id: "a", label: "\"The boys can't wait for it.\"", morale: 4, board: 0, tone: "confident" },
      { id: "b", label: "\"We treat it like any other game.\"", morale: 1, board: 1, tone: "neutral" },
      { id: "c", label: "\"These nights define a season.\"", morale: 3, board: 0, tone: "confident" },
    ],
  },
  {
    id: "pq-cup",
    question: "How much does this competition mean to your season plan?",
    options: [
      { id: "a", label: "\"We're here to win it.\"", morale: 4, board: 2, tone: "confident" },
      { id: "b", label: "\"It's a chance for the whole squad.\"", morale: 2, board: 0, tone: "neutral" },
      { id: "c", label: "\"Survive and advance. Simple.\"", morale: 1, board: 1, tone: "defiant" },
    ],
  },
];

/* ---------- creation ---------- */

/** True when the upcoming fixture deserves a full press conference. */
function isBigMatch(game: GameState, dataset: Dataset, fixtureId: number): boolean {
  const fx = game.fixtures.find((f) => f.id === fixtureId);
  if (!fx) return false;
  if (fx.competition === "cup" && (fx.round ?? 0) >= 100) return true; // QF, SF, Final
  if (isDerbyFixture(game, fx.homeId, fx.awayId)) return true;
  const leagueTeams = dataset.teams.filter((t) => t.leagueId === game.leagueId);
  const table = computeTable(leagueTeams, game.fixtures);
  const posOf = (id: number) => table.findIndex((r) => r.teamId === id) + 1;
  const oppId = fx.homeId === game.clubId ? fx.awayId : fx.homeId;
  const myPos = posOf(game.clubId);
  const oppPos = posOf(oppId);
  return (myPos > 0 && myPos <= 4) || (oppPos > 0 && oppPos <= 4);
}

/** Create a press conference for the next big match (one per week, max). */
export function maybeCreatePress(game: GameState, dataset: Dataset): void {
  if (game.press) return;
  const next = [...game.fixtures]
    .filter((f) => !f.played && (f.homeId === game.clubId || f.awayId === game.clubId))
    .sort((a, b) => a.round - b.round)[0];
  if (!next) return;
  if (!isBigMatch(game, dataset, next.id)) return;
  const week = weekOfSeason(game);
  if (game.pressDoneWeeks.includes(week)) return;

  const oppId = next.homeId === game.clubId ? next.awayId : next.homeId;
  const opp = dataset.teams.find((t) => t.id === oppId);
  // pick 3 distinct questions deterministically
  const seed = next.id * 31 + week * 7 + game.season;
  const picked: PressQuestion[] = [];
  const used = new Set<number>();
  for (let i = 0; i < 3; i++) {
    let idx = (seed * (i + 3) + i * 5) % QUESTION_POOL.length;
    let guard = 0;
    while (used.has(idx) && guard++ < QUESTION_POOL.length) idx = (idx + 1) % QUESTION_POOL.length;
    used.add(idx);
    picked.push(QUESTION_POOL[idx]);
  }
  const session: PressSession = {
    id: uid(),
    week,
    fixtureId: next.id,
    title: `Pre-match press conference: ${opp?.shortName ?? "opponent"} preview`,
    questions: picked,
    answered: [],
  };
  game.press = session;
  game.pressDoneWeeks = [...game.pressDoneWeeks.slice(-10), week];
  pushNews(game, "board", "Media day scheduled", `Journalists gather ahead of the ${opp?.name ?? "next"} fixture. Your answers shape the dressing room mood.`);
}

/* ---------- answering ---------- */

export function answerPress(game: GameState, dataset: Dataset, questionId: string, optionId: string): void {
  const session = game.press;
  if (!session) return;
  const q = session.questions.find((x) => x.id === questionId);
  const opt = q?.options.find((o) => o.id === optionId);
  if (!q || !opt) return;
  if (session.answered.includes(questionId)) return;

  session.answered.push(questionId);
  for (const p of game.players) {
    if (p.injuryWeeks > 0) continue;
    p.morale = Math.max(5, Math.min(100, p.morale + opt.morale));
  }
  game.boardConfidence = Math.max(0, Math.min(100, game.boardConfidence + opt.board));

  if (session.answered.length >= session.questions.length) {
    const quote = opt.label.replace(/"/g, "");
    pushSocial(game, {
      handle: "Press Room",
      tag: "@presser",
      tone: opt.tone === "defiant" ? "mock" : "news",
      text: `Manager on ${q.question.toLowerCase().slice(0, 48)}...: ${quote}`,
    });
    pushNews(game, "board", "Press conference complete", `The media briefing wrapped up. Dressing room mood ${opt.morale >= 3 ? "lifted" : opt.morale >= 0 ? "steady" : "ruffled"} after your comments.`);
    game.press = null;
  }
}
