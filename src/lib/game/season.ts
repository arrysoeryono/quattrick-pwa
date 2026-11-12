import type { Dataset, Fixture, TableRow, TeamRow } from "./types";
import { mulberry32 } from "./defaultData";
import { getFormation, positionAffinity } from "./formations";
import type { MatchTeamConfig, Mentality, PlayerState, PositionCode } from "./types";
import { aiSlidersFor } from "./tacticPresets";
import { computePlayStyles } from "./development";
import { buildFcProfile } from "./fc";

/** Double round-robin (circle method). Returns 2*(n-1) rounds, weekly dates. */
export function generateFixtures(teamIds: number[], seasonStart: Date): Fixture[] {
  const ids = [...teamIds];
  const n = ids.length;
  if (n % 2 !== 0) ids.push(-1);
  const m = ids.length;
  const rounds: [number, number][][] = [];
  let arr = [...ids];

  for (let r = 0; r < m - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i];
      const b = arr[m - 1 - i];
      if (a !== -1 && b !== -1) {
        // alternate home/away for variety
        pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
    }
    rounds.push(pairs);
    // rotate all but first
    arr = [arr[0], arr[m - 1], ...arr.slice(1, m - 1)];
  }
  const secondHalf = rounds.map((ps) => ps.map(([h, a]) => [a, h] as [number, number]));
  const all = [...rounds, ...secondHalf];

  const fixtures: Fixture[] = [];
  let fixtureId = 1;
  all.forEach((pairs, roundIdx) => {
    const date = new Date(seasonStart.getTime() + roundIdx * 7 * 24 * 3600 * 1000);
    pairs.forEach(([homeId, awayId]) => {
      fixtures.push({
        id: fixtureId++,
        round: roundIdx + 1,
        date: date.toISOString().slice(0, 10),
        homeId,
        awayId,
        played: false,
        homeGoals: null,
        awayGoals: null,
        competition: "league",
      });
    });
  });
  return fixtures;
}

export function computeTable(teams: TeamRow[], fixtures: Fixture[]): TableRow[] {
  const rows = new Map<number, TableRow>();
  teams.forEach((t) =>
    rows.set(t.id, { teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }),
  );
  fixtures.forEach((fx) => {
    if (!fx.played || fx.homeGoals === null || fx.awayGoals === null) return;
    const h = rows.get(fx.homeId);
    const a = rows.get(fx.awayId);
    if (!h || !a) return;
    h.played++; a.played++;
    h.gf += fx.homeGoals; h.ga += fx.awayGoals;
    a.gf += fx.awayGoals; a.ga += fx.homeGoals;
    if (fx.homeGoals > fx.awayGoals) { h.won++; h.points += 3; a.lost++; }
    else if (fx.homeGoals < fx.awayGoals) { a.won++; a.points += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  });
  return [...rows.values()]
    .map((r) => ({ ...r, gd: r.gf - r.ga }))
    .sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.teamId - y.teamId);
}

/**
 * Effective team strength from a starting XI — weighted by zone and slot affinity,
 * plus sharpness & morale modifiers (development-mechanics compliant).
 */
export function computeTeamStrength(team: MatchTeamConfig): { att: number; mid: number; def: number } {
  const formation = getFormation(team.formation);
  let attSum = 0, attW = 0, midSum = 0, midW = 0, defSum = 0, defW = 0;

  formation.positions.forEach((slot, i) => {
    const p = team.players[i];
    if (!p) return;
    const affinity = positionAffinity(p.position, slot);
    const sharpAdj = p.sharpness >= 80 ? 5 : p.sharpness >= 60 ? 3 : p.sharpness >= 40 ? 0 : -4;
    const eff = p.ovr * affinity + sharpAdj + (p.morale - 60) * 0.03;

    const isGK = slot === "GK";
    const isDef = ["CB", "LB", "RB", "LWB", "RWB"].includes(slot);
    const isAtt = ["LW", "RW", "LF", "RF", "CF", "ST"].includes(slot);

    if (isGK || isDef) {
      const w = isGK ? 3 : 1.4;
      defSum += eff * w; defW += w;
      if (isDef) { midSum += eff * 0.5; midW += 0.5; }
    } else if (isAtt) {
      const w = 1.3;
      attSum += eff * w; attW += w;
      midSum += eff * 0.5; midW += 0.5;
    } else {
      const w = 1.5;
      midSum += eff * w; midW += w;
      attSum += eff * 0.4; attW += 0.4;
      defSum += eff * 0.55; defW += 0.55;
    }
  });

  return {
    att: attW ? attSum / attW : 50,
    mid: midW ? midSum / midW : 50,
    def: defW ? defSum / defW : 50,
  };
}

function poisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

/** Fast AI-vs-AI result from overall team strengths (used for other fixtures in the round). */
export function quickSimulateScore(
  homeStrength: number,
  awayStrength: number,
  seed: number,
): { homeGoals: number; awayGoals: number } {
  const rng = mulberry32(seed);
  const ratio = Math.max(0.6, Math.min(1.7, homeStrength / Math.max(awayStrength, 30)));
  const homeLambda = Math.max(0.25, 1.45 * Math.pow(ratio, 1.35) * 1.12);
  const awayLambda = Math.max(0.2, 1.25 / Math.pow(ratio, 1.35));
  return { homeGoals: poisson(homeLambda, rng), awayGoals: poisson(awayLambda, rng) };
}

/** Average overall of a club's best XI approximated from its dataset players. */
export function estimateClubStrength(dataset: Dataset, teamId: number): number {
  const squad = dataset.players.filter((p) => p.teamId === teamId);
  if (squad.length === 0) return 55;
  const best = [...squad].sort((a, b) => b.overallRating - a.overallRating).slice(0, 11);
  return best.reduce((s, p) => s + p.overallRating, 0) / best.length;
}

/** Builds a MatchTeamConfig for AI clubs straight from the dataset (auto best-XI for formation). */
export function buildAiTeamConfig(dataset: Dataset, team: TeamRow, formationName: string, mentality: Mentality = "balanced"): MatchTeamConfig {
  const formation = getFormation(formationName);
  const squad = dataset.players
    .filter((p) => p.teamId === team.id)
    .sort((a, b) => b.overallRating - a.overallRating);
  const players: MatchTeamConfig["players"] = [];
  const used = new Set<number>();
  formation.positions.forEach((slot) => {
    let pick = squad.find((p) => !used.has(p.id) && p.position === slot);
    if (!pick) {
      // fallback: best remaining by affinity then ovr
      const candidates = squad
        .filter((p) => !used.has(p.id))
        .map((p) => ({ p, aff: positionAffinity(p.position, slot) }))
        .sort((x, y) => y.aff - x.aff || y.p.overallRating - x.p.overallRating);
      pick = candidates[0]?.p;
    }
    if (!pick) pick = squad[0];
    if (!pick) {
      const fallbackAttrs = slot === "GK"
        ? { diving: 50, handling: 50, reflexes: 50, positioning: 50, kicking: 50, speed: 50 }
        : { pace: 50, shooting: 50, passing: 50, dribbling: 50, defending: 50, physical: 50 };
      players.push({
        id: -1, name: "Unknown", position: slot as PositionCode, ovr: 50,
        attributes: fallbackAttrs,
        stamina: 100, sharpness: 70, morale: 60, age: 24,
      });
      return;
    }
    used.add(pick.id);
    players.push({
      id: pick.id,
      name: pick.name,
      position: pick.position,
      ovr: pick.overallRating,
      attributes: pick.attributes,
      stamina: 100,
      sharpness: 70,
      morale: 60,
      age: pick.age,
      playStyles: computePlayStyles(pick).map((s) => s.id),
      fc: buildFcProfile(pick),
    });
  });
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    formation: formationName,
    mentality,
    sliders: aiSlidersFor(formation.category, mentality),
    players,
  };
}

/** Total wage bill of a squad. */
export function wageBill(players: PlayerState[]): number {
  return players.reduce((s, p) => s + p.salary, 0);
}
