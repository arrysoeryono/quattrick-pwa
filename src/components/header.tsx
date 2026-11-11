"use client";

import { useAppStore } from "@/lib/store/gameStore";
import { Badge } from "@/components/ui/badge";
import { Cloud, CloudOff, Wallet } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";

export function AppHeader() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const cloudOnline = useAppStore((s) => s.cloudOnline);
  if (!game || !dataset) return null;

  const team = dataset.teams.find((t) => t.id === game.clubId);
  const season = game.season;

  return (
    <header className="h-14 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 flex items-center justify-between sticky top-0 z-40 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-emerald-600 flex items-center justify-center text-[10px] font-black text-white">
          {team?.shortName ?? "FC"}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-100 leading-tight truncate">{team?.name ?? "Club"}</p>
          <p className="text-[11px] text-slate-500 leading-tight">
            {game.managerName} · Season {season}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Badge variant="outline" className="border-slate-700 text-slate-300 font-mono text-[11px] gap-1">
          <Wallet className="h-3 w-3 text-emerald-400" aria-hidden />
          {formatMoney(game.transferBudget)}
        </Badge>
        <Badge variant="outline" className="border-slate-700 text-slate-400 text-[11px] hidden xs:inline-flex sm:inline-flex">
          {formatDate(game.currentDate)}
        </Badge>
        {cloudOnline === false ? (
          <CloudOff className="h-4 w-4 text-slate-600" aria-label="Cloud offline" />
        ) : (
          <Cloud className="h-4 w-4 text-emerald-500" aria-label="Cloud connected" />
        )}
      </div>
    </header>
  );
}
