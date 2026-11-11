/** Shared formatting helpers. */

export function formatMoney(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export function formatWage(v: number): string {
  return `$${(v / 1000).toFixed(1)}K/w`;
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
