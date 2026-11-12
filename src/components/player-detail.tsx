"use client";

import { cn } from "@/lib/utils";
import { moraleLabel, ratingColor, sharpLabel } from "@/lib/format";
import { GK_ATTR_FULL, GK_ATTR_LABELS, OUTFIELD_ATTR_LABELS, isGKAttributes } from "@/lib/game/attributes";
import { FcPlayerCard } from "@/components/fc-player-card";
import type { PlayerState } from "@/lib/game/types";
import { useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { releasePlayer, toggleLoanList, toggleTransferList } from "@/lib/game/career";
import { formatMoney, formatWage } from "@/lib/format";
import { FileSignature, Handshake, PlaneTakeoff, Repeat } from "lucide-react";

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
          {isGKAttributes(player.attributes) ? "Goalkeeper face stats" : "Face stats"}
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

      <FcPlayerCard player={player} />

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


/* ================= v6.0 — club actions (Squad Hub profile) ================= */

export function PlayerClubActions({ player }: { player: PlayerState }) {
  const game = useAppStore((s) => s.game);
  const [confirmRelease, setConfirmRelease] = useState(false);
  if (!game || game.careerMode === "player") return null;

  const isListed = game.transferListedIds.includes(player.id);
  const isLoanListed = game.loanListedIds.includes(player.id);
  const canExtend = player.contractYears <= 2 && player.contractYears > 0;

  const extend = () => {
    let msg = "";
    useAppStore.getState().update((g) => {
      const p = g.players.find((x) => x.id === player.id);
      if (!p) return;
      p.contractYears += 3;
      p.salary = Math.round(p.salary * 1.2);
      p.morale = Math.min(100, p.morale + 6);
      msg = `${p.name} signs a new 3-year deal at ${formatWage(p.salary)}`;
    });
    toast({ title: msg });
  };

  const doRelease = () => {
    const g = structuredClone(useAppStore.getState().game!);
    const res = releasePlayer(g, player.id);
    if (res.ok) {
      useAppStore.setState({ game: g });
      void useAppStore.getState().syncNow();
      toast({ title: res.message });
    } else {
      toast({ title: res.message });
    }
    setConfirmRelease(false);
  };

  return (
    <section aria-label="Club actions" className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Club actions</p>
      {canExtend && (
        <Button
          size="sm"
          variant="outline"
          className="w-full h-10 justify-start border-emerald-600/50 text-emerald-400"
          onClick={extend}
          aria-label={`Offer ${player.name} a new contract`}
        >
          <FileSignature className="h-4 w-4 mr-2" aria-hidden />
          Extend contract (+3y, +20% wage)
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="outline"
          className={isListed ? "h-10 border-amber-500/60 bg-amber-500/10 text-amber-400" : "h-10 border-slate-700 text-slate-300"}
          onClick={() => useAppStore.getState().update((g) => toggleTransferList(g, player.id))}
          aria-label={isListed ? `Remove ${player.name} from transfer list` : `Transfer-list ${player.name}`}
        >
          <Handshake className="h-4 w-4 mr-1.5" aria-hidden />
          {isListed ? "Listed" : "Transfer list"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={isLoanListed ? "h-10 border-sky-600/60 bg-sky-500/10 text-sky-400" : "h-10 border-slate-700 text-slate-300"}
          onClick={() => useAppStore.getState().update((g) => toggleLoanList(g, player.id))}
          aria-label={isLoanListed ? `Remove ${player.name} from loan list` : `Loan-list ${player.name}`}
        >
          <Repeat className="h-4 w-4 mr-1.5" aria-hidden />
          {isLoanListed ? "Loan listed" : "Loan list"}
        </Button>
      </div>
      {!confirmRelease ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full h-10 justify-start border-rose-500/40 text-rose-400"
          onClick={() => setConfirmRelease(true)}
          aria-label={`Release ${player.name} from the club`}
        >
          <PlaneTakeoff className="h-4 w-4 mr-2" aria-hidden />
          Release player (~{formatMoney(player.salary * 26)} settlement)
        </Button>
      ) : (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5">
          <p className="text-[11px] text-rose-300 mb-2">
            Pay ~{formatMoney(player.salary * 26)} and let {player.name} leave as a free agent? This cannot be undone.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="h-9 border-slate-700" onClick={() => setConfirmRelease(false)}>Cancel</Button>
            <Button size="sm" variant="destructive" className="h-9 font-bold" onClick={doRelease} aria-label="Confirm release">Confirm release</Button>
          </div>
        </div>
      )}
    </section>
  );
}
