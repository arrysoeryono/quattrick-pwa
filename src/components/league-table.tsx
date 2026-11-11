"use client";

import { useMemo } from "react";
import type { Dataset, Fixture } from "@/lib/game/types";
import { computeTable } from "@/lib/game/season";
import { cn } from "@/lib/utils";

interface LeagueTableProps {
  dataset: Dataset;
  leagueId: number;
  fixtures: Fixture[];
  clubId: number;
  limit?: number;
}

export function useLeagueTable(dataset: Dataset, leagueId: number, fixtures: Fixture[]) {
  return useMemo(() => {
    const teams = dataset.teams.filter((t) => t.leagueId === leagueId);
    return computeTable(teams, fixtures);
  }, [dataset, leagueId, fixtures]);
}

export function LeagueTable({ dataset, leagueId, fixtures, clubId, limit }: LeagueTableProps) {
  const table = useLeagueTable(dataset, leagueId, fixtures);
  const rows = limit ? table.slice(0, limit) : table;
  const clubInTop = limit ? table.findIndex((r) => r.teamId === clubId) < limit : true;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="w-full text-xs" aria-label="League table">
        <thead>
          <tr className="bg-slate-950/60 text-slate-500">
            <th scope="col" className="py-2 pl-3 pr-1 text-left font-medium w-8">#</th>
            <th scope="col" className="py-2 px-1 text-left font-medium">Club</th>
            <th scope="col" className="py-2 px-1 text-right font-medium w-7">P</th>
            <th scope="col" className="py-2 px-1 text-right font-medium w-7">GD</th>
            <th scope="col" className="py-2 pl-1 pr-3 text-right font-medium w-8">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const team = dataset.teams.find((t) => t.id === r.teamId);
            const isClub = r.teamId === clubId;
            return (
              <tr
                key={r.teamId}
                className={cn(
                  "border-t border-slate-800/70",
                  isClub ? "bg-emerald-500/10 text-emerald-300 font-semibold" : "text-slate-300",
                )}
              >
                <td className="py-2 pl-3 pr-1 text-slate-500">{i + 1}</td>
                <td className="py-2 px-1 truncate max-w-[140px]">{team?.shortName ?? "?"}</td>
                <td className="py-2 px-1 text-right tabular-nums">{r.played}</td>
                <td className="py-2 px-1 text-right tabular-nums">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                <td className="py-2 pl-1 pr-3 text-right tabular-nums font-bold">{r.points}</td>
              </tr>
            );
          })}
          {!clubInTop && (() => {
            const idx = table.findIndex((r) => r.teamId === clubId);
            if (idx < 0) return null;
            const r = table[idx];
            const team = dataset.teams.find((t) => t.id === r.teamId);
            return (
              <tr className="border-t border-slate-800/70 bg-emerald-500/10 text-emerald-300 font-semibold">
                <td className="py-2 pl-3 pr-1 text-slate-500">{idx + 1}</td>
                <td className="py-2 px-1 truncate max-w-[140px]">{team?.shortName ?? "?"}</td>
                <td className="py-2 px-1 text-right tabular-nums">{r.played}</td>
                <td className="py-2 px-1 text-right tabular-nums">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                <td className="py-2 pl-1 pr-3 text-right tabular-nums font-bold">{r.points}</td>
              </tr>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}
