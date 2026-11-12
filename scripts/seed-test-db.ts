/* Seed a test database xlsx (8 teams x 10 players) for browser verification. */
import * as XLSX from "xlsx";

const LEAGUE_HEADERS = ["id", "name", "country", "tier"];
const TEAM_HEADERS = ["id", "league_id", "name", "short_name", "reputation", "transfer_budget", "wage_budget"];
const PLAYER_HEADERS = [
  "id", "team_id", "name", "age", "position", "overall_rating", "potential",
  "market_value", "salary",
  "pace", "shooting", "passing", "dribbling", "defending", "physical",
  "diving", "handling", "reflexes", "positioning", "kicking", "speed",
];

const FIRST = ["Andi", "Budi", "Candra", "Dimas", "Eko", "Fajar", "Gilang", "Hendra", "Irfan", "Joko", "Krisna", "Luki", "Made", "Nanda", "Oscar", "Putra", "Rizky", "Satria", "Teguh", "Umar"];
const LAST = ["Pratama", "Santoso", "Wijaya", "Anggara", "Saputra", "Ramadhan", "Permana", "Gunawan", "Maulana", "Susilo", "Hidayat", "Nugraha", "Silaban", "Kusuma", "Halim", "Siregar", "Firmansyah", "Wibowo", "Lestari", "Hartono"];
const POSITIONS = ["GK", "CB", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "ST"];

const teams = [
  [1, "Garuda United", "GRD", 72],
  [2, "Rajawali FC", "RJW", 68],
  [3, "Harimau Muda", "HRM", 70],
  [4, "Badak Priangan", "BDK", 64],
  [5, "Elang Selatan", "ELG", 66],
  [6, "Naga Utara", "NGU", 62],
  [7, "Phoenix Timur", "PHX", 60],
  [8, "Komodo Raya", "KMD", 58],
];

const players: (string | number | null)[][] = [];
let pid = 1;
for (const [tid, tname, , rep] of teams) {
  POSITIONS.forEach((pos, i) => {
    const idx = pid % 20;
    const name = `${FIRST[idx]} ${LAST[(pid * 7 + i) % 20]}`;
    const ovr = Math.min(78, Math.max(55, Math.round(rep - 8 + i * 2.5)));
    const pot = Math.min(92, ovr + 4 + (pid % 5));
    const base = [pid++, tid, name, 18 + (pid % 15), pos, ovr, pot, ovr * 90000, ovr * 900];
    if (pos === "GK") {
      players.push([...base, null, null, null, null, null, null, ovr, ovr - 3, ovr + 2, ovr - 1, ovr - 9, ovr - 4]);
    } else {
      const pace = pos === "LW" ? ovr + 6 : ovr;
      const def = ["CB", "LB", "RB", "CDM"].includes(pos) ? ovr + 3 : ovr - 12;
      const sho = ["ST", "CAM", "LW"].includes(pos) ? ovr + 3 : ovr - 15;
      players.push([...base, pace, sho, ovr - 4, ovr - 2, def, ovr - 6, null, null, null, null, null, null]);
    }
  });
}

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([LEAGUE_HEADERS, [1, "Liga Nusantara", "Indonesia", 1]]), "Leagues");
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([TEAM_HEADERS, ...teams.map(([id, name, short, rep]) => [id, 1, name, short, rep, rep * 200000, rep * 12000])]),
  "Teams",
);
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([PLAYER_HEADERS, ...players]), "Players");
XLSX.writeFile(wb, "/tmp/quattrick-test-db.xlsx");
console.log(`written /tmp/quattrick-test-db.xlsx (${players.length} players, ${teams.length} teams)`);
