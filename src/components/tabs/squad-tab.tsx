"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PlayerDetailBody } from "@/components/player-detail";
import { DevelopmentPanel } from "@/components/development-panel";
import { cn } from "@/lib/utils";
import { posBadgeClass, ratingColor, formatMoney } from "@/lib/format";
import { ALL_POSITIONS } from "@/lib/game/types";
import { Cross, Filter, Search, X } from "lucide-react";

type GroupFilter = "ALL" | "GK" | "DEF" | "MID" | "ATT";
type SortKey = "ovr" | "pot" | "age" | "form" | "value" | "wage";

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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [exactPos, setExactPos] = useState<string>("ALL");
  const [minAge, setMinAge] = useState(15);
  const [maxAge, setMaxAge] = useState(45);
  const [minOvr, setMinOvr] = useState(0);
  const [minPot, setMinPot] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("ovr");
  const [fitOnly, setFitOnly] = useState(false);
  const selected = selectedId !== null && game ? game.players.find((p) => p.id === selectedId) ?? null : null;

  const squad = useMemo(() => {
    if (!game) return [];
    let list = [...game.players];
    if (filter !== "ALL") list = list.filter((p) => GROUPS[filter].includes(p.position));
    if (exactPos !== "ALL") list = list.filter((p) => p.position === exactPos);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    list = list.filter((p) => p.age >= minAge && p.age <= maxAge);
    list = list.filter((p) => p.overallRating >= minOvr && p.potential >= minPot);
    if (fitOnly) list = list.filter((p) => p.injuryWeeks === 0);
    const sorters: Record<SortKey, (a: typeof list[number], b: typeof list[number]) => number> = {
      ovr: (a, b) => b.overallRating - a.overallRating,
      pot: (a, b) => b.potential - a.potential,
      age: (a, b) => a.age - b.age,
      form: (a, b) => b.form - a.form,
      value: (a, b) => b.marketValue - a.marketValue,
      wage: (a, b) => b.salary - a.salary,
    };
    list.sort(sorters[sortKey]);
    return list;
  }, [game, filter, query, exactPos, minAge, maxAge, minOvr, minPot, sortKey, fitOnly]);

  const activeFilterCount = (exactPos !== "ALL" ? 1 : 0) + (minAge > 15 || maxAge < 45 ? 1 : 0) + (minOvr > 0 ? 1 : 0) + (minPot > 0 ? 1 : 0) + (fitOnly ? 1 : 0) + (sortKey !== "ovr" ? 1 : 0);

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

      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players..."
            className="pl-9 bg-slate-950 border-slate-800"
            aria-label="Search squad players"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-pressed={showFilters}
          aria-label="Toggle advanced filters"
          className={cn(
            "relative flex items-center gap-1 rounded-lg border px-3 text-xs font-semibold transition-colors",
            showFilters || activeFilterCount > 0
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
              : "border-slate-800 bg-slate-950/40 text-slate-400",
          )}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
          Filters
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 rounded-full bg-emerald-500 text-[9px] font-black text-slate-950 flex items-center justify-center px-0.5">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {showFilters && (
        <section aria-label="Advanced squad filters" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Position</p>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => setExactPos("ALL")} aria-pressed={exactPos === "ALL"} className={cn("rounded-md border px-2 py-1 text-[10px] font-bold", exactPos === "ALL" ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-slate-800 text-slate-400")}>Any</button>
              {ALL_POSITIONS.map((pos) => (
                <button key={pos} type="button" onClick={() => setExactPos(pos)} aria-pressed={exactPos === pos} className={cn("rounded-md border px-2 py-1 text-[10px] font-bold", exactPos === pos ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-slate-800 text-slate-400")}>{pos}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-slate-500">
              Min age: <span className="font-mono text-slate-300">{minAge}</span>
              <input type="range" min={15} max={45} value={minAge} onChange={(e) => setMinAge(Number(e.target.value))} className="w-full accent-emerald-500" aria-label="Minimum age" />
            </label>
            <label className="text-[10px] text-slate-500">
              Max age: <span className="font-mono text-slate-300">{maxAge}</span>
              <input type="range" min={15} max={45} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} className="w-full accent-emerald-500" aria-label="Maximum age" />
            </label>
            <label className="text-[10px] text-slate-500">
              Min OVR: <span className="font-mono text-slate-300">{minOvr}</span>
              <input type="range" min={0} max={95} value={minOvr} onChange={(e) => setMinOvr(Number(e.target.value))} className="w-full accent-emerald-500" aria-label="Minimum overall" />
            </label>
            <label className="text-[10px] text-slate-500">
              Min POT: <span className="font-mono text-slate-300">{minPot}</span>
              <input type="range" min={0} max={99} value={minPot} onChange={(e) => setMinPot(Number(e.target.value))} className="w-full accent-emerald-500" aria-label="Minimum potential" />
            </label>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sort</span>
            {(["ovr", "pot", "age", "form", "value", "wage"] as SortKey[]).map((k) => (
              <button key={k} type="button" onClick={() => setSortKey(k)} aria-pressed={sortKey === k} className={cn("rounded-md border px-2 py-1 text-[10px] font-bold uppercase", sortKey === k ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-slate-800 text-slate-400")}>{k}</button>
            ))}
            <button
              type="button"
              onClick={() => setFitOnly((v) => !v)}
              aria-pressed={fitOnly}
              className={cn("rounded-md border px-2 py-1 text-[10px] font-bold ml-auto", fitOnly ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-slate-800 text-slate-400")}
            >
              Fit only
            </button>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => { setExactPos("ALL"); setMinAge(15); setMaxAge(45); setMinOvr(0); setMinPot(0); setFitOnly(false); setSortKey("ovr"); }}
                className="rounded-md border border-rose-500/40 text-rose-400 px-2 py-1 text-[10px] font-bold"
                aria-label="Clear all filters"
              >
                <X className="h-3 w-3 inline mr-0.5" aria-hidden />Clear
              </button>
            )}
          </div>
        </section>
      )}

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

      <div>
        <ul className="space-y-1.5" aria-label="Squad player list">
          {squad.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="w-full flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 text-left hover:border-slate-700 transition-colors"
                aria-label={`Player ${p.name}, overall ${p.overallRating}`}
              >
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold w-11 text-center shrink-0", posBadgeClass(p.position))}>
                  {p.position}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                    {p.retrain && (
                      <span className="shrink-0 text-[9px] font-bold text-amber-400" aria-label={`Converting to ${p.retrain.target}`}>
                        →{p.retrain.target} {p.retrain.weeksLeft}w
                      </span>
                    )}
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
      </div>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="bottom" className="max-h-[min(88dvh,88vh)] overflow-y-auto overscroll-contain scrollbar-thin touch-scroll rounded-t-2xl border-slate-800 bg-slate-900 p-0">
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
                <DevelopmentPanel player={selected} />
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
