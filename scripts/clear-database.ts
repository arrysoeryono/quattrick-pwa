/**
 * Clears ALL master data (players, teams, leagues) from the Neon Postgres
 * cloud database. Career saves (users_save_games) are kept unless --saves.
 * Run: bun run scripts/clear-database.ts [--saves]
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { leagues, players, teams, usersSaveGames } from "../src/lib/db/schema";

async function main() {
  const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error("NEON_DATABASE_URL missing");
  const db = drizzle(neon(url));

  console.log("Wiping Neon master data (players, teams, leagues)...");
  const p = await db.delete(players);
  const t = await db.delete(teams);
  const l = await db.delete(leagues);
  console.log(`Deleted: ${p.rowCount ?? 0} players, ${t.rowCount ?? 0} teams, ${l.rowCount ?? 0} leagues.`);

  if (process.argv.includes("--saves")) {
    const s = await db.delete(usersSaveGames);
    console.log(`Deleted: ${s.rowCount ?? 0} cloud saves.`);
  }

  console.log("Cloud database is now empty. Import an Excel database in-game to rebuild it.");
}

main().catch((e) => {
  console.error("Clear failed:", e);
  process.exit(1);
});
