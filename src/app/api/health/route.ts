import { NextResponse } from "next/server";
import { drizzle } from "drizzle-orm/neon-http";
import { getNeonUrl } from "@/lib/db/client";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = getNeonUrl();
  if (!url) {
    return NextResponse.json({ cloud: false, reason: "DATABASE_URL not configured" });
  }
  try {
    const db = drizzle(neon(url));
    const result = await db.execute<{ leagues: number; teams: number; players: number }>(
      sql`SELECT
        (SELECT count(*)::int FROM leagues) AS leagues,
        (SELECT count(*)::int FROM teams) AS teams,
        (SELECT count(*)::int FROM players) AS players`,
    );
    const row = result.rows[0];
    return NextResponse.json({ cloud: true, leagues: row?.leagues ?? 0, teams: row?.teams ?? 0, players: row?.players ?? 0 });
  } catch (e) {
    return NextResponse.json({ cloud: false, reason: e instanceof Error ? e.message : "unreachable" });
  }
}
