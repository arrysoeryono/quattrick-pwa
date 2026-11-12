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
  /** v6.0 — per-line specialist coaches (0-3 each), Office > Staff. */
  lineCoaches?: { gk: number; def: number; mid: number; att: number };
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

/** v5.0 FC IQ — the Player Role + Focus assigned to one lineup slot. */
export interface SlotRole {
  roleId: string;
  focusId: string;
}

export interface SetPieceAssignments {
  captain: number | null;
  penalty: number | null;
  freeKick: number | null;
  cornerLeft: number | null;
  cornerRight: number | null;
}

/** v4.7 — saved tactic snapshot from the tactics menu (max 6 per career). */
export interface TacticPreset {
  id: string;
  name: string;
  formationName: string;
  mentality: Mentality;
  gamePlan: string;
  sliders: TacticSliders;
  lineup: (number | null)[]; // aligned to the preset's formation slots
  roles?: Record<string, SlotRole>; // v5.0 FC IQ role+focus per slot index
}

/** v4.7 — team-level weekly training balance.
 *  0 = All Out Energy (recovery) … 100 = All Out Performance (sharpness). */
export interface TeamTrainingPlan {
  balance: number;
}

export type DrillGrade = "A" | "B" | "C" | "D";

/** v4.7 — pre-match drills outcome. Special PlayStyles apply to the next
 *  match only and are cleared once the fixture has been played. */
export interface PreMatchDrillResult {
  fixtureRound: number;
  grades: { drill: string; grade: DrillGrade }[];
  grants: { playerId: number; styleId: string }[];
}

export interface Tactics {
  formationName: string;
  mentality: Mentality;
  gamePlan: string;                 // preset id from tacticPresets
  sliders: TacticSliders;
  /** keyed by lineup slot index (0-10) */
  instructions: Record<string, PlayerInstruction>;
  /** v5.0 FC IQ — keyed by lineup slot index (0-10) */
  roles: Record<string, SlotRole>;
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

/* ================= v6.0 — FC Career Mode expansion ================= */

export type CareerMode = "manager" | "player";

export type Currency = "USD" | "EUR" | "GBP" | "IDR";

export interface GameSettings {
  currency: Currency;
  /** Real-feel length of each live half (minutes) — scales live sim speed. */
  halfLengthMin: number;
}

/** v6.0 — single row of the club finance ledger. */
export interface LedgerEntry {
  id: string;
  date: string;
  week: number;
  label: string;
  amount: number; // + income, - expense
}

/** v6.0 — a loan, in either direction. */
export interface LoanRecord {
  id: string;
  playerId: number;
  playerName: string;
  position: PositionCode;
  direction: "out" | "in";
  partnerTeamId: number;
  weeksLeft: number;
  season: number;
}

/** v6.0 — a job offer from another club (or post-sacking lifeline). */
export interface JobOffer {
  id: string;
  teamId: number;
  teamName: string;
  transferBudget: number;
  wageBudget: number;
  objectiveTarget: number;
  rep: number;
}

/** v6.0 — one press-conference question with answer options. */
export interface PressOption {
  id: string;
  label: string;
  morale: number; // squad-wide morale delta
  board: number; // board confidence delta
  tone: "confident" | "humble" | "neutral" | "defiant";
}

export interface PressQuestion {
  id: string;
  question: string;
  options: PressOption[];
}

export interface PressSession {
  id: string;
  week: number;
  fixtureId: number;
  title: string;
  questions: PressQuestion[];
  answered: string[]; // question ids already answered
}

/** v6.0 — aggregated league-wide player statistics board. */
export interface LeaguePlayerStat {
  goals: number;
  assists: number;
  cleanSheets: number;
  yellow: number;
  red: number;
}

/** v6.0 — Team of the Week entry. */
export interface TotwEntry {
  playerId: number;
  playerName: string;
  teamId: number;
  position: string;
  rating: number;
  goals: number;
  assists: number;
  motm: boolean;
}

/** v6.0 — Global Transfer Network assignment. */
export interface GtnAssignment {
  id: string;
  positionGroup: "GK" | "DEF" | "MID" | "ATT";
  maxAge: number;
  weeksLeft: number;
}

/** v6.0 — youth scout staff member. */
export interface YouthScout {
  id: string;
  name: string;
  quality: 1 | 2 | 3; // Local / National / Elite
  weeklyWage: number;
}

/** v6.0 — Pro (Player Career) objectives. */
export interface ProObjective {
  id: string;
  label: string;
  kind: "goals" | "assists" | "apps" | "avgRating" | "cleanSheets";
  target: number;
  current: number;
  reward: number; // skill points
  done: boolean;
}

/** v6.0 — Player Career personal state. */
export interface ProState {
  playerId: number;
  wallet: number;
  skillPoints: number;
  personality: { maverick: number; virtuoso: number; heartbeat: number };
  managerTrust: number; // 0-100
  objectives: ProObjective[];
  agentTargetClubId: number | null;
  items: string[]; // purchased lifestyle item ids
  pendingDecision: ProDecision | null;
  lastMatchRating: number | null;
}

/** v6.0 — out-of-pitch random event for the Pro. */
export interface ProDecision {
  id: string;
  title: string;
  body: string;
  options: { id: string; label: string; maverick: number; virtuoso: number; heartbeat: number; wallet: number }[];
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

  /* ---- v4.7 training & presets ---- */
  tacticPresets: TacticPreset[]; // max 6
  teamTraining: TeamTrainingPlan;
  preMatchDrills: PreMatchDrillResult | null;

  /* ---- v6.0 FC Career Mode ---- */
  careerMode?: CareerMode; // default "manager" (legacy saves)
  shortlist: number[]; // market player ids pinned by the manager
  transferListedIds: number[]; // squad players on the transfer list
  loanListedIds: number[]; // squad players available for loan out
  loans: LoanRecord[]; // active loans (in + out)
  offers: JobOffer[]; // pending job offers from other clubs
  ledger: LedgerEntry[]; // recent finance movements (newest first)
  leagueBoard: Record<string, LeaguePlayerStat>; // league-wide stats, keyed by player id
  totw: { week: number; entries: TotwEntry[] } | null; // latest Team of the Week
  press: PressSession | null; // active press conference awaiting answers
  pressDoneWeeks: number[]; // weeks already covered by a press conference
  gtn: GtnAssignment[]; // active scouting network assignments (max 3)
  gtnReport: { playerId: number; week: number }[]; // latest GTN findings (max 12)
  youthScouts: YouthScout[]; // hired youth academy staff (max 3)
  lastYouthTourWeek: number; // youth tournament weekly cooldown
  settings: GameSettings;
  /* ---- v6.0 Player Career (Be a Pro) ---- */
  proId?: number | null;
  pro?: ProState | null;
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

/** v4.9 — EA FC-derived profile sent into the match engine (see lib/game/fc.ts). */
export interface MatchPlayerFc {
  /** derived in-game stats (FC specifics); absent for keepers */
  stats?: Record<string, number> | null;
  weakFoot?: number; // 1-5
  skillMoves?: number; // 1-5
  acceleRATE?: string; // Explosive / Controlled / Lengthy
}

/** One player row inside a MatchTeamConfig (starter or bench). */
export interface MatchPlayerConfig {
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
  role?: SlotRole; // v5.0 FC IQ role + focus for the engine
  playStyles?: string[]; // playstyle ids active in the engine
  fc?: MatchPlayerFc; // v4.9 derived FC profile
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
  players: MatchPlayerConfig[];
  /** v4.8 — substitutes available for half-time swaps (max 9). */
  bench?: MatchPlayerConfig[];
}

/** v4.8 — one player's live status at the half-time break. */
export interface HalftimePlayer {
  id: number;
  name: string;
  slot: string;
  position: string;
  ovr: number;
  staminaNow: number;
  rating: number;
  goals: number;
  assists: number;
  yellow: number;
  sentOff: boolean;
  subbedOut: boolean;
  role?: SlotRole | null; // v5.0 FC IQ role for the half-time pitch
}

/** v4.8 — payload posted by the match worker when it pauses at the break. */
export interface HalftimePayload {
  minute: number;
  homeGoals: number;
  awayGoals: number;
  homeName: string;
  awayName: string;
  stats: MatchStats;
  events: MatchEventLog[];
  momentum: number;
  shoutsLeft: number;
  userSide: "home" | "away";
  players: HalftimePlayer[]; // user's XI at the break, aligned to formation slots
  benchIds: number[]; // substitute ids still available in the engine
}
