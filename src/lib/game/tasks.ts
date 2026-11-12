/**
 * v6.0 — Central task list (FC Career "Task List / To-Do").
 * Pure derivation from game state — no mutations, safe to call during render.
 */
import type { Dataset, GameState } from "./types";
import { transferWindow } from "./career";
import { weekOfSeason } from "./career";

export interface Task {
  id: string;
  label: string;
  detail: string;
  severity: "high" | "medium" | "low";
  /** where to send the manager when tapped */
  tab: "home" | "squad" | "transfers" | "season" | "office";
}

export function buildTaskList(game: GameState, dataset: Dataset): Task[] {
  const tasks: Task[] = [];
  const clubName = dataset.teams.find((t) => t.id === game.clubId)?.name ?? "the club";

  /* pending inbox conversations */
  const pending = game.inbox.filter((m) => !m.resolvedOptionId);
  if (pending.length > 0) {
    tasks.push({
      id: "inbox",
      label: `${pending.length} message${pending.length > 1 ? "s" : ""} need a decision`,
      detail: pending[0]?.title ?? "Player conversations waiting",
      severity: "high",
      tab: "home",
    });
  }

  /* unanswered press conference */
  if (game.press && game.press.answered.length < game.press.questions.length) {
    tasks.push({
      id: "press",
      label: "Press conference waiting",
      detail: game.press.title,
      severity: "medium",
      tab: "home",
    });
  }

  /* expiring contracts */
  const expiring = game.players.filter((p) => p.contractYears <= 1);
  if (expiring.length > 0) {
    tasks.push({
      id: "contracts",
      label: `${expiring.length} contract${expiring.length > 1 ? "s" : ""} expiring soon`,
      detail: expiring.slice(0, 3).map((p) => p.name).join(", ") + (expiring.length > 3 ? ` +${expiring.length - 3} more` : ""),
      severity: "high",
      tab: "squad",
    });
  }

  /* injured XI members */
  const injuredXI = game.lineup
    .filter((id): id is number => id !== null)
    .map((id) => game.players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p && p.injuryWeeks > 0));
  if (injuredXI.length > 0) {
    tasks.push({
      id: "injured-xi",
      label: `${injuredXI.length} starter${injuredXI.length > 1 ? "s" : ""} in the treatment room`,
      detail: injuredXI.map((p) => `${p.name} (${p.injuryWeeks}w)`).join(", "),
      severity: "high",
      tab: "squad",
    });
  }

  /* low morale */
  const unhappy = game.players.filter((p) => p.morale < 35 && p.injuryWeeks === 0);
  if (unhappy.length > 0) {
    tasks.push({
      id: "morale",
      label: `${unhappy.length} player${unhappy.length > 1 ? "s" : ""} with poor morale`,
      detail: unhappy.slice(0, 3).map((p) => p.name).join(", "),
      severity: "medium",
      tab: "squad",
    });
  }

  /* low sharpness starters */
  const rusty = game.lineup
    .filter((id): id is number => id !== null)
    .map((id) => game.players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p && p.sharpness < 40));
  if (rusty.length > 0) {
    tasks.push({
      id: "sharpness",
      label: `${rusty.length} starter${rusty.length > 1 ? "s" : ""} low on match sharpness`,
      detail: "Consider the All Out Performance training balance or squad rotation",
      severity: "medium",
      tab: "squad",
    });
  }

  /* board pressure */
  if (game.boardConfidence < 30) {
    tasks.push({
      id: "board",
      label: "Board confidence critical",
      detail: "Results must improve to secure your position",
      severity: "high",
      tab: "office",
    });
  }

  /* transfer window open */
  const tw = transferWindow(weekOfSeason(game));
  if (tw.open && game.transferBudget > 500_000) {
    tasks.push({
      id: "window",
      label: tw.deadline ? "Deadline day is here" : "Transfer window is open",
      detail: `${game.transferBudget > 0 ? "Budget available" : "No funds"} — strengthen ${clubName}`,
      severity: tw.deadline ? "high" : "low",
      tab: "transfers",
    });
  }

  /* GTN report ready */
  if (game.gtnReport.length > 0) {
    tasks.push({
      id: "gtn",
      label: `${game.gtnReport.length} GTN report${game.gtnReport.length > 1 ? "s" : ""} ready`,
      detail: "Scouting network has found new targets",
      severity: "medium",
      tab: "transfers",
    });
  }

  /* scouting queue in progress */
  if (game.scoutingQueue.length > 0) {
    tasks.push({
      id: "scouting",
      label: `${game.scoutingQueue.length} scout report${game.scoutingQueue.length > 1 ? "s" : ""} in progress`,
      detail: "Dossiers being compiled this week",
      severity: "low",
      tab: "transfers",
    });
  }

  /* loans returning soon */
  const returning = game.loans.filter((l) => l.weeksLeft <= 2);
  if (returning.length > 0) {
    tasks.push({
      id: "loans",
      label: `${returning.length} loan${returning.length > 1 ? "s" : ""} ending soon`,
      detail: returning.map((l) => `${l.playerName} (${l.direction === "out" ? "returns to you" : "returns to parent club"})`).join(", "),
      severity: "low",
      tab: "transfers",
    });
  }

  /* job offers */
  if (game.offers.length > 0) {
    tasks.push({
      id: "jobs",
      label: `${game.offers.length} job offer${game.offers.length > 1 ? "s" : ""} on the table`,
      detail: game.offers.map((o) => o.teamName).join(", "),
      severity: "high",
      tab: "office",
    });
  }

  /* pro career: pending decision */
  if (game.pro?.pendingDecision) {
    tasks.push({
      id: "pro-decision",
      label: "Off-pitch decision waiting",
      detail: game.pro.pendingDecision.title,
      severity: "medium",
      tab: "home",
    });
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return tasks.sort((a, b) => order[a.severity] - order[b.severity]);
}
