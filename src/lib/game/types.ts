/**
 * Quattrick Football Manager — core game type contracts.
 * Everything (Dexie save state, Neon JSONB, Excel parser, match worker)
 * speaks these plain-JSON shapes so saves stay serializable & portable.
 */

/** Outfield players (every position except GK). */
export interface PlayerAttributes {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

/** Goalkeepers carry their own attribute set — see lib/game/attributes.ts. */
export interface GKAttributes {
  diving: number;
  handling: number;
  reflexes: number;
  positioning: number;
  kicking: number;
  speed: number;
}

/** Either attribute shape, depending on the player's position. */
export type PositionalAttributes = PlayerAttributes | GKAttributes;

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
  attributes: PositionalAttributes;
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

export type TrainingFocus =
  | "balanced" | "attacking" | "defensive" | "technical" | "pace" | "shooting"
  // keeper-native focuses (GK players only)
  | "shot-stopping" | "handling" | "positioning" | "distribution" | "agility";
export type TrainingIntensity = "light" | "normal" | "intense";

export interface TrainingPlan {
  focus: TrainingFocus;
  intensity: TrainingIntensity;
}

/** Position retraining in progress (FIFA-style conversion, 4-52 weeks). */
export interface RetrainState {
  target: PositionCode;
  weeksLeft: number;
  totalWeeks: number;
}

export interface StaffState {
  coachLevel: "Novice" | "Accomplished" | "Expert";
}

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
  trainingPlan: TrainingPlan;
  retrain: RetrainState | null;
  seasonStats: SeasonStats;
  careerStats: { apps: number; goals: number; assists: number };
  devPath: string | null; // v4.3 evolution archetype id
  mentor: Mentorship | null; // v4.3 being mentored
}

export interface Fixture {
  id: number;
  round: number; // 1-based; cup rounds use 100 (QF), 101 (SF), 102 (Final)
  date: string; // ISO yyyy-mm-dd
  homeId: number;
  awayId: number;
  played: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  competition?: "league" | "cup"; // absent = league (legacy saves)
  tieLabel?: string; // e.g. "Quarter-final", "Semi-final", "Final"
}

export type NewsType = "match" | "transfer" | "injury" | "finance" | "season" | "award" | "social" | "board" | "cup";

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

/** Single shot record for the post-match xG timeline / shot map. */
export interface ShotLogEntry {
  minute: number;
  side: "home" | "away";
  xg: number;
  scored: boolean;
  shooter?: string;
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
  shotLog?: ShotLogEntry[]; // optional for legacy workers
  momentum?: number; // final momentum -100 (away) .. 100 (home)
}

export type Mentality = "defensive" | "balanced" | "attacking";

export type Difficulty = "amateur" | "pro" | "legend";

export const DIFFICULTY_META: Record<Difficulty, { label: string; desc: string; aiBoost: number; prizeMult: number }> = {
  amateur: { label: "Amateur", desc: "Weaker rivals, richer prize money.", aiBoost: -3, prizeMult: 1.2 },
  pro: { label: "Pro", desc: "Balanced difficulty.", aiBoost: 0, prizeMult: 1 },
  legend: { label: "Legend", desc: "Stronger rivals, tighter budgets.", aiBoost: 3, prizeMult: 0.9 },
};

/** FIFA-style tactical sliders (1-100). Applied inside the match engine. */
export interface TacticSliders {
  buildUpSpeed: number;       // short patient build-up <-> fast direct outlets
  chanceCreation: number;     // patient passing <-> risky dribbling/through balls
  attackingWidth: number;     // narrow central overloads <-> wide flank focus
  defensiveWidth: number;     // compact central block <-> spread to the flanks
  pressingIntensity: number;  // drop off <-> full gegenpress
  defensiveLine: number;      // deep block <-> high line
  tempo: number;              // slow control <-> fast tempo
  aggression: number;         // cautious tackling <-> all-in sliding challenges
}

export interface PlayerInstruction {
  att?: string; // attacking-phase instruction id
  def?: string; // defensive-phase instruction id
}

export interface SetPieceAssignments {
  captain: number | null;
  penalty: number | null;
  freeKick: number | null;
  cornerLeft: number | null;
  cornerRight: number | null;
}

export interface Tactics {
  formationName: string;
  mentality: Mentality;
  gamePlan: string;                 // preset id from tacticPresets
  sliders: TacticSliders;
  /** keyed by lineup slot index (0-10) */
  instructions: Record<string, PlayerInstruction>;
  setPieces: SetPieceAssignments;
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

/** v4.1 — AI-vs-AI transfer to keep the world alive. */
export interface AITransferRecord {
  id: string;
  season: number;
  week: number;
  playerId: number;
  playerName: string;
  fromTeamId: number;
  toTeamId: number;
  fee: number;
  deadlineDay: boolean;
}

/** v4.1 — interactive player conversation (playtime, contract, transfer bid). */
export interface InboxOption {
  id: string;
  label: string;
}

export interface InboxMessage {
  id: string;
  date: string;
  kind: "playtime" | "contract" | "bid" | "unhappy";
  playerId: number | null;
  playerName: string;
  title: string;
  body: string;
  options: InboxOption[];
  resolvedOptionId?: string;
  outcome?: string;
  /** pending transfer bid amount (kind === "bid") */
  bidAmount?: number;
  bidTeamId?: number;
}

/** v4.1 — Quattrick Social (parody fan/press feed). */
export interface SocialPost {
  id: string;
  date: string;
  handle: string;
  tag: string;
  text: string;
  tone: "hype" | "mock" | "news" | "neutral";
  likes: number;
}

/** v4.3 — youth evolution path (FIFA-style archetype). */
export interface Mentorship {
  mentorId: number;
  weeksLeft: number;
  totalWeeks: number;
}

export interface SeasonObjective {
  targetPosition: number;
  cupTarget: "win" | "final" | "none";
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
  staff: StaffState;
  lineup: (number | null)[]; // aligned to formation.positions
  fixtures: Fixture[]; // user's league fixtures (all clubs)
  news: NewsItem[];
  seasonObjective: SeasonObjective;
  history: SeasonHistoryEntry[];
  lastRoundResults: { homeId: number; awayId: number; homeGoals: number; awayGoals: number }[];

  /* ---- v4.x career expansion ---- */
  difficulty: Difficulty;
  boardConfidence: number; // 0-100
  managerRep: number; // 0-100 career reputation
  inbox: InboxMessage[]; // pending player conversations
  social: SocialPost[]; // fan/press buzz feed
  aiTransfers: AITransferRecord[];
  scoutedIds: number[]; // market players with revealed attributes
  scoutingQueue: { playerId: number; weeksLeft: number }[];
  facilityLevel: number; // 1-5 youth academy
  achievements: { id: string; date: string }[];
  soundEnabled: boolean;
  sacked: boolean;
  winStreak: number;
  unbeatenRun: number;
  cleanSheetRun: number;
  seasonShots: number; // simple career counters for achievements
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
  momentum?: number; // -100 (away storms) .. 100 (home storms)
  shoutsLeft?: number;
}

export interface MatchTeamConfig {
  id: number;
  name: string;
  shortName: string;
  formation: string;
  mentality: Mentality;
  sliders?: TacticSliders;
  setPieces?: Partial<SetPieceAssignments>;
  isDerby?: boolean; // v4.4 rivalry intensity
  /** 11 starters aligned to formation slots */
  players: {
    id: number;
    name: string;
    position: PositionCode;
    ovr: number;
    attributes: PositionalAttributes;
    stamina: number;
    sharpness: number;
    morale: number;
    age: number;
    instr?: PlayerInstruction;
    playStyles?: string[]; // playstyle ids active in the engine
  }[];
}
