"use client";

/**
 * v4.8 Advanced pitch — FIFA-style formation view with full markings,
 * line connections and informative player chips (effective rating,
 * sharpness/stamina bars, captain / instruction / injury badges).
 *
 * Shared by the tactics board and the half-time menu.
 */
import { useMemo } from "react";
import { positionGroup } from "@/lib/game/formations";
import type { PositionCode } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export interface PitchChipPlayer {
  id: number | null;
  slotCode: string;
  name: string;
  /** value shown inside the circle (effective rating, or slot code when empty) */
  eff: number;
  affinity: number;
  /** the player's natural position — shown on the chip (CM›LB when moved) */
  naturalPos?: string;
  sharpness?: number; // 0-100 training sharpness
  stamina?: number; // 0-100 current condition (live at half-time)
  injured?: boolean;
  hasInstruction?: boolean;
  isCaptain?: boolean;
  subbedOut?: boolean;
  justIn?: boolean; // came on as a substitute
  yellow?: number;
  showRating?: number; // live match rating (half-time)
}

interface AdvancedPitchProps {
  coords: { code: PositionCode; x: number; y: number }[];
  players: (PitchChipPlayer | null)[]; // aligned to coords / formation slots
  onSelect?: (slotIndex: number) => void;
  selectedId?: number | null;
  showBars?: "none" | "sharpness" | "stamina" | "both";
  connections?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function affinityRing(a: number): string {
  if (a >= 0.95) return "border-emerald-400";
  if (a >= 0.8) return "border-emerald-500/60";
  if (a >= 0.65) return "border-amber-500/60";
  return "border-rose-500/70";
}

function barTone(v: number): string {
  return v >= 75 ? "bg-emerald-400" : v >= 50 ? "bg-amber-400" : "bg-rose-400";
}

function posBadgeTone(a: number): string {
  if (a >= 0.95) return "text-emerald-300";
  if (a >= 0.8) return "text-emerald-400/90";
  if (a >= 0.65) return "text-amber-300";
  return "text-rose-300";
}

export function AdvancedPitch({
  coords,
  players,
  onSelect,
  selectedId,
  showBars = "none",
  connections = false,
  className,
  ariaLabel = "Formation pitch",
}: AdvancedPitchProps) {
  // dashed connection lines through each positional line (DEF / MID / ATT)
  const lines = useMemo(() => {
    if (!connections) return [];
    const groups: Record<string, { x: number; y: number }[]> = { DEF: [], MID: [], ATT: [] };
    coords.forEach((c, i) => {
      const p = players[i];
      if (!p || p.id == null || p.subbedOut) return;
      const g = positionGroup(c.code);
      if (g !== "GK" && groups[g]) groups[g].push({ x: c.x * 100, y: c.y * 100 });
    });
    return Object.values(groups)
      .filter((pts) => pts.length >= 2)
      .map((pts) =>
        pts
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((pt) => `${pt.x},${pt.y}`)
          .join(" "),
      );
  }, [coords, players, connections]);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("pitch-bg relative overflow-hidden rounded-xl border border-emerald-900/60", className)}
      style={{ aspectRatio: "3 / 4" }}
    >
      {/* ---- markings ---- */}
      <div className="absolute inset-2 rounded-md border border-white/25" aria-hidden />
      <div className="absolute left-2 right-2 top-1/2 h-px bg-white/25" aria-hidden />
      <div className="absolute left-1/2 top-1/2 h-[22%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" aria-hidden />
      <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" aria-hidden />
      {/* bottom half: own goal + boxes */}
      <div className="absolute bottom-2 left-1/2 h-[16%] w-[58%] -translate-x-1/2 border border-white/25 border-b-0" aria-hidden />
      <div className="absolute bottom-2 left-1/2 h-[7%] w-[28%] -translate-x-1/2 border border-white/25 border-b-0" aria-hidden />
      <div className="absolute bottom-[13.5%] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/50" aria-hidden />
      <div className="absolute bottom-[18%] left-1/2 h-[6%] w-[30%] -translate-x-1/2 rounded-t-full border border-b-0 border-white/25" aria-hidden />
      {/* top half: opponent boxes */}
      <div className="absolute left-1/2 top-2 h-[16%] w-[58%] -translate-x-1/2 border border-white/25 border-t-0" aria-hidden />
      <div className="absolute left-1/2 top-2 h-[7%] w-[28%] -translate-x-1/2 border border-white/25 border-t-0" aria-hidden />
      <div className="absolute left-1/2 top-[13.5%] h-1 w-1 -translate-x-1/2 rounded-full bg-white/50" aria-hidden />
      <div className="absolute left-1/2 top-[18%] h-[6%] w-[30%] -translate-x-1/2 rounded-b-full border border-t-0 border-white/25" aria-hidden />
      {/* corner arcs */}
      <div className="absolute left-2 top-2 h-2.5 w-2.5 rounded-br-full border-b border-r border-white/25" aria-hidden />
      <div className="absolute right-2 top-2 h-2.5 w-2.5 rounded-bl-full border-b border-l border-white/25" aria-hidden />
      <div className="absolute bottom-2 left-2 h-2.5 w-2.5 rounded-tr-full border-t border-r border-white/25" aria-hidden />
      <div className="absolute bottom-2 right-2 h-2.5 w-2.5 rounded-tl-full border-t border-l border-white/25" aria-hidden />
      {/* goals */}
      <div className="absolute bottom-[0.4%] left-1/2 h-[1.6%] w-[16%] -translate-x-1/2 rounded-t-sm border border-white/40 bg-white/10" aria-hidden />
      <div className="absolute left-1/2 top-[0.4%] h-[1.6%] w-[16%] -translate-x-1/2 rounded-b-sm border border-white/40 bg-white/10" aria-hidden />

      {/* ---- line connections ---- */}
      {connections && lines.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {lines.map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}

      {/* ---- player chips ---- */}
      {players.map((p, i) => {
        const c = coords[i];
        if (!c) return null;
        const empty = !p || p.id == null;
        const isSelected = !empty && selectedId != null && p.id === selectedId;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect?.(i)}
            disabled={!onSelect || empty}
            className={cn(
              "absolute flex min-h-[44px] min-w-[44px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 transition-transform",
              isSelected && "z-10 scale-110",
              p?.subbedOut && "opacity-40",
            )}
            style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
            aria-label={`Slot ${p?.slotCode ?? c.code}: ${p ? p.name : "empty"}${p?.hasInstruction ? ", has instructions" : ""}`}
          >
            <span className="relative">
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 bg-slate-950/85 text-xs font-black shadow-lg",
                  empty ? "border-dashed border-slate-400/70 text-slate-500" : cn(affinityRing(p.affinity), "text-slate-50"),
                  isSelected && "ring-2 ring-amber-400 ring-offset-1 ring-offset-emerald-900",
                  p?.yellow != null && p.yellow > 0 && !empty && "border-y-amber-400",
                )}
              >
                {empty ? c.code : p.eff}
              </span>
              {!empty && p.isCaptain && (
                <span
                  className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[8px] font-black text-slate-950"
                  title="Captain"
                >
                  C
                </span>
              )}
              {!empty && p.hasInstruction && (
                <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-amber-400/90 ring-1 ring-slate-950" title="Custom instruction" />
              )}
              {!empty && p.injured && (
                <span className="absolute -bottom-0.5 -left-1 text-[9px] font-black text-rose-400" title="Injured">
                  +
                </span>
              )}
              {!empty && p.justIn && (
                <span className="absolute -bottom-0.5 -right-1 rounded bg-emerald-400 px-0.5 text-[7px] font-black leading-tight text-slate-950" title="Substitute on">
                  IN
                </span>
              )}
            </span>
            {!empty && (
              <span className="flex max-w-[84px] items-center justify-center gap-1 rounded bg-slate-950/80 px-1">
                <span className={cn("text-[8px] font-black leading-tight", posBadgeTone(p.affinity))} title={p.naturalPos && p.naturalPos !== p.slotCode ? `Natural ${p.naturalPos}, playing ${p.slotCode}` : `Playing ${p.slotCode}`}>
                  {p.naturalPos && p.naturalPos !== p.slotCode ? `${p.naturalPos}›${p.slotCode}` : p.slotCode}
                </span>
                <span className="truncate text-[9px] font-semibold leading-tight text-slate-300">
                  {p.name.split(" ").pop()}
                </span>
              </span>
            )}
            {empty && <span className="rounded bg-slate-950/60 px-1 text-[8px] text-slate-500">Empty</span>}
            {showBars !== "none" && !empty && (
              <span className="flex w-9 flex-col gap-px" aria-hidden>
                {(showBars === "both" || showBars === "sharpness") && p.sharpness != null && (
                  <span className="h-[3px] w-full overflow-hidden rounded-full bg-slate-950/70">
                    <span className={cn("block h-full", barTone(p.sharpness))} style={{ width: `${p.sharpness}%` }} />
                  </span>
                )}
                {(showBars === "both" || showBars === "stamina") && p.stamina != null && (
                  <span className="h-[3px] w-full overflow-hidden rounded-full bg-slate-950/70">
                    <span className={cn("block h-full", barTone(p.stamina))} style={{ width: `${p.stamina}%` }} />
                  </span>
                )}
              </span>
            )}
            {!empty && p.showRating != null && (
              <span className={cn("rounded bg-slate-950/85 px-1 text-[8px] font-black tabular-nums", p.showRating >= 7.2 ? "text-emerald-300" : p.showRating >= 6.5 ? "text-slate-300" : "text-rose-300")}>
                {p.showRating.toFixed(1)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
