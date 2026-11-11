/**
 * Quattrick Football Manager — client-side Excel parsing + validation.
 *
 * Reads a user-provided .xlsx workbook (template or hand-made export), maps
 * the flat snake_case columns onto the plain-JSON Dataset row shapes and
 * collects every data problem into warnings (auto-fixed) or errors (row
 * skipped / import blocked). Data issues NEVER throw — only unreadable or
 * corrupt files reject, letting the caller catch.
 */

import * as XLSX from "xlsx";
import type {
  Dataset,
  GKAttributes,
  LeagueRow,
  PlayerAttributes,
  PlayerRow,
  PositionCode,
  PositionalAttributes,
  TeamRow,
} from "@/lib/game/types";
import { ALL_POSITIONS } from "@/lib/game/types";
import { GK_ATTR_KEYS, OUTFIELD_ATTR_KEYS, computeOverall, migrateLegacyGkAttributes } from "@/lib/game/attributes";

export interface ParseOutcome {
  leagues: LeagueRow[];
  teams: TeamRow[];
  players: PlayerRow[];
  warnings: string[]; // auto-fixed issues (max 40 kept)
  errors: string[]; // hard errors that block import (max 40 kept)
}

/** Convenience conversion for callers that want a Dataset from a parse. */
export function outcomeToDataset(outcome: ParseOutcome): Dataset {
  return { leagues: outcome.leagues, teams: outcome.teams, players: outcome.players };
}

const MAX_MESSAGES = 40;
const POSITION_LIST = ALL_POSITIONS.join(", ");

interface MessageCollector {
  warnings: string[];
  errors: string[];
  warn(message: string): void;
  error(message: string): void;
}

function createCollector(): MessageCollector {
  const warnings: string[] = [];
  const errors: string[] = [];
  let warningsTruncated = false;
  let errorsTruncated = false;
  return {
    warnings,
    errors,
    warn(message) {
      if (warnings.length < MAX_MESSAGES) {
        warnings.push(message);
      } else if (!warningsTruncated) {
        warningsTruncated = true;
        warnings.push("Further warnings truncated.");
      }
    },
    error(message) {
      if (errors.length < MAX_MESSAGES) {
        errors.push(message);
      } else if (!errorsTruncated) {
        errorsTruncated = true;
        errors.push("Further errors truncated.");
      }
    },
  };
}

// ── coercion helpers ─────────────────────────────────────────────────────────

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceInt(value: unknown): number | null {
  const n = coerceNumber(value);
  return n === null ? null : Math.round(n);
}

function coerceText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamps an int into [min, max]; returns null if the input had no numeric value. */
function clampRange(value: unknown, min: number, max: number): { value: number | null; clamped: boolean } {
  const n = coerceInt(value);
  if (n === null) return { value: null, clamped: false };
  const c = clamp(n, min, max);
  return { value: c, clamped: c !== n };
}

// ── sheet helpers ────────────────────────────────────────────────────────────

/** Case-insensitive sheet lookup ("players", "Players", "PLAYERS"...). */
function findSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
  const target = name.trim().toLowerCase();
  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === target);
  return sheetName ? wb.Sheets[sheetName] ?? null : null;
}

/** "Overall Rating" → overall_rating, "leagueId" → league_id, "Team ID" → team_id. */
function normalizeKey(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: true,
  });
  return rawRows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      const normalized = normalizeKey(String(key));
      if (normalized !== "" && !(normalized in out)) out[normalized] = row[key];
    }
    return out;
  });
}

/** Excel row number for messages (header occupies row 1). */
function excelRow(index: number): number {
  return index + 2;
}

function formatIds(ids: Iterable<number>): string {
  return [...ids].sort((a, b) => a - b).join(", ");
}

// ── leagues ──────────────────────────────────────────────────────────────────

function parseLeagues(rows: Record<string, unknown>[], ctx: MessageCollector): LeagueRow[] {
  const leagues: LeagueRow[] = [];
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  rows.forEach((row, index) => {
    const at = excelRow(index);
    const id = coerceInt(row["id"]);
    if (id === null) {
      ctx.error(`Leagues row ${at}: missing or invalid id, row skipped`);
      return;
    }
    if (seen.has(id)) {
      duplicates.add(id);
      return;
    }
    seen.add(id);

    const name = coerceText(row["name"]);
    if (!name) {
      ctx.error(`Leagues row ${at}: missing name (id ${id}), row skipped`);
      return;
    }

    let country = coerceText(row["country"]);
    if (!country) {
      country = "Unknown";
      ctx.warn(`Leagues row ${at}: country missing, defaulted to "Unknown"`);
    }

    let tier = coerceInt(row["tier"]);
    if (tier === null) {
      tier = 1;
      ctx.warn(`Leagues row ${at}: tier missing, defaulted to 1`);
    } else if (tier < 1 || tier > 10) {
      const clamped = clamp(tier, 1, 10);
      ctx.warn(`Leagues row ${at}: tier ${tier} out of range 1-10, clamped to ${clamped}`);
      tier = clamped;
    }

    leagues.push({ id, name, country, tier });
  });

  if (duplicates.size > 0) {
    ctx.error(`Duplicate league ids: ${formatIds(duplicates)} (later rows skipped)`);
  }
  return leagues;
}

// ── teams ────────────────────────────────────────────────────────────────────

function parseTeams(
  rows: Record<string, unknown>[],
  ctx: MessageCollector,
  leagueIds: Set<number>,
): TeamRow[] {
  const teams: TeamRow[] = [];
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  rows.forEach((row, index) => {
    const at = excelRow(index);
    const id = coerceInt(row["id"]);
    if (id === null) {
      ctx.error(`Teams row ${at}: missing or invalid id, row skipped`);
      return;
    }
    if (seen.has(id)) {
      duplicates.add(id);
      return;
    }
    seen.add(id);

    const name = coerceText(row["name"]);
    if (!name) {
      ctx.error(`Teams row ${at}: missing name (id ${id}), row skipped`);
      return;
    }

    let leagueId = coerceInt(row["league_id"]);
    if (leagueId === null) {
      leagueId = 0;
      ctx.warn(`Teams row ${at}: league_id missing for team ${id}, set to 0 (unassigned)`);
    } else if (!leagueIds.has(leagueId)) {
      ctx.warn(`team ${id} references missing league ${leagueId}`);
    }

    let shortName = coerceText(row["short_name"]);
    if (!shortName) {
      shortName = name.slice(0, 5).toUpperCase();
      ctx.warn(`Teams row ${at}: short_name missing for team ${id}, derived "${shortName}" from name`);
    } else if (shortName.length > 5) {
      shortName = shortName.slice(0, 5).toUpperCase();
      ctx.warn(`Teams row ${at}: short_name longer than 5 chars for team ${id}, truncated to "${shortName}"`);
    }

    const reputation = clampRange(row["reputation"], 1, 100);
    if (reputation.value === null) {
      ctx.warn(`Teams row ${at}: reputation missing for team ${id}, defaulted to 50`);
    } else if (reputation.clamped) {
      ctx.warn(`Teams row ${at}: reputation out of range 1-100 for team ${id}, clamped to ${reputation.value}`);
    }

    const transferBudget = clampRange(row["transfer_budget"], 0, Number.MAX_SAFE_INTEGER);
    if (transferBudget.value === null) {
      ctx.warn(`Teams row ${at}: transfer_budget missing for team ${id}, defaulted to 10000000`);
    }
    const wageBudget = clampRange(row["wage_budget"], 0, Number.MAX_SAFE_INTEGER);
    if (wageBudget.value === null) {
      ctx.warn(`Teams row ${at}: wage_budget missing for team ${id}, defaulted to 100000`);
    }

    teams.push({
      id,
      leagueId,
      name,
      shortName,
      logoUrl: null,
      reputation: reputation.value ?? 50,
      transferBudget: transferBudget.value ?? 10000000,
      wageBudget: wageBudget.value ?? 100000,
    });
  });

  if (duplicates.size > 0) {
    ctx.error(`Duplicate team ids: ${formatIds(duplicates)} (later rows skipped)`);
  }
  return teams;
}

// ── players ──────────────────────────────────────────────────────────────────

const OUTFIELD_ATTRIBUTE_KEYS: readonly (keyof PlayerAttributes)[] = [...OUTFIELD_ATTR_KEYS];
const GK_ATTRIBUTE_KEYS: readonly (keyof GKAttributes)[] = [...GK_ATTR_KEYS];

/** Reads one attribute group off the row. `lenient` skips missing cells
 *  (returned as undefined) instead of hard-failing, so outfield rows may leave
 *  GK columns empty and vice versa. */
function readAttrGroup<T extends PlayerAttributes | GKAttributes>(
  row: Record<string, unknown>,
  keys: readonly (keyof T & string)[],
  ctx: MessageCollector,
  at: number,
  playerName: string,
  groupLabel: string,
  lenient: boolean,
): T | null {
  const attrs = {} as Record<string, number>;
  let missing: (keyof T & string)[] = [];
  for (const key of keys) {
    const value = coerceInt(row[key]);
    if (value === null) {
      missing.push(key);
      continue;
    }
    if (value < 1 || value > 99) {
      const clamped = clamp(value, 1, 99);
      ctx.warn(`Players row ${at}: player "${playerName}" attribute "${key}" ${value} out of range 1-99, clamped to ${clamped}`);
      attrs[key] = clamped;
    } else {
      attrs[key] = value;
    }
  }
  if (missing.length > 0) {
    if (lenient) return null; // group simply not filled in — caller decides
    for (const key of missing) {
      ctx.error(`Players row ${at}: player "${playerName}" missing ${groupLabel} attribute "${key}", row skipped`);
    }
    return null;
  }
  return attrs as unknown as T;
}

function parsePlayers(
  rows: Record<string, unknown>[],
  ctx: MessageCollector,
  teamIds: Set<number>,
): PlayerRow[] {
  const players: PlayerRow[] = [];
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  rows.forEach((row, index) => {
    const at = excelRow(index);
    const id = coerceInt(row["id"]);
    if (id === null) {
      ctx.error(`Players row ${at}: missing or invalid id, row skipped`);
      return;
    }
    if (seen.has(id)) {
      duplicates.add(id);
      return;
    }
    seen.add(id);

    const name = coerceText(row["name"]);
    if (!name) {
      ctx.error(`Players row ${at}: missing name (id ${id}), row skipped`);
      return;
    }

    let teamId = coerceInt(row["team_id"]);
    if (teamId === null) {
      teamId = 0;
      ctx.warn(`Players row ${at}: team_id missing for player ${id}, set to 0 (unassigned)`);
    } else if (!teamIds.has(teamId)) {
      ctx.warn(`player ${id} references missing team ${teamId} (kept, will be unassigned)`);
    }

    const age = coerceInt(row["age"]);
    if (age === null) {
      ctx.error(`Players row ${at}: missing or invalid age for player "${name}", row skipped`);
      return;
    }
    if (age < 15 || age > 45) {
      ctx.error(`Players row ${at}: player "${name}" age ${age} outside 15-45, row skipped`);
      return;
    }

    const rawPosition = coerceText(row["position"]);
    if (!rawPosition) {
      ctx.error(`Players row ${at}: player "${name}" has no position, row skipped`);
      return;
    }
    const position = rawPosition.toUpperCase();
    if (position !== rawPosition) {
      ctx.warn(`Players row ${at}: player "${name}" position "${rawPosition}" normalized to "${position}"`);
    }
    if (!(ALL_POSITIONS as string[]).includes(position)) {
      ctx.error(
        `Players row ${at}: player "${name}" has invalid position "${rawPosition}" (must be one of ${POSITION_LIST}), row skipped`,
      );
      return;
    }

    let overallRating = coerceInt(row["overall_rating"]);
    if (overallRating === null) {
      ctx.error(`Players row ${at}: player "${name}" missing overall_rating, row skipped`);
      return;
    }
    if (overallRating < 1 || overallRating > 99) {
      const clamped = clamp(overallRating, 1, 99);
      ctx.warn(`Players row ${at}: player "${name}" overall_rating ${overallRating} out of range 1-99, clamped to ${clamped}`);
      overallRating = clamped;
    }

    let potential = coerceInt(row["potential"]);
    if (potential === null) {
      potential = overallRating;
      ctx.warn(`Players row ${at}: player "${name}" potential missing, defaulted to overall_rating ${overallRating}`);
    } else if (potential < overallRating) {
      ctx.warn(`Players row ${at}: player "${name}" potential ${potential} below overall_rating ${overallRating}, raised to ${overallRating}`);
      potential = overallRating;
    } else if (potential > 99) {
      const clamped = clamp(potential, 1, 99);
      ctx.warn(`Players row ${at}: player "${name}" potential ${potential} out of range 1-99, clamped to ${clamped}`);
      potential = clamped;
    }

    let marketValue = coerceInt(row["market_value"]);
    if (marketValue === null) {
      marketValue = 0;
      ctx.warn(`Players row ${at}: player "${name}" market_value missing, defaulted to 0`);
    } else if (marketValue < 0) {
      ctx.warn(`Players row ${at}: player "${name}" market_value ${marketValue} below 0, clamped to 0`);
      marketValue = 0;
    }

    let salary = coerceInt(row["salary"]);
    if (salary === null) {
      salary = 1000;
      ctx.warn(`Players row ${at}: player "${name}" salary missing, defaulted to 1000`);
    } else if (salary < 0) {
      ctx.warn(`Players row ${at}: player "${name}" salary ${salary} below 0, clamped to 0`);
      salary = 0;
    }

    // attribute columns are position-dependent: keepers read the GK group,
    // outfielders read the six outfield attributes (the other group may be empty)
    let attributes: PositionalAttributes;
    if (position === "GK") {
      // legacy workbooks may still carry the retired "command" column — map it to speed
      if (row["speed"] === undefined && row["command"] !== undefined) {
        const cmd = coerceInt(row["command"]);
        if (cmd !== null) {
          row["speed"] = cmd;
          ctx.warn(`Players row ${at}: player "${name}" (GK) legacy "command" column mapped to "speed"`);
        }
      }
      const gkAttrs = readAttrGroup(row, GK_ATTRIBUTE_KEYS, ctx, at, name, "goalkeeper", true);
      const legacyAttrs = gkAttrs ? null : readAttrGroup(row, OUTFIELD_ATTRIBUTE_KEYS, ctx, at, name, "legacy outfield", true);
      if (gkAttrs) {
        attributes = gkAttrs;
      } else if (legacyAttrs) {
        // legacy tolerance: a GK row still using the old outfield columns is migrated
        ctx.warn(`Players row ${at}: player "${name}" (GK) uses legacy outfield attribute columns - converted to the goalkeeper set`);
        attributes = migrateLegacyGkAttributes(legacyAttrs);
        overallRating = computeOverall(attributes, "GK");
      } else {
        ctx.error(`Players row ${at}: player "${name}" (GK) missing goalkeeper attributes (diving, handling, reflexes, positioning, kicking, speed), row skipped`);
        return;
      }
    } else {
      const outfieldAttrs = readAttrGroup(row, OUTFIELD_ATTRIBUTE_KEYS, ctx, at, name, "outfield", false);
      if (outfieldAttrs === null) return;
      attributes = outfieldAttrs;
    }

    players.push({
      id,
      teamId,
      name,
      age,
      position: position as PositionCode,
      overallRating,
      potential,
      marketValue,
      salary,
      attributes,
    });
  });

  if (duplicates.size > 0) {
    ctx.error(`Duplicate player ids: ${formatIds(duplicates)} (later rows skipped)`);
  }
  return players;
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * Parses and validates a .xlsx database workbook. Collects every data issue
 * into `warnings` (auto-fixed, rows kept) or `errors` (rows skipped; import
 * blocked while any error remains). Only unreadable/corrupt files reject.
 */
export async function parseExcelFile(file: File): Promise<ParseOutcome> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const ctx = createCollector();

  const leaguesWs = findSheet(wb, "leagues");
  const teamsWs = findSheet(wb, "teams");
  const playersWs = findSheet(wb, "players");

  if (!leaguesWs) ctx.error('Required sheet "Leagues" not found');
  if (!teamsWs) ctx.error('Required sheet "Teams" not found');
  if (!playersWs) ctx.error('Required sheet "Players" not found');
  if (!leaguesWs || !teamsWs || !playersWs) {
    return { leagues: [], teams: [], players: [], warnings: ctx.warnings, errors: ctx.errors };
  }

  const leagues = parseLeagues(normalizeRows(leaguesWs), ctx);
  const leagueIds = new Set(leagues.map((l) => l.id));
  const teams = parseTeams(normalizeRows(teamsWs), ctx, leagueIds);
  const teamIds = new Set(teams.map((t) => t.id));
  const players = parsePlayers(normalizeRows(playersWs), ctx, teamIds);

  return { leagues, teams, players, warnings: ctx.warnings, errors: ctx.errors };
}
