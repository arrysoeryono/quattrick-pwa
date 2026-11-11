/**
 * Quattrick Football Manager — client-side Excel generation (SheetJS).
 *
 * Builds the 4-sheet workbook (Instructions / Leagues / Teams / Players) used
 * both for the downloadable template and for exporting the active dataset.
 * The pure `build*Workbook` helpers are exported so the workbook-building
 * path can be exercised outside the browser (tests, scripts) — the public
 * `download*` functions call XLSX.writeFile to trigger a browser download.
 */

import * as XLSX from "xlsx";
import type { Dataset, LeagueRow, PlayerRow, TeamRow } from "@/lib/game/types";

const TEMPLATE_FILENAME = "Quattrick_Database_Template.xlsx";

const INSTRUCTION_LINES: readonly string[] = [
  "QUATTRICK FOOTBALL MANAGER - DATABASE TEMPLATE",
  "",
  "1. Leagues sheet: id, name, country, tier (1 = top division)",
  "2. Teams sheet: id, league_id must match a league id, short_name max 5 chars",
  "3. Players sheet: position must be one of GK, CB, LB, LWB, RB, RWB, CDM, CM, CAM, LM, RM, LAM, RAM, LW, RW, LF, RF, CF, ST",
  "Attribute columns (pace, shooting, passing, dribbling, defending, physical) must be integers 1-99",
  "overall_rating is recomputed by the game engine but keep it realistic (average of attributes)",
  "potential >= overall_rating recommended",
  "market_value and salary are integers (salary = weekly wage)",
  "You may generate thousands of rows using Excel formulas or AI tools, then import the file in-game.",
  "",
  "Delete the sample rows before importing your own data.",
];

const LEAGUE_HEADERS: readonly string[] = ["id", "name", "country", "tier"];
const TEAM_HEADERS: readonly string[] = [
  "id", "league_id", "name", "short_name", "reputation", "transfer_budget", "wage_budget",
];
const PLAYER_HEADERS: readonly string[] = [
  "id", "team_id", "name", "age", "position", "overall_rating", "potential",
  "market_value", "salary", "pace", "shooting", "passing", "dribbling", "defending", "physical",
];

type Cell = string | number;
type SheetAoa = Cell[][];

const TEMPLATE_LEAGUES: LeagueRow[] = [
  { id: 1, name: "Premier League", country: "England", tier: 1 },
];

const TEMPLATE_TEAMS: TeamRow[] = [
  {
    id: 101,
    leagueId: 1,
    name: "Red Dragons FC",
    shortName: "RDF",
    logoUrl: null,
    reputation: 85,
    transferBudget: 50000000,
    wageBudget: 500000,
  },
];

const TEMPLATE_PLAYERS: PlayerRow[] = [
  {
    id: 1001,
    teamId: 101,
    name: "Marcus Vance",
    age: 23,
    position: "ST",
    overallRating: 84,
    potential: 90,
    marketValue: 45000000,
    salary: 120000,
    attributes: { pace: 88, shooting: 85, passing: 75, dribbling: 82, defending: 40, physical: 78 },
  },
  {
    id: 1002,
    teamId: 101,
    name: "Thiago Almeida",
    age: 28,
    position: "CB",
    overallRating: 82,
    potential: 84,
    marketValue: 28000000,
    salary: 95000,
    attributes: { pace: 62, shooting: 45, passing: 70, dribbling: 55, defending: 88, physical: 86 },
  },
  {
    id: 1003,
    teamId: 101,
    name: "Petr Novak",
    age: 31,
    position: "GK",
    overallRating: 80,
    potential: 81,
    marketValue: 15000000,
    salary: 80000,
    attributes: { pace: 55, shooting: 30, passing: 68, dribbling: 40, defending: 60, physical: 84 },
  },
];

function leagueToRow(league: LeagueRow): Cell[] {
  return [league.id, league.name, league.country, league.tier];
}

function teamToRow(team: TeamRow): Cell[] {
  return [
    team.id, team.leagueId, team.name, team.shortName,
    team.reputation, team.transferBudget, team.wageBudget,
  ];
}

function playerToRow(player: PlayerRow): Cell[] {
  const a = player.attributes;
  return [
    player.id, player.teamId, player.name, player.age, player.position,
    player.overallRating, player.potential, player.marketValue, player.salary,
    a.pace, a.shooting, a.passing, a.dribbling, a.defending, a.physical,
  ];
}

function buildSheet(aoa: SheetAoa, widths: number[]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

function appendInstructionsSheet(wb: XLSX.WorkBook): void {
  const aoa: SheetAoa = INSTRUCTION_LINES.map((line) => [line]);
  XLSX.utils.book_append_sheet(wb, buildSheet(aoa, [115]), "Instructions");
}

function appendDatabaseSheets(
  wb: XLSX.WorkBook,
  dataset: Pick<Dataset, "leagues" | "teams" | "players">,
): void {
  const leagueAoa: SheetAoa = [[...LEAGUE_HEADERS], ...dataset.leagues.map(leagueToRow)];
  XLSX.utils.book_append_sheet(wb, buildSheet(leagueAoa, [8, 24, 16, 8]), "Leagues");

  const teamAoa: SheetAoa = [[...TEAM_HEADERS], ...dataset.teams.map(teamToRow)];
  XLSX.utils.book_append_sheet(wb, buildSheet(teamAoa, [8, 12, 28, 12, 12, 16, 14]), "Teams");

  const playerAoa: SheetAoa = [[...PLAYER_HEADERS], ...dataset.players.map(playerToRow)];
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(playerAoa, [8, 10, 24, 8, 10, 12, 10, 14, 12, 8, 10, 10, 12, 12, 10]),
    "Players",
  );
}

/** Pure builder: the downloadable template workbook (Instructions + sample rows). */
export function buildTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  appendInstructionsSheet(wb);
  appendDatabaseSheets(wb, {
    leagues: TEMPLATE_LEAGUES,
    teams: TEMPLATE_TEAMS,
    players: TEMPLATE_PLAYERS,
  });
  return wb;
}

/** Pure builder: export workbook for an in-memory dataset (4 sheets, template order). */
export function buildDatasetWorkbook(dataset: Dataset): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  appendInstructionsSheet(wb);
  appendDatabaseSheets(wb, dataset);
  return wb;
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Builds the template workbook and triggers a browser download. */
export function downloadExcelTemplate(): void {
  XLSX.writeFile(buildTemplateWorkbook(), TEMPLATE_FILENAME);
}

/** Builds an export workbook for the active dataset and triggers a browser download. */
export function exportDatasetToExcel(dataset: Dataset): void {
  XLSX.writeFile(buildDatasetWorkbook(dataset), `Quattrick_Database_Export_${dateStamp()}.xlsx`);
}
