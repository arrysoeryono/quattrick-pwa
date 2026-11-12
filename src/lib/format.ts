/** Shared formatting helpers. */

import type { Currency } from "./game/types";

/** v6.0 — multi-currency support (Office > Settings). Module-level so every
 *  existing formatMoney/formatWage call site picks it up automatically. */
const CURRENCY_META: Record<Currency, { symbol: string; rate: number }> = {
  USD: { symbol: "$", rate: 1 },
  EUR: { symbol: "€", rate: 0.92 },
  GBP: { symbol: "£", rate: 0.79 },
  IDR: { symbol: "Rp", rate: 15800 },
};

let ACTIVE_CURRENCY: Currency = "USD";

export function setCurrency(c: Currency | undefined | null): void {
  if (c && c in CURRENCY_META) ACTIVE_CURRENCY = c;
}

export function getCurrency(): Currency {
  return ACTIVE_CURRENCY;
}

export const CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "IDR"];

export function formatMoney(v: number): string {
  const { symbol, rate } = CURRENCY_META[ACTIVE_CURRENCY];
  const x = v * rate;
  if (ACTIVE_CURRENCY === "IDR") {
    if (Math.abs(x) >= 1e12) return `${symbol}${(x / 1e12).toFixed(1)}T`;
    if (Math.abs(x) >= 1e9) return `${symbol}${(x / 1e9).toFixed(x % 1e9 === 0 ? 0 : 1)}M`;
    if (Math.abs(x) >= 1e6) return `${symbol}${(x / 1e6).toFixed(0)}Jt`;
    if (Math.abs(x) >= 1e3) return `${symbol}${(x / 1e3).toFixed(0)}K`;
    return `${symbol}${Math.round(x)}`;
  }
  if (Math.abs(x) >= 1_000_000) return `${symbol}${(x / 1_000_000).toFixed(x % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(x) >= 1_000) return `${symbol}${(x / 1_000).toFixed(0)}K`;
  return `${symbol}${Math.round(x)}`;
}

export function formatWage(v: number): string {
  const { symbol, rate } = CURRENCY_META[ACTIVE_CURRENCY];
  const x = v * rate;
  if (ACTIVE_CURRENCY === "IDR") {
    if (Math.abs(x) >= 1e9) return `${symbol}${(x / 1e9).toFixed(1)}M/w`;
    if (Math.abs(x) >= 1e6) return `${symbol}${(x / 1e6).toFixed(0)}Jt/w`;
    if (Math.abs(x) >= 1e3) return `${symbol}${(x / 1e3).toFixed(0)}K/w`;
    return `${symbol}${Math.round(x)}/w`;
  }
  return `${symbol}${(x / 1000).toFixed(1)}K/w`;
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export const POS_COLORS: Record<string, string> = {
  GK: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  CB: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  LB: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  RB: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  LWB: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  RWB: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export function posBadgeClass(pos: string): string {
  if (POS_COLORS[pos]) return POS_COLORS[pos];
  if (["CDM", "CM", "CAM", "LM", "RM", "LAM", "RAM"].includes(pos))
    return "bg-sky-500/15 text-sky-300 border-sky-500/30";
  return "bg-rose-500/15 text-rose-300 border-rose-500/30";
}

export function moraleLabel(morale: number): string {
  if (morale >= 80) return "Excellent";
  if (morale >= 60) return "Good";
  if (morale >= 40) return "Okay";
  return "Poor";
}

export function sharpLabel(sharpness: number): { label: string; boost: number } {
  if (sharpness >= 80) return { label: "Very High", boost: 5 };
  if (sharpness >= 60) return { label: "High", boost: 3 };
  if (sharpness >= 40) return { label: "Neutral", boost: 0 };
  return { label: "Low", boost: -4 };
}

export function ratingColor(rating: number): string {
  if (rating >= 7.5) return "text-emerald-400";
  if (rating >= 6.5) return "text-yellow-400";
  return "text-rose-400";
}
