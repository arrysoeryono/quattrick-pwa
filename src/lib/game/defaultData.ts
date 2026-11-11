import type { Dataset, GKAttributes, PlayerAttributes, PlayerRow, PositionCode, PositionalAttributes, TeamRow } from "./types";
import { computeOverall } from "./attributes";

/** Deterministic RNG so client fallback & server seed generate identical datasets. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Marcus", "Leo", "Kai", "Dante", "Ravi", "Tomas", "Jude", "Nico", "Ellis", "Bruno",
  "Diego", "Mateo", "Arjen", "Sergio", "Emre", "Yusuf", "Jonas", "Felix", "Owen", "Rafael",
  "Ivan", "Andre", "Luca", "Milo", "Ezra", "Cato", "Remus", "Silas", "Theo", "Hugo",
  "Axel", "Jamie", "Rico", "Sami", "Enzo", "Dario", "Kenji", "Abel", "Ilias", "Noah",
];

const LAST_NAMES = [
  "Vance", "Moretti", "Keane", "Duarte", "Silva", "Kovac", "Lindqvist", "Marchetti", "Okafor", "Reyes",
  "Haldane", "Costa", "Novak", "Ferreira", "Demir", "Yilmaz", "Bergman", "Wagner", "Carrow", "Almeida",
  "Petrov", "Laurent", "Ricci", "Visser", "Ashford", "Voss", "Marino", "Diallo", "Beck", "Toure",
  "Sandoval", "Quinn", "Barros", "Haddad", "Falk", "Rossetti", "Iwata", "Nilsen", "Grimaldi", "Serrano",
  "Adeyemi", "Cortez", "Larsen", "Bauer", "Santoro", "Verhoeven", "Mwangi", "Castellan",
];

const SQUAD_TEMPLATE: { pos: PositionCode; count: number }[] = [
  { pos: "GK", count: 2 },
  { pos: "CB", count: 3 },
  { pos: "LB", count: 2 },
  { pos: "RB", count: 2 },
  { pos: "LWB", count: 1 },
  { pos: "RWB", count: 1 },
  { pos: "CDM", count: 3 },
  { pos: "CM", count: 2 },
  { pos: "CAM", count: 1 },
  { pos: "LM", count: 1 },
  { pos: "RM", count: 1 },
  { pos: "LW", count: 1 },
  { pos: "RW", count: 1 },
  { pos: "ST", count: 2 },
];

interface TeamSeed {
  id: number;
  name: string;
  shortName: string;
  reputation: number;
}

const TEAM_SEEDS: TeamSeed[] = [
  { id: 101, name: "Red Dragons FC", shortName: "RDF", reputation: 85 },
  { id: 102, name: "Iron Wolves United", shortName: "IWU", reputation: 80 },
  { id: 103, name: "Coastal Mariners", shortName: "CMR", reputation: 76 },
  { id: 104, name: "Golden Eagles FC", shortName: "GEF", reputation: 72 },
  { id: 105, name: "Highland Rovers", shortName: "HRO", reputation: 69 },
  { id: 106, name: "Steel City Athletic", shortName: "SCA", reputation: 66 },
  { id: 107, name: "Riverport Town", shortName: "RPT", reputation: 63 },
  { id: 108, name: "Northgate Rangers", shortName: "NGR", reputation: 60 },
  { id: 109, name: "Southbridge FC", shortName: "SFC", reputation: 58 },
  { id: 110, name: "Crestwood Wanderers", shortName: "CSW", reputation: 55 },
];

/** Position-specific attribute profiles: deltas from team mean.
 *  Outfield: [pace, shooting, passing, dribbling, defending, physical]
 *  GK:       [diving, handling, reflexes, positioning, kicking, command] */
const PROFILE: Record<PositionCode, [number, number, number, number, number, number]> = {
  GK: [6, 4, 6, 2, -12, 0],
  CB: [-6, -22, -4, -12, 10, 6],
  LB: [4, -16, 0, -4, 4, 0],
  RB: [4, -16, 0, -4, 4, 0],
  LWB: [6, -12, 0, 0, 0, 0],
  RWB: [6, -12, 0, 0, 0, 0],
  CDM: [-6, -12, 4, -6, 8, 4],
  CM: [0, -6, 6, 2, -2, 0],
  CAM: [-2, 2, 6, 8, -16, -4],
  LM: [6, -4, 2, 6, -8, -2],
  RM: [6, -4, 2, 6, -8, -2],
  LAM: [2, 2, 4, 8, -18, -4],
  RAM: [2, 2, 4, 8, -18, -4],
  LW: [10, 0, -4, 10, -22, -4],
  RW: [10, 0, -4, 10, -22, -4],
  LF: [6, 6, 0, 8, -20, -2],
  RF: [6, 6, 0, 8, -20, -2],
  CF: [4, 8, -2, 6, -22, 2],
  ST: [4, 12, -8, 4, -26, 4],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

function genAttributes(rng: () => number, pos: PositionCode, mean: number): PositionalAttributes {
  const p = PROFILE[pos];
  const jitter = () => (rng() - 0.5) * 11;
  const attrs = [0, 1, 2, 3, 4, 5].map((i) => clamp(mean + p[i] + jitter(), 20, 97));
  if (pos === "GK") {
    const gk: GKAttributes = {
      diving: attrs[0],
      handling: attrs[1],
      reflexes: attrs[2],
      positioning: attrs[3],
      kicking: attrs[4],
      command: attrs[5],
    };
    return gk;
  }
  const out: PlayerAttributes = {
    pace: attrs[0],
    shooting: attrs[1],
    passing: attrs[2],
    dribbling: attrs[3],
    defending: attrs[4],
    physical: attrs[5],
  };
  return out;
}

function ageFactorForValue(age: number): number {
  if (age <= 21) return 1.55;
  if (age <= 25) return 1.35;
  if (age <= 29) return 0.9;
  if (age <= 32) return 0.45;
  return 0.18;
}

export function computeMarketValue(ovr: number, age: number, potential: number): number {
  const base = Math.pow(Math.max(ovr - 45, 3), 3.15);
  const potBoost = potential > ovr ? 1 + (potential - ovr) * 0.055 : 1;
  const value = base * ageFactorForValue(age) * potBoost;
  return Math.max(75000, Math.round(value / 25000) * 25000);
}

export function computeSalary(ovr: number): number {
  const wage = Math.pow(2, (ovr - 50) / 6) * 1800;
  return Math.max(1000, Math.round(wage / 500) * 500);
}

function teamBudgets(reputation: number): { transferBudget: number; wageBudget: number } {
  const table: [number, number][] = [
    [82, 48000000], [77, 34000000], [72, 24000000], [67, 16000000],
    [62, 11000000], [57, 8000000], [0, 6000000],
  ];
  const transferBudget = table.find(([min]) => reputation >= min)![1];
  return { transferBudget, wageBudget: Math.round(transferBudget / 38) };
}

/**
 * Builds the built-in "Quattrick Premier League": 10 clubs, 21 players each (210 total).
 * Fully deterministic given the default seed.
 */
export function generateDefaultDataset(seed = 20250712): Dataset {
  const rng = mulberry32(seed);
  const leagues = [{ id: 1, name: "Quattrick Premier League", country: "England", tier: 1 }];
  const teams: TeamRow[] = [];
  const players: PlayerRow[] = [];

  const usedNames = new Set<string>();
  const pickName = (): string => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const fn = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
      const ln = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
      const name = `${fn} ${ln}`;
      if (!usedNames.has(name)) {
        usedNames.add(name);
        return name;
      }
    }
    return `A. ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]} ${Math.floor(rng() * 99)}`;
  };

  // ids start at 5001 so a regenerated world never collides with squad ids
  // held inside existing save files (1000-4999 legacy range)
  let playerId = 5001;

  for (const seed_ of TEAM_SEEDS) {
    const { transferBudget, wageBudget } = teamBudgets(seed_.reputation);
    teams.push({
      id: seed_.id,
      leagueId: 1,
      name: seed_.name,
      shortName: seed_.shortName,
      logoUrl: null,
      reputation: seed_.reputation,
      transferBudget,
      wageBudget,
    });

    const teamMean = seed_.reputation - 5;

    for (const { pos, count } of SQUAD_TEMPLATE) {
      for (let i = 0; i < count; i++) {
        const ageRoll = rng();
        const age = ageRoll < 0.18 ? 17 + Math.floor(rng() * 4) : ageRoll < 0.72 ? 21 + Math.floor(rng() * 7) : 28 + Math.floor(rng() * 9);
        // squad depth dips slightly for the second string
        const depthPenalty = i > 0 && (pos === "GK" || pos === "LB" || pos === "RB" || pos === "LW" || pos === "RW") ? 3 : 0;
        const attrs = genAttributes(rng, pos, teamMean - depthPenalty + (rng() < 0.12 ? 4 : 0));
        const ovr = computeOverall(attrs, pos);
        let potential = ovr;
        if (age <= 21) potential = ovr + 5 + Math.floor(rng() * 10);
        else if (age <= 24) potential = ovr + 3 + Math.floor(rng() * 7);
        else if (age <= 28) potential = ovr + Math.floor(rng() * 4);
        else potential = ovr + (rng() < 0.25 ? 1 : 0);
        potential = Math.min(99, potential);

        players.push({
          id: playerId++,
          teamId: seed_.id,
          name: pickName(),
          age,
          position: pos,
          overallRating: ovr,
          potential,
          marketValue: computeMarketValue(ovr, age, potential),
          salary: computeSalary(ovr),
          attributes: attrs,
        });
      }
    }
  }

  return { leagues, teams, players };
}
