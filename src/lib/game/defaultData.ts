import type { Dataset } from "./types";

/** Deterministic RNG shared by the match/season/career engines. */
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

/* ---------------- shared valuation formulas ---------------- */

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

/* ---------------- empty world ---------------- */

/**
 * No built-in dummy database: leagues, teams and players always come from the
 * user's own Excel import (synced to Neon). Before an import the world is
 * simply empty and onboarding guides the user to the Database Manager.
 */
export const EMPTY_DATASET: Dataset = {
  leagues: [],
  teams: [],
  players: [],
};
