"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PlayerDetailBody } from "@/components/player-detail";
import { cn } from "@/lib/utils";
import { posBadgeClass, ratingColor, formatMoney } from "@/lib/format";
import { Cross, Search } from "lucide-react";
import type { PlayerState } from "@/lib/game/types";

type GroupFilter = "ALL" | "GK" | "DEF" | "MID" | "ATT";

const GROUPS: Record<Exclude<GroupFilter, "ALL">, string[]> = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CDM", "CM", "CAM", "LM", "RM", "LAM", "RAM"],
  ATT: ["LW", "RW", "LF", "RF", "CF", "ST"],
};

export function SquadTab() {
  const game = useAppStore((s) => s.game);
  const [filter, setFilter] = useState<GroupFilter>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PlayerState | null>(null);

  const squad = useMemo(() => {
    if (!game) return [];
    let list = [...game.players];
    if (filter !== "ALL") list = list.filter((p) => GROUPS[filter].includes(p.position));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => b.overallRating - a.overallRating);
    return list;
  }, [game, filter, query]);

  if (!game) return null;
  const avgOvr = Math.round(game.players.reduce((s, p) => s + p.overallRating, 0) / Math.max(game.players.length, 1));
  const avgAge = Math.round(game.players.reduce((s, p) => s + p.age, 0) / Math.max(game.players.length, 1));
  const injured = game.players.filter((p) => p.injuryWeeks > 0).length;

  return (
    <div className="space-y-3">
      <section aria-label="Squad summary" className="grid grid-cols-4 gap-2">
        {[
          { label: "Players", value: game.players.length },
          { label: "Avg OVR", value: avgOvr },
          { label: "Avg Age", value: avgAge },
          { label: "Injured", value: injured },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</p>
            <p className={cn("text-base font-black", s.label === "Injured" && s.value > 0 ? "text-rose-400" : "text-slate-200")}>{s.value}</p>
          </div>
        ))}
      </section>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players..."
          className="pl-9 bg-slate-950 border-slate-800"
          aria-label="Search squad players"
        />
      </div>

      <div className="flex gap-1.5" role="group" aria-label="Position group filter">
        {(["ALL", "GK", "DEF", "MID", "ATT"] as GroupFilter[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setFilter(g)}
            aria-pressed={filter === g}
            className={cn(
              "flex-1 min-h-[36px] rounded-lg border text-xs font-semibold transition-colors",
              filter === g ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700",
            )}
          >
            {g}
          </button>
        ))}
      </div>

      <ScrollArea className="h-[calc(100vh-320px)] min-h-48 scrollbar-thin">
        <ul className="space-y-1.5 pr-2" aria-label="Squad player list">
          {squad.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelected(p)}
                className="w-full flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 text-left hover:border-slate-700 transition-colors"
                aria-label={`Player ${p.name}, overall ${p.overallRating}`}
              >
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold w-11 text-center shrink-0", posBadgeClass(p.position))}>
                  {p.position}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                    {p.injuryWeeks > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-rose-400 shrink-0">
                        <Cross className="h-3 w-3" aria-hidden />
                        {p.injuryWeeks}w
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Age {p.age} · {formatMoney(p.salary)}/w · form {p.form > 0 ? p.form.toFixed(1) : "-"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-black text-slate-100 leading-none">{p.overallRating}</p>
                  <p className="text-[10px] text-emerald-400 font-semibold">POT {p.potential}</p>
                </div>
                <div className="w-8 shrink-0 text-right">
                  <p className={cn("text-xs font-bold", p.form > 0 ? ratingColor(p.form) : "text-slate-600")}>
                    {p.sharpness}
                  </p>
                  <p className="text-[9px] text-slate-600">sharp</p>
                </div>
              </button>
            </li>
          ))}
          {squad.length === 0 && (
            <li className="py-8 text-center text-xs text-slate-600">No players match your filters.</li>
          )}
        </ul>
      </ScrollArea>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto scrollbar-thin rounded-t-2xl border-slate-800 bg-slate-900 p-0">
          {selected && (
            <>
              <SheetHeader className="px-4 pt-4 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px] font-bold", posBadgeClass(selected.position))}>
                    {selected.position}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">{selected.squadRole}</Badge>
                  {selected.injuryWeeks > 0 && (
                    <Badge variant="outline" className="text-[10px] border-rose-500/40 text-rose-400">
                      Injured {selected.injuryWeeks}w
                    </Badge>
                  )}
                </div>
                <SheetTitle className="text-left text-lg">{selected.name}</SheetTitle>
                <SheetDescription className="text-left">
                  Age {selected.age} · Value {formatMoney(selected.marketValue)} · {formatMoney(selected.salary)}/w · Contract {selected.contractYears}y
                </SheetDescription>
              </SheetHeader>
              <div className="p-4">
                <PlayerDetailBody player={selected} />
                <Separator className="my-3 bg-slate-800" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-950/60 p-2">
                    <p className="text-[10px] text-slate-500 uppercase">Apps</p>
                    <p className="text-sm font-bold text-slate-200">{selected.seasonStats.apps}</p>
                  </div>
                  <div className="rounded-lg bg-slate-950/60 p-2">
                    <p className="text-[10px] text-slate-500 uppercase">G / A</p>
                    <p className="text-sm font-bold text-slate-200">{selected.seasonStats.goals} / {selected.seasonStats.assists}</p>
                  </div>
                  <div className="rounded-lg bg-slate-950/60 p-2">
                    <p className="text-[10px] text-slate-500 uppercase">Avg rating</p>
                    <p className={cn("text-sm font-bold", selected.seasonStats.apps ? ratingColor(selected.seasonStats.ratingSum / selected.seasonStats.apps) : "text-slate-500")}>
                      {selected.seasonStats.apps ? (selected.seasonStats.ratingSum / selected.seasonStats.apps).toFixed(2) : "-"}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
