import { NextResponse } from "next/server";
import { drizzle } from "drizzle-orm/neon-http";
import { getNeonUrl } from "@/lib/db/client";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { leagues, players, teams, usersSaveGames } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** DELETE /api/database/reset — full cloud wipe for the Danger Zone.
 *  Empties the Neon master database (players, teams, leagues) AND every
 *  cloud career save, then resets the id sequences. After this the app
 *  falls back to the builtin dataset and the user can import a fresh
 *  Excel database via /api/database/import. */
export async function DELETE() {
  const url = getNeonUrl();
  if (!url) return NextResponse.json({ ok: false, error: "DATABASE_URL not configured" }, { status: 503 });

  try {
    const db = drizzle(neon(url));
    // order matters: players reference teams, teams reference leagues
    const wipedPlayers = await db.delete(players);
    const wipedTeams = await db.delete(teams);
    const wipedLeagues = await db.delete(leagues);
    const wipedSaves = await db.delete(usersSaveGames);

    // reset serial sequences so a fresh import starts from clean ids
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('players','id'), 1, false)`);
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('teams','id'), 1, false)`);
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('leagues','id'), 1, false)`);

    return NextResponse.json({
      ok: true,
      wiped: {
        players: wipedPlayers.rowCount ?? null,
        teams: wipedTeams.rowCount ?? null,
        leagues: wipedLeagues.rowCount ?? null,
        saves: wipedSaves.rowCount ?? null,
      },
    });
  } catch (e) {
    const cause = e instanceof Error && e.cause instanceof Error ? ` | cause: ${e.cause.message}` : "";
    return NextResponse.json({ ok: false, error: e instanceof Error ? `${e.message}${cause}` : "Reset failed" }, { status: 500 });
  }
}
