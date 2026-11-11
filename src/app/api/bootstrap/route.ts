import { NextResponse } from "next/server";
import { drizzle } from "drizzle-orm/neon-http";
import { getNeonUrl } from "@/lib/db/client";
import { neon } from "@neondatabase/serverless";
import { asc } from "drizzle-orm";
import { leagues, players, teams } from "@/lib/db/schema";
import type { Dataset } from "@/lib/game/types";
import { EMPTY_DATASET } from "@/lib/game/defaultData";
import { computeOverall, migratePlayerAttributes } from "@/lib/game/attributes";

export const dynamic = "force-dynamic";

/** Serves the master dataset (Neon if reachable, builtin fallback otherwise). */
export async function GET() {
  const url = getNeonUrl();
  if (url) {
    try {
      const db = drizzle(neon(url));
      const [ls, ts, ps] = await Promise.all([
        db.select().from(leagues).orderBy(asc(leagues.id)),
        db.select().from(teams).orderBy(asc(teams.id)),
        db.select().from(players).orderBy(asc(players.id)),
      ]);
      if (ls.length > 0 && ts.length > 0) {
        const dataset: Dataset = {
          leagues: ls.map((l) => ({ id: l.id, name: l.name, country: l.country, tier: l.tier })),
          teams: ts.map((t) => ({
            id: t.id,
            leagueId: t.leagueId ?? 0,
            name: t.name,
            shortName: t.shortName,
            logoUrl: t.logoUrl,
            reputation: t.reputation ?? 50,
            transferBudget: Number(t.transferBudget ?? 10000000),
            wageBudget: Number(t.wageBudget ?? 100000),
          })),
          players: ps.map((p) => {
            // migrate legacy GK rows (outfield attribute set) to the GK shape
            const mig = migratePlayerAttributes(
              p.position as Dataset["players"][number]["position"],
              p.attributes as Dataset["players"][number]["attributes"],
            );
            const attrs = mig.attributes;
            return {
              id: p.id,
              teamId: p.teamId ?? -1,
              name: p.name,
              age: p.age,
              position: p.position as Dataset["players"][number]["position"],
              overallRating: mig.changed
                ? computeOverall(attrs, p.position as Dataset["players"][number]["position"])
                : p.overallRating,
              potential: p.potential,
              marketValue: Number(p.marketValue),
              salary: Number(p.salary),
              attributes: attrs,
            };
          }),
        };
        return NextResponse.json({ dataset, source: "neon" });
      }
    } catch {
      /* fall through to builtin */
    }
  }
  return NextResponse.json({ dataset: EMPTY_DATASET, source: "builtin" });
}
