import { NextResponse } from "next/server";
import { drizzle } from "drizzle-orm/neon-http";
import { getNeonUrl } from "@/lib/db/client";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { leagues, players, teams } from "@/lib/db/schema";
import type { Dataset } from "@/lib/game/types";
import { ALL_POSITIONS } from "@/lib/game/types";

export const dynamic = "force-dynamic";

interface ImportBody {
  leagues?: Dataset["leagues"];
  teams?: Dataset["teams"];
  players?: Dataset["players"];
  mode?: "replace" | "merge";
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);

/** Bulk import from the Excel parser. Replace-mode: wipes & reinserts with explicit ids. */
export async function POST(request: Request) {
  const url = getNeonUrl();
  if (!url) return NextResponse.json({ ok: false, error: "DATABASE_URL not configured" }, { status: 503 });

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const inLeagues = body.leagues ?? [];
  const inTeams = body.teams ?? [];
  const inPlayers = body.players ?? [];
  if (inLeagues.length === 0 || inTeams.length === 0 || inPlayers.length === 0) {
    return NextResponse.json({ ok: false, error: "leagues, teams and players must all be non-empty" }, { status: 400 });
  }

  const teamIds = new Set(inTeams.map((t) => t.id));
  const errors: string[] = [];

  const leagueRows = inLeagues
    .filter((l) => isInt(l.id) && typeof l.name === "string" && l.name.length > 0)
    .map((l) => ({ id: l.id, name: String(l.name).slice(0, 100), country: String(l.country ?? "Unknown").slice(0, 50), tier: isInt(l.tier) ? l.tier : 1 }));
  if (leagueRows.length !== inLeagues.length) errors.push(`${inLeagues.length - leagueRows.length} league rows skipped`);

  const teamRows = inTeams
    .filter((t) => isInt(t.id) && typeof t.name === "string" && t.name.length > 0)
    .map((t) => ({
      id: t.id,
      leagueId: isInt(t.leagueId) ? t.leagueId : null,
      name: String(t.name).slice(0, 100),
      shortName: String(t.shortName ?? String(t.name).slice(0, 3)).slice(0, 5).toUpperCase(),
      logoUrl: typeof t.logoUrl === "string" ? t.logoUrl : null,
      reputation: isInt(t.reputation) ? Math.min(100, Math.max(1, t.reputation)) : 50,
      transferBudget: isInt(t.transferBudget) ? t.transferBudget : 10000000,
      wageBudget: isInt(t.wageBudget) ? t.wageBudget : 100000,
    }));
  if (teamRows.length !== inTeams.length) errors.push(`${inTeams.length - teamRows.length} team rows skipped`);

  const playerRows = inPlayers
    .filter((p) => isInt(p.id) && typeof p.name === "string" && p.name.length > 0 && isInt(p.age) && p.age >= 15 && p.age <= 45 && ALL_POSITIONS.includes(p.position))
    .map((p) => ({
      id: p.id,
      teamId: teamIds.has(p.teamId) ? p.teamId : null,
      name: String(p.name).slice(0, 100),
      age: p.age,
      position: p.position,
      overallRating: Math.min(99, Math.max(1, isInt(p.overallRating) ? p.overallRating : 50)),
      potential: Math.min(99, Math.max(1, isInt(p.potential) ? p.potential : p.overallRating ?? 50)),
      marketValue: isInt(p.marketValue) ? p.marketValue : 0,
      salary: isInt(p.salary) ? p.salary : 1000,
      attributes: {
        pace: Math.min(99, Math.max(1, Math.round(p.attributes?.pace ?? 50))),
        shooting: Math.min(99, Math.max(1, Math.round(p.attributes?.shooting ?? 50))),
        passing: Math.min(99, Math.max(1, Math.round(p.attributes?.passing ?? 50))),
        dribbling: Math.min(99, Math.max(1, Math.round(p.attributes?.dribbling ?? 50))),
        defending: Math.min(99, Math.max(1, Math.round(p.attributes?.defending ?? 50))),
        physical: Math.min(99, Math.max(1, Math.round(p.attributes?.physical ?? 50))),
      },
    }));
  if (playerRows.length !== inPlayers.length) errors.push(`${inPlayers.length - playerRows.length} player rows skipped`);

  if (leagueRows.length === 0 || teamRows.length === 0 || playerRows.length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing valid to import", errors }, { status: 400 });
  }

  try {
    const db = drizzle(neon(url));
    // wipe existing master data
    await db.delete(players);
    await db.delete(teams);
    await db.delete(leagues);

    const chunk = 250;
    for (let i = 0; i < leagueRows.length; i += chunk) await db.insert(leagues).values(leagueRows.slice(i, i + chunk));
    for (let i = 0; i < teamRows.length; i += chunk) await db.insert(teams).values(teamRows.slice(i, i + chunk));
    for (let i = 0; i < playerRows.length; i += chunk) await db.insert(players).values(playerRows.slice(i, i + chunk));

    await db.execute(sql`SELECT setval(pg_get_serial_sequence('leagues','id'), (SELECT GREATEST(MAX(id),1) FROM leagues))`);
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('teams','id'), (SELECT GREATEST(MAX(id),1) FROM teams))`);
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('players','id'), (SELECT GREATEST(MAX(id),1) FROM players))`);

    return NextResponse.json({
      ok: true,
      inserted: { leagues: leagueRows.length, teams: teamRows.length, players: playerRows.length },
      errors,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Import failed", errors }, { status: 500 });
  }
}
