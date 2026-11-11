/**
 * Quattrick Football Manager — core game type contracts.
 * Everything (Dexie save state, Neon JSONB, Excel parser, match worker)
 * speaks these plain-JSON shapes so saves stay serializable & portable.
 */

export interface PlayerAttributes {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

export type PositionCode =
  | "GK" | "CB" | "LB" | "RB" | "LWB" | "RWB"
  | "CDM" | "CM" | "CAM" | "LM" | "RM" | "LAM" | "RAM"
  | "LW" | "RW" | "LF" | "RF" | "CF" | "ST";

export const ALL_POSITIONS: PositionCode[] = [
  "GK", "CB", "LB", "LWB", "RB", "RWB", "CDM", "CM", "CAM",
  "LM", "RM", "LAM", "RAM", "LW", "RW", "LF", "RF", "CF", "ST",
];

/** Row shape shared by Excel sheets, Neon tables and Dexie datasets. */
export interface PlayerRow {
  id: number;
  teamId: number;
  name: string;
  age: number;
  position: PositionCode;
  overallRating: number;
  potential: number;
  marketValue: number;
  salary: number; // weekly wage
  attributes: PlayerAttributes;
}

export interface LeagueRow {
  id: number;
  name: string;
  country: string;
  tier: number;
}

export interface TeamRow {
  id: number;
  leagueId: number;
  name: string;
  shortName: string;
  logoUrl: string | null;
  reputation: number;
  transferBudget: number;
  wageBudget: number; // weekly
}

export interface Dataset {
  leagues: LeagueRow[];
  teams: TeamRow[];
  players: PlayerRow[];
}

export type SquadRole = "Star Player" | "Important" | "Rotation" | "Prospect";

export interface SeasonStats {
  apps: number;
  goals: number;
  assists: number;
  ratingSum: number;
  cleanSheets: number;
}

export interface PlayerState extends PlayerRow {
  sharpness: number; // 0-100 match fitness
  morale: number; // 0-100
  stamina: number; // 0-100 fresh condition, drains in matches, recovers weekly
  form: number; // rolling avg rating 0-10 (0 = no matches yet)
  injuryWeeks: number; // 0 = fit
  contractYears: number;
  squadRole: SquadRole;
  seasonStats: SeasonStats;
  careerStats: { apps: number; goals: number; assists: number };
}

export interface Fixture {
  id: number;
  round: number; // 1-based
  date: string; // ISO yyyy-mm-dd
  homeId: number;
  awayId: number;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
}

export type NewsType = "match" | "transfer" | "injury" | "finance" | "season" | "award";

export interface NewsItem {
  id: string;
  date: string;
  type: NewsType;
  title: string;
  body: string;
}

export type MatchEventType = "goal" | "miss" | "save" | "card" | "info" | "injury" | "ht" | "ft" | "ko";

export interface MatchEventLog {
  minute: number;
  type: MatchEventType;
  teamSide: "home" | "away" | "neutral";
  text: string;
}

export interface MatchRatingEntry {
  playerId: number;
  rating: number;
  goals: number;
  assists: number;
}

export interface MatchStats {
  possession: [number, number]; // %
  shots: [number, number];
  onTarget: [number, number];
  xg: [number, number];
}

export interface MatchResult {
  fixtureId: number;
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
  events: MatchEventLog[];
  ratings: MatchRatingEntry[];
  stats: MatchStats;
  injuries: number[]; // playerIds (user squad only) that got injured
  motmPlayerId: number | null;
}

export type Mentality = "defensive" | "balanced" | "attacking";

export interface Tactics {
  formationName: string;
  mentality: Mentality;
}

export interface SeasonHistoryEntry {
  season: number;
  position: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  trophies: string[];
}

/** Full serialized save — stored in Dexie + Neon JSONB. */
export interface GameState {
  version: number;
  managerName: string;
  clubId: number;
  leagueId: number;
  season: number; // e.g. 2025
  currentDate: string; // ISO date
  transferBudget: number;
  wageBudget: number; // weekly
  players: PlayerState[]; // manager's squad snapshot (runtime state)
  tactics: Tactics;
  lineup: (number | null)[]; // aligned to formation.positions
  fixtures: Fixture[]; // user's league fixtures (all clubs)
  news: NewsItem[];
  seasonObjective: { targetPosition: number };
  history: SeasonHistoryEntry[];
  lastRoundResults: { homeId: number; awayId: number; homeGoals: number; awayGoals: number }[];
}

export interface SaveRecord {
  id: string;
  name: string;
  clubName: string;
  season: number;
  currentDate: string;
  updatedAt: number;
  state: GameState;
}

export interface TableRow {
  teamId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

/** Live match state pushed from the worker into the UI. */
export interface LiveMatchSnapshot {
  minute: number;
  half: 1 | 2 | "FT";
  homeGoals: number;
  awayGoals: number;
  events: MatchEventLog[];
  stats: MatchStats;
}

export interface MatchTeamConfig {
  id: number;
  name: string;
  shortName: string;
  formation: string;
  mentality: Mentality;
  /** 11 starters aligned to formation slots */
  players: {
    id: number;
    name: string;
    position: PositionCode;
    ovr: number;
    attributes: PlayerAttributes;
    stamina: number;
    sharpness: number;
    morale: number;
    age: number;
  }[];
}
