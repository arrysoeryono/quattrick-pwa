import { drizzle } from "drizzle-orm/neon-http";
import { getNeonUrl } from "@/lib/db/client";
import { neon } from "@neondatabase/serverless";
import { asc } from "drizzle-orm";
import * as XLSX from "xlsx";
import { leagues, players, teams } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Exports the Neon master database as an .xlsx spreadsheet (modding-friendly). */
export async function GET() {
  const url = getNeonUrl();
  if (!url) return new Response("DATABASE_URL not configured", { status: 503 });

  try {
    const db = drizzle(neon(url));
    const [ls, ts, ps] = await Promise.all([
      db.select().from(leagues).orderBy(asc(leagues.id)),
      db.select().from(teams).orderBy(asc(teams.id)),
      db.select().from(players).orderBy(asc(players.id)),
    ]);

    const wb = XLSX.utils.book_new();

    const instr = [
      "QUATTRICK FOOTBALL MANAGER - DATABASE EXPORT",
      "",
      "This workbook is a live export of the cloud database.",
      "Edit freely and re-import via the in-game Database Manager.",
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instr.map((t) => [t]));

    const wsLeagues = XLSX.utils.json_to_sheet(
      ls.map((l) => ({ id: l.id, name: l.name, country: l.country, tier: l.tier })),
      { header: ["id", "name", "country", "tier"] },
    );

    const wsTeams = XLSX.utils.json_to_sheet(
      ts.map((t) => ({
        id: t.id,
        league_id: t.leagueId,
        name: t.name,
        short_name: t.shortName,
        reputation: t.reputation ?? 50,
        transfer_budget: Number(t.transferBudget ?? 10000000),
        wage_budget: Number(t.wageBudget ?? 100000),
      })),
      { header: ["id", "league_id", "name", "short_name", "reputation", "transfer_budget", "wage_budget"] },
    );

    const wsPlayers = XLSX.utils.json_to_sheet(
      ps.map((p) => {
        const a = (p.attributes ?? {}) as Record<string, number>;
        const base = {
          id: p.id,
          team_id: p.teamId,
          name: p.name,
          age: p.age,
          position: p.position,
          overall_rating: p.overallRating,
          potential: p.potential,
          market_value: Number(p.marketValue),
          salary: Number(p.salary),
        };
        if (p.position === "GK") {
          // keepers export the dedicated GK attribute columns
          return {
            ...base,
            pace: null, shooting: null, passing: null, dribbling: null, defending: null, physical: null,
            diving: a.diving ?? 50,
            handling: a.handling ?? 50,
            reflexes: a.reflexes ?? 50,
            positioning: a.positioning ?? 50,
            kicking: a.kicking ?? 50,
            command: a.command ?? 50,
          };
        }
        return {
          ...base,
          pace: a.pace ?? 50,
          shooting: a.shooting ?? 50,
          passing: a.passing ?? 50,
          dribbling: a.dribbling ?? 50,
          defending: a.defending ?? 50,
          physical: a.physical ?? 50,
          diving: null, handling: null, reflexes: null, positioning: null, kicking: null, command: null,
        };
      }),
      {
        header: [
          "id", "team_id", "name", "age", "position", "overall_rating", "potential",
          "market_value", "salary",
          "pace", "shooting", "passing", "dribbling", "defending", "physical",
          "diving", "handling", "reflexes", "positioning", "kicking", "command",
        ],
      },
    );

    XLSX.utils.book_append_sheet(wb, wsInstr, "Instructions");
    XLSX.utils.book_append_sheet(wb, wsLeagues, "Leagues");
    XLSX.utils.book_append_sheet(wb, wsTeams, "Teams");
    XLSX.utils.book_append_sheet(wb, wsPlayers, "Players");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `Quattrick_Database_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Export failed", { status: 500 });
  }
}
