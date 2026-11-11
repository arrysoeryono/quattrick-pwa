import { NextResponse } from "next/server";
import { drizzle } from "drizzle-orm/neon-http";
import { getNeonUrl } from "@/lib/db/client";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, sql } from "drizzle-orm";
import { usersSaveGames } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** GET /api/saves?userId=...            → list cloud saves (meta + clubId crest hint)
 *  GET /api/saves?userId=...&id=...     → single save (full JSON) */
export async function GET(request: Request) {
  const url = getNeonUrl();
  if (!url) return NextResponse.json({ saves: [], error: "DATABASE_URL not configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const id = searchParams.get("id");
  if (!userId) return NextResponse.json({ saves: [], error: "userId required" }, { status: 400 });

  try {
    const db = drizzle(neon(url));
    if (id) {
      const rows = await db
        .select()
        .from(usersSaveGames)
        .where(and(eq(usersSaveGames.userId, userId), eq(usersSaveGames.id, id)))
        .limit(1);
      if (rows.length === 0) return NextResponse.json({ save: null }, { status: 404 });
      const r = rows[0];
      return NextResponse.json({
        save: {
          id: r.id,
          saveName: r.saveName,
          currentDate: r.currentDate,
          gameDataJson: r.gameDataJson,
          updatedAt: r.updatedAt,
        },
      });
    }
    const rows = await db
      .select({
        id: usersSaveGames.id,
        saveName: usersSaveGames.saveName,
        currentDate: usersSaveGames.currentDate,
        updatedAt: usersSaveGames.updatedAt,
        clubId: sql<number>`coalesce(jsonb_extract_path_text(${usersSaveGames.gameDataJson}, 'clubId'), '-1')::int`,
      })
      .from(usersSaveGames)
      .where(eq(usersSaveGames.userId, userId))
      .orderBy(desc(usersSaveGames.updatedAt));
    return NextResponse.json({ saves: rows });
  } catch (e) {
    const cause = e instanceof Error && e.cause instanceof Error ? ` | cause: ${e.cause.message}` : "";
    return NextResponse.json({ saves: [], error: e instanceof Error ? `${e.message}${cause}` : "Failed" }, { status: 500 });
  }
}

/** POST /api/saves — upsert a cloud save { userId, saveName, currentDate, gameDataJson }.
 *  Cloud identity = (userId, saveName): every device pushing the same career
 *  name converges onto the same cloud row (last writer wins). */
export async function POST(request: Request) {
  const url = getNeonUrl();
  if (!url) return NextResponse.json({ ok: false, error: "DATABASE_URL not configured" }, { status: 503 });

  try {
    const body = (await request.json()) as {
      userId?: string;
      saveName?: string;
      currentDate?: string;
      gameDataJson?: unknown;
    };
    if (!body.userId || !body.saveName || !body.gameDataJson) {
      return NextResponse.json({ ok: false, error: "userId, saveName and gameDataJson are required" }, { status: 400 });
    }
    const db = drizzle(neon(url));
    // upsert by (userId, saveName)
    const existing = await db
      .select({ id: usersSaveGames.id })
      .from(usersSaveGames)
      .where(and(eq(usersSaveGames.userId, body.userId), eq(usersSaveGames.saveName, body.saveName)))
      .limit(1);

    const payload = {
      userId: body.userId,
      saveName: body.saveName.slice(0, 100),
      currentDate: new Date(body.currentDate ?? new Date().toISOString()),
      gameDataJson: body.gameDataJson as object,
      updatedAt: new Date(),
    };
    if (existing.length > 0) {
      await db.update(usersSaveGames).set(payload).where(eq(usersSaveGames.id, existing[0].id));
      return NextResponse.json({ ok: true, id: existing[0].id, updated: true });
    }
    const inserted = await db.insert(usersSaveGames).values(payload).returning({ id: usersSaveGames.id });
    return NextResponse.json({ ok: true, id: inserted[0]?.id, updated: false });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}

/** DELETE /api/saves?userId=...&all=1     → wipe every cloud save for the user
 *  DELETE /api/saves?id=...&userId=...    → single save */
export async function DELETE(request: Request) {
  const url = getNeonUrl();
  if (!url) return NextResponse.json({ ok: false, error: "DATABASE_URL not configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const userId = searchParams.get("userId");
  const all = searchParams.get("all") === "1";
  if (!userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  if (!all && !id) return NextResponse.json({ ok: false, error: "id required (or all=1)" }, { status: 400 });

  try {
    const db = drizzle(neon(url));
    if (all) {
      await db.delete(usersSaveGames).where(eq(usersSaveGames.userId, userId));
      return NextResponse.json({ ok: true, all: true });
    }
    await db.delete(usersSaveGames).where(and(eq(usersSaveGames.id, id!), eq(usersSaveGames.userId, userId)));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}
