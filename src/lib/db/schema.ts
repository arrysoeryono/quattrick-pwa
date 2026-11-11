import {
  bigint,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Quattrick Football Manager — Neon Postgres schema (Drizzle ORM)
 * Mirrors the Excel template structure so imported spreadsheets map 1:1.
 */

export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  country: varchar("country", { length: 50 }).notNull(),
  tier: integer("tier").notNull().default(1),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").references(() => leagues.id),
  name: varchar("name", { length: 100 }).notNull(),
  shortName: varchar("short_name", { length: 5 }).notNull(),
  logoUrl: text("logo_url"),
  reputation: integer("reputation").default(50),
  transferBudget: bigint("transfer_budget", { mode: "number" }).default(10000000),
  wageBudget: bigint("wage_budget", { mode: "number" }).default(100000),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").references(() => teams.id, { onDelete: "set null" }),
  name: varchar("name", { length: 100 }).notNull(),
  age: integer("age").notNull(),
  position: varchar("position", { length: 10 }).notNull(),
  overallRating: integer("overall_rating").notNull(),
  potential: integer("potential").notNull(),
  marketValue: bigint("market_value", { mode: "number" }).notNull(),
  salary: bigint("salary", { mode: "number" }).notNull(),
  /** { pace, shooting, passing, dribbling, defending, physical } */
  attributes: jsonb("attributes").notNull(),
});

export const usersSaveGames = pgTable("users_save_games", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  saveName: varchar("save_name", { length: 100 }).notNull(),
  currentDate: timestamp("current_date").notNull(),
  gameDataJson: jsonb("game_data_json").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type LeagueRecord = typeof leagues.$inferSelect;
export type TeamRecord = typeof teams.$inferSelect;
export type PlayerRecord = typeof players.$inferSelect;
export type SaveGameRecord = typeof usersSaveGames.$inferSelect;
