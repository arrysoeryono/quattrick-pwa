/* Push the 8-team test dataset straight into the cloud DB import API. */
import * as XLSX from "xlsx";
import type { LeagueRow, PlayerRow, TeamRow } from "../src/lib/game/types";

const wb = XLSX.readFile("/tmp/quattrick-test-db.xlsx");
const leagues = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Leagues"]);
const teams = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Teams"]);
const players = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Players"]);

const leagueRows: LeagueRow[] = leagues.map((r) => ({
  id: Number(r.id), name: String(r.name), country: String(r.country), tier: Number(r.tier),
}));
const teamRows: TeamRow[] = teams.map((r) => ({
  id: Number(r.id),
  leagueId: Number(r.league_id),
  name: String(r.name),
  shortName: String(r.short_name),
  reputation: Number(r.reputation),
  transferBudget: Number(r.transfer_budget),
  wageBudget: Number(r.wage_budget),
}));
const playerRows: PlayerRow[] = players.map((r) => {
  const position = String(r.position);
  const attrs =
    position === "GK"
      ? {
          diving: Number(r.diving), handling: Number(r.handling), reflexes: Number(r.reflexes),
          positioning: Number(r.positioning), kicking: Number(r.kicking), speed: Number(r.speed),
        }
      : {
          pace: Number(r.pace), shooting: Number(r.shooting), passing: Number(r.passing),
          dribbling: Number(r.dribbling), defending: Number(r.defending), physical: Number(r.physical),
        };
  return {
    id: Number(r.id), teamId: Number(r.team_id), name: String(r.name), age: Number(r.age),
    position: position as PlayerRow["position"], overallRating: Number(r.overall_rating),
    potential: Number(r.potential), marketValue: Number(r.market_value), salary: Number(r.salary),
    attributes: attrs,
  };
});

const res = await fetch("http://localhost:3000/api/database/import", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ leagues: leagueRows, teams: teamRows, players: playerRows, mode: "replace" }),
});
console.log(res.status, await res.text());
