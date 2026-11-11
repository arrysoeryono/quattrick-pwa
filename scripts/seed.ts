/**
 * Seeds Neon Postgres with the default Quattrick dataset (idempotent).
 * Run: bun run scripts/seed.ts   (or with --force to re-seed)
 */
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { leagues, players, teams } from "../src/lib/db/schema";
import { generateDefaultDataset } from "../src/lib/game/defaultData";

async function main() {
  const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL missing");
  const db = drizzle(neon(url));

  const force = process.argv.includes("--force");
  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(leagues);
  if (existing[0].count > 0 && !force) {
    console.log(`Database already seeded (${existing[0].count} leagues). Use --force to re-seed.`);
    return;
  }

  console.log("Seeding default dataset...");
  const data = generateDefaultDataset();

  if (force) {
    await db.delete(players);
    await db.delete(teams);
    await db.delete(leagues);
  }

  await db.insert(leagues).values(data.leagues);
  await db.insert(teams).values(data.teams);

  const chunkSize = 200;
  for (let i = 0; i < data.players.length; i += chunkSize) {
    const chunk = data.players.slice(i, i + chunkSize);
    await db.insert(players).values(chunk);
  }

  // keep serial sequences in sync with explicit ids
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('leagues','id'), (SELECT GREATEST(MAX(id),1) FROM leagues))`);
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('teams','id'), (SELECT GREATEST(MAX(id),1) FROM teams))`);
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('players','id'), (SELECT GREATEST(MAX(id),1) FROM players))`);

  console.log(`Seeded: ${data.leagues.length} leagues, ${data.teams.length} teams, ${data.players.length} players.`);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
