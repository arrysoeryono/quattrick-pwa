"use client";

import { cn } from "@/lib/utils";
import { moraleLabel, ratingColor, sharpLabel } from "@/lib/format";
import { GK_ATTR_FULL, GK_ATTR_LABELS, OUTFIELD_ATTR_LABELS, isGKAttributes } from "@/lib/game/attributes";
import type { PlayerState } from "@/lib/game/types";

function attrColor(v: number): string {
  if (v >= 85) return "bg-emerald-500";
  if (v >= 75) return "bg-emerald-400/80";
  if (v >= 65) return "bg-amber-400";
  if (v >= 55) return "bg-orange-400";
  return "bg-rose-400";
}

export function PlayerDetailBody({ player }: { player: PlayerState }) {
  const sharp = sharpLabel(player.sharpness);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3">
        <div className="text-center">
          <p className="text-2xl font-black text-slate-50">{player.overallRating}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Overall</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-emerald-400">{player.potential}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Potential</p>
        </div>
        <div className="text-center">
          <p className={cn("text-2xl font-black", player.form > 0 ? ratingColor(player.form) : "text-slate-600")}>
            {player.form > 0 ? player.form.toFixed(1) : "-"}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Form</p>
        </div>
        <div className="text-center">
          <p className={cn("text-2xl font-black", player.morale >= 60 ? "text-emerald-400" : player.morale >= 40 ? "text-amber-400" : "text-rose-400")}>
            {player.morale}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Morale</p>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
          {isGKAttributes(player.attributes) ? "Goalkeeper attributes" : "Attributes"}
        </p>
        <div className="space-y-2">
          {(isGKAttributes(player.attributes)
            ? (Object.keys(GK_ATTR_LABELS) as (keyof typeof GK_ATTR_LABELS)[]).map((key) => ({
                key,
                label: GK_ATTR_LABELS[key],
                full: GK_ATTR_FULL[key],
                value: player.attributes[key],
              }))
            : (Object.keys(OUTFIELD_ATTR_LABELS) as (keyof typeof OUTFIELD_ATTR_LABELS)[]).map((key) => ({
                key,
                label: OUTFIELD_ATTR_LABELS[key],
                full: key.charAt(0).toUpperCase() + key.slice(1),
                value: player.attributes[key],
              }))
          ).map(({ key, label, full, value }) => (
            <div key={key} className="flex items-center gap-2.5" title={full}>
              <span className="w-8 text-[10px] font-bold text-slate-500">{label}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", attrColor(value))} style={{ width: `${value}%` }} />
              </div>
              <span className="w-7 text-right text-xs font-bold text-slate-200 tabular-nums">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Sharpness</p>
          <p className="text-sm font-bold text-slate-200">{player.sharpness}/100 · {sharp.label}</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className={cn("h-full rounded-full", player.sharpness >= 60 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${player.sharpness}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">Attribute boost {sharp.boost >= 0 ? `+${sharp.boost}` : sharp.boost} in matches</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Condition</p>
          <p className="text-sm font-bold text-slate-200">{player.morale >= 60 ? "High" : player.morale >= 40 ? "Neutral" : "Low"} morale</p>
          <p className="text-[11px] text-slate-500 mt-1">{moraleLabel(player.morale)} · {player.injuryWeeks > 0 ? `Injured ${player.injuryWeeks}w` : "Fully fit"}</p>
          <p className="text-[10px] text-slate-500 mt-1">Stamina {player.stamina}/100</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Career totals</p>
        <p className="text-xs text-slate-300">
          {player.careerStats.apps} appearances · {player.careerStats.goals} goals · {player.careerStats.assists} assists
        </p>
      </div>
    </div>
  );
}
