"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PlayerDetailBody, PlayerClubActions } from "@/components/player-detail";
import { DevelopmentPanel } from "@/components/development-panel";
import { TacticsTab } from "@/components/tabs/tactics-tab";
import { cn } from "@/lib/utils";
import { posBadgeClass, ratingColor, formatMoney } from "@/lib/format";
import { ALL_POSITIONS, type TrainingFocus } from "@/lib/game/types";
import { assumedMinutes, estimateWeeklyXp, growthMultipliers, playStyleRoadmap, projectGrowth, projectTrajectory } from "@/lib/game/devProjection";
import { coachMultiplier } from "@/lib/game/advance";
import { GK_ATTR_LABELS, isGKAttributes } from "@/lib/game/attributes";
import { computePlayStyles } from "@/lib/game/development";
import { FOCUS_LABEL } from "@/components/development-panel";
import { ChevronLeft, ChevronRight, Cross, Filter, HeartPulse, ListChecks, Search, Settings2, Sparkles, TrendingUp, Users, X } from "lucide-react";

type GroupFilter = "ALL" | "GK" | "DEF" | "MID" | "ATT";
type SortKey = "ovr" | "pot" | "age" | "form" | "value" | "wage";

const GROUPS: Record<Exclude<GroupFilter, "ALL">, string[]> = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CDM", "CM", "CAM", "LM", "RM", "LAM", "RAM"],
  ATT: ["LW", "RW", "LF", "RF", "CF", "ST"],
};

type SquadSubView = "hub" | "tactics" | "development" | "training" | "injuries";

/** v6.0 — FC-style Squad section with sub-screens (FC 25 Squad tab). */
export function SquadTab() {
  const [sub, setSub] = useState<SquadSubView>("hub");
  const game = useAppStore((s) => s.game);

  const SUBS: { key: SquadSubView; label: string; icon: typeof Users }[] = [
    { key: "hub", label: "Hub", icon: Users },
    { key: "tactics", label: "Team Mgmt", icon: Settings2 },
    { key: "development", label: "Development", icon: ListChecks },
    { key: "training", label: "Training", icon: HeartPulse },
    { key: "injuries", label: "Injuries", icon: Cross },
  ];

  return (
    <div className="space-y-3">
      <nav aria-label="Squad sections" className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1">
        {SUBS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSub(key)}
            aria-pressed={sub === key}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-semibold shrink-0 transition-colors min-h-[36px]",
              sub === key
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                : "border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </nav>
      {sub === "hub" && <SquadHub />}
      {sub === "tactics" && <TacticsTab />}
      {sub === "development" && <DevelopmentView />}
      {sub === "training" && <TrainingView />}
      {sub === "injuries" && <InjuriesView />}
      {game && game.players.length === 0 && sub === "hub" && null}
    </div>
  );
}

function SquadHub() {
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

  /* Quick player switching: stepper follows the currently filtered + sorted list. */
  const selectedIndex = selectedId !== null ? squad.findIndex((p) => p.id === selectedId) : -1;
  const canStep = squad.length > 1 && selectedIndex !== -1;
  const sheetScrollRef = useRef<HTMLDivElement | null>(null);
  const step = useCallback(
    (delta: number) => {
      if (!canStep) return;
      const next = squad[(selectedIndex + delta + squad.length) % squad.length];
      setSelectedId(next.id);
      sheetScrollRef.current?.scrollTo({ top: 0 });
    },
    [canStep, squad, selectedIndex],
  );

  useEffect(() => {
    if (!canStep) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canStep, step]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  };

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
        <SheetContent
          side="bottom"
          className="max-h-[min(88dvh,88vh)] overflow-y-auto overscroll-contain scrollbar-thin touch-scroll rounded-t-2xl border-slate-800 bg-slate-900 p-0"
          ref={sheetScrollRef}
          onTouchStart={canStep ? onTouchStart : undefined}
          onTouchEnd={canStep ? onTouchEnd : undefined}
        >
          {selected && (
            <>
              <SheetHeader className="px-4 pt-3 pb-2 border-b border-slate-800">
                {canStep && (
                  <div role="group" aria-label="Player navigation" className="mb-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => step(-1)}
                      aria-label={`Previous player (${squad[(selectedIndex - 1 + squad.length) % squad.length].name})`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 active:bg-slate-800"
                    >
                      <ChevronLeft className="h-5 w-5" aria-hidden />
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Browse squad</p>
                      <p className="text-xs font-black tabular-nums text-slate-200">
                        {selectedIndex + 1} / {squad.length}
                      </p>
                      <p className="hidden text-[9px] text-slate-600 sm:block">Swipe or use ← → keys</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => step(1)}
                      aria-label={`Next player (${squad[(selectedIndex + 1) % squad.length].name})`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 active:bg-slate-800"
                    >
                      <ChevronRight className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                )}
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
                <PlayerClubActions player={selected} />
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

/* ================= v6.0 sub-screens ================= */

function DevelopmentView() {
  const game = useAppStore((s) => s.game);
  const update = useAppStore((s) => s.update);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [horizon, setHorizon] = useState<8 | 16 | 24>(16);
  const devScrollRef = useRef<HTMLDivElement | null>(null);
  const selected = selectedId !== null && game ? game.players.find((p) => p.id === selectedId) ?? null : null;

  const devList = useMemo(
    () => (game ? [...game.players].sort((a, b) => b.potential - a.potential) : []),
    [game],
  );
  const selectedIndex = selectedId !== null ? devList.findIndex((p) => p.id === selectedId) : -1;
  const canStep = devList.length > 1 && selectedIndex !== -1;

  const stepDev = useCallback(
    (delta: number) => {
      if (!canStep) return;
      const next = devList[(selectedIndex + delta + devList.length) % devList.length];
      setSelectedId(next.id);
      devScrollRef.current?.scrollTo({ top: 0 });
    },
    [canStep, devList, selectedIndex],
  );

  useEffect(() => {
    if (!canStep) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        stepDev(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepDev(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canStep, stepDev]);

  if (!game) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        Development centre. Tap a player to inspect his growth outlook, simulate the
        season under the current plan and tune focus, intensity, conversion and mentoring.
      </p>
      <ul className="space-y-1.5 max-h-[26rem] overflow-y-auto scrollbar-thin" aria-label="Development list">
        {devList.map((p) => {
          const gap = p.potential - p.overallRating;
          const minutes = p.id === selectedId ? 90 : game.lineup.includes(p.id) ? 90 : 25;
          const xp = estimateWeeklyXp(p, minutes, coachMultiplier(game.staff?.coachLevel));
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 text-left hover:border-slate-700 transition-colors"
                aria-label={`Development plan for ${p.name}, ${p.overallRating} of ${p.potential} potential`}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold w-11 text-center shrink-0", posBadgeClass(p.position))}>
                    {p.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-500">
                      Age {p.age} · {xp > 0 ? `~${xp.toFixed(1)} XP/wk` : "no growth left"}
                      {p.injuryWeeks > 0 && <span className="text-rose-400"> · injured {p.injuryWeeks}w</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-slate-100 leading-none">
                      {p.overallRating} <span className="text-[10px] text-slate-500">→ {p.potential}</span>
                    </p>
                    <p className={cn("text-[10px] font-semibold", gap > 6 ? "text-emerald-400" : gap > 0 ? "text-amber-400" : "text-slate-600")}>
                      {gap > 0 ? `${gap} to go` : "at ceiling"}
                    </p>
                  </div>
                </div>
                <Progress
                  value={(p.overallRating / Math.max(p.potential, 1)) * 100}
                  className="mt-2 h-1"
                  aria-label={`Progress to potential for ${p.name}`}
                />
                {(p.devPath || p.mentor || p.retrain) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.devPath && (
                      <Badge variant="outline" className="text-[9px] border-teal-600/40 text-teal-300">
                        {p.devPath.replace("-", " ")}
                      </Badge>
                    )}
                    {p.mentor && (
                      <Badge variant="outline" className="text-[9px] border-sky-500/40 text-sky-400">
                        mentored {p.mentor.weeksLeft}w
                      </Badge>
                    )}
                    {p.retrain && (
                      <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400">
                        →{p.retrain.target} {p.retrain.weeksLeft}w
                      </Badge>
                    )}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[min(90dvh,90vh)] overflow-y-auto overscroll-contain scrollbar-thin touch-scroll rounded-t-2xl border-slate-800 bg-slate-900 p-0"
          ref={devScrollRef}
        >
          {selected && (() => {
            const coachQ = coachMultiplier(game.staff?.coachLevel);
            const inLineup = game.lineup.includes(selected.id);
            const minutes = assumedMinutes(selected, inLineup);
            const mults = growthMultipliers(selected, minutes, coachQ);
            const xp = estimateWeeklyXp(selected, minutes, coachQ);
            const mentor = selected.mentor ? game.players.find((m) => m.id === selected.mentor!.mentorId) ?? null : null;
            const projection = projectGrowth(selected, horizon, { minutes, coachQ, mentor });
            const trajectory = projectTrajectory(selected, horizon, { minutes, coachQ, mentor });
            const roadmap = playStyleRoadmap(selected, computePlayStyles(selected));
            const setFocus = (focus: TrainingFocus) => {
              update((g) => {
                const p = g.players.find((x) => x.id === selected.id);
                if (p) p.trainingPlan = { ...p.trainingPlan, focus };
              });
            };
            const gainLabel = (attr: string) =>
              attr in GK_ATTR_LABELS ? GK_ATTR_LABELS[attr as keyof typeof GK_ATTR_LABELS] : attr.charAt(0).toUpperCase() + attr.slice(1);
            return (
              <>
                <SheetHeader className="px-4 pt-3 pb-2 border-b border-slate-800">
                  {canStep && (
                    <div role="group" aria-label="Player navigation" className="mb-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => stepDev(-1)}
                        aria-label={`Previous player (${devList[(selectedIndex - 1 + devList.length) % devList.length].name})`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 active:bg-slate-800"
                      >
                        <ChevronLeft className="h-5 w-5" aria-hidden />
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-1">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Browse development</p>
                        <p className="text-xs font-black tabular-nums text-slate-200">{selectedIndex + 1} / {devList.length}</p>
                        <p className="hidden text-[9px] text-slate-600 sm:block">Swipe or use ← → keys</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => stepDev(1)}
                        aria-label={`Next player (${devList[(selectedIndex + 1) % devList.length].name})`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 active:bg-slate-800"
                      >
                        <ChevronRight className="h-5 w-5" aria-hidden />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px] font-bold", posBadgeClass(selected.position))}>
                      {selected.position}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">Age {selected.age}</Badge>
                    {selected.injuryWeeks > 0 && (
                      <Badge variant="outline" className="text-[10px] border-rose-500/40 text-rose-400">Injured {selected.injuryWeeks}w</Badge>
                    )}
                  </div>
                  <SheetTitle className="text-left text-lg">{selected.name}</SheetTitle>
                  <SheetDescription className="text-left">Development centre · weekly growth engine</SheetDescription>
                </SheetHeader>

                <div className="p-4 space-y-4">
                  {/* growth outlook */}
                  <section aria-label="Growth outlook" className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Overall</p>
                        <p className="text-2xl font-black text-slate-50 leading-none">{selected.overallRating}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Gap</p>
                        <p className={cn("text-lg font-black leading-none", selected.potential - selected.overallRating > 0 ? "text-emerald-400" : "text-slate-600")}>
                          +{Math.max(0, selected.potential - selected.overallRating)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Potential</p>
                        <p className="text-2xl font-black text-emerald-400 leading-none">{selected.potential}</p>
                      </div>
                    </div>
                    <Progress
                      value={(selected.overallRating / Math.max(selected.potential, 1)) * 100}
                      className="mt-2.5 h-1.5"
                      aria-label="Progress toward potential"
                    />
                    <p className="mt-1.5 text-[10px] text-slate-500">
                      {xp > 0
                        ? <>Currently earning <span className="font-bold text-slate-300">~{xp.toFixed(1)} XP</span> per week{inLineup ? " (starting XI minutes)" : " (assumed squad minutes — play him to grow faster)"}.</>
                        : "At his potential ceiling — no further growth. Dynamic potential may shift at season end."}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1" aria-label="Weekly XP multipliers">
                      {mults.map((m) => (
                        <span
                          key={m.key}
                          className={cn(
                            "rounded-md border px-1.5 py-0.5 text-[9px] font-bold",
                            m.tone === "good" ? "border-emerald-500/40 text-emerald-400" : m.tone === "bad" ? "border-rose-500/40 text-rose-400" : "border-slate-700 text-slate-400",
                          )}
                          title={`×${m.value.toFixed(2)} weekly XP`}
                        >
                          {m.label} ×{m.value.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  </section>

                  {/* season projection */}
                  <section aria-label="Growth projection" className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Season projection
                      </p>
                      <div className="flex gap-1" role="group" aria-label="Projection horizon">
                        {([8, 16, 24] as const).map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => setHorizon(w)}
                            aria-pressed={horizon === w}
                            className={cn(
                              "min-h-[30px] rounded-lg border px-2 text-[10px] font-bold transition-colors",
                              horizon === w ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700",
                            )}
                          >
                            {w}w
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <p className="text-lg font-black text-slate-100">{projection.startOvr}</p>
                      <span className="text-xs text-slate-500">→</span>
                      <p className={cn("text-lg font-black", projection.projectedOvr > projection.startOvr ? "text-emerald-400" : "text-slate-400")}>
                        {projection.projectedOvr}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        in {horizon} weeks{projection.position !== selected.position ? ` · converts to ${projection.position}` : ""}
                      </span>
                    </div>
                    {projection.gains.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {projection.gains.map((g) => (
                          <span key={g.attr} className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                            {gainLabel(g.attr)} +{g.delta}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-[10px] text-slate-600">
                        No growth projected — raise sharpness, play minutes, or increase training intensity.
                      </p>
                    )}
                    <p className="mt-1.5 text-[9px] text-slate-600">
                      Deterministic simulation of the real growth engine at {minutes} min/wk. Change the plan below and the projection updates.
                    </p>
                  </section>

                  {/* v5.2 growth lab — OVR trajectory curve + road to next PlayStyle */}
                  <section aria-label="Growth lab" className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-teal-300" aria-hidden /> Growth lab
                    </p>
                    {(() => {
                      const W = 320; const H = 92; const PADX = 6; const PADY = 10;
                      const ceil = selected.potential;
                      const vals = trajectory.map((pt) => pt.ovr);
                      const lo = Math.min(...vals) - 1;
                      const hi = Math.max(...vals, ceil) + 1;
                      const x = (w: number) => PADX + (w / horizon) * (W - PADX * 2);
                      const y = (o: number) => PADY + (1 - (o - lo) / Math.max(1, hi - lo)) * (H - PADY * 2);
                      const path = trajectory.map((pt, i) => `${i === 0 ? "M" : "L"}${x(pt.week).toFixed(1)},${y(pt.ovr).toFixed(1)}`).join(" ");
                      const end = trajectory[trajectory.length - 1];
                      const gained = end.ovr - selected.overallRating;
                      return (
                        <div>
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">OVR trajectory · {horizon}w</p>
                            <p className={cn("text-[10px] font-black tabular-nums", gained > 0 ? "text-emerald-400" : "text-slate-500")}>
                              {selected.overallRating} → {end.ovr}{gained > 0 ? ` (+${gained})` : ""}
                            </p>
                          </div>
                          <svg
                            viewBox={`0 0 ${W} ${H}`}
                            className="mt-1.5 w-full"
                            role="img"
                            aria-label={`Projected overall rating curve over ${horizon} weeks, from ${selected.overallRating} to ${end.ovr}, potential ceiling ${selected.potential}`}
                          >
                            <line x1={PADX} x2={W - PADX} y1={y(ceil)} y2={y(ceil)} strokeDasharray="4 3" strokeWidth="1" className="stroke-emerald-500/40" />
                            <text x={W - PADX} y={Math.max(8, y(ceil) - 3)} textAnchor="end" fontSize="8" className="fill-emerald-500/70">POT {ceil}</text>
                            <path d={path} fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-teal-300" />
                            <circle cx={x(end.week)} cy={y(end.ovr)} r="2.5" className="fill-teal-300" />
                          </svg>
                        </div>
                      );
                    })()}

                    {!isGKAttributes(selected.attributes) && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Road to next PlayStyle</p>
                        {roadmap.length === 0 ? (
                          <p className="text-[10px] text-slate-600">Every PlayStyle is unlocked. Push attributes to 85 (and OVR 85 / POT 90) for Plus versions.</p>
                        ) : (
                          roadmap.slice(0, 2).map((item) => (
                            <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-200 truncate">{item.name}</p>
                                <p className="text-[10px] text-slate-500 truncate">
                                  {item.mainGap > 0 && `+${item.mainGap} ${item.mainAttrLabel}`}
                                  {item.mainGap > 0 && item.altGap > 0 && " · "}
                                  {item.altGap > 0 && `+${item.altGap} ${item.altAttrLabel}`}
                                  {" "}to unlock
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setFocus(item.suggestedFocus)}
                                className="shrink-0 min-h-[30px] rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                aria-label={`Set training focus to ${FOCUS_LABEL[item.suggestedFocus]} to work toward ${item.name}`}
                              >
                                Train {FOCUS_LABEL[item.suggestedFocus]}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </section>

                  <Separator className="bg-slate-800" />
                  <DevelopmentPanel player={selected} />
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TrainingView() {
  const game = useAppStore((s) => s.game);
  const update = useAppStore((s) => s.update);
  if (!game) return null;
  const balance = game.teamTraining?.balance ?? 50;
  const avgSharp = Math.round(game.players.reduce((s, p) => s + p.sharpness, 0) / Math.max(game.players.length, 1));
  const avgStamina = Math.round(game.players.reduce((s, p) => s + p.stamina, 0) / Math.max(game.players.length, 1));
  return (
    <div className="space-y-3">
      <section aria-label="Weekly training balance" className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">Weekly training balance</span>
          <span className="text-[10px] text-slate-500">{avgSharp} sharp · {avgStamina} fresh</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={balance}
          onChange={(e) => update((g) => { g.teamTraining.balance = Number(e.target.value); })}
          className="mt-3 w-full accent-emerald-500"
          aria-label="Training balance between energy recovery and performance"
        />
        <div className="mt-1 flex justify-between text-[10px] text-slate-500">
          <span>All Out Energy (recovery)</span>
          <span className="font-bold text-slate-300">{balance}</span>
          <span>All Out Performance (sharpness)</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 leading-snug">
          Energy bias recovers condition faster but match sharpness fades. Performance bias keeps players razor sharp but drains the tank.
        </p>
      </section>
      <section aria-label="Squad condition" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Squad condition</p>
        <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin">
          {[...game.players].sort((a, b) => a.stamina - b.stamina).map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-[11px]">
              <span className="w-28 truncate text-slate-300">{p.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden>
                <div className="h-full bg-emerald-500" style={{ width: `${p.stamina}%` }} />
              </div>
              <span className="w-8 text-right text-slate-400 tabular-nums">{p.stamina}</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden>
                <div className="h-full bg-amber-400" style={{ width: `${p.sharpness}%` }} />
              </div>
              <span className="w-8 text-right text-slate-400 tabular-nums">{p.sharpness}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-600">Green = condition · Amber = match sharpness</p>
      </section>
    </div>
  );
}

function InjuriesView() {
  const game = useAppStore((s) => s.game);
  if (!game) return null;
  const injured = game.players.filter((p) => p.injuryWeeks > 0).sort((a, b) => a.injuryWeeks - b.injuryWeeks);
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">
        Treatment room. Injured players are excluded from auto-pick until cleared.
      </p>
      {injured.length === 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <p className="text-xs font-semibold text-emerald-400">Full squad available</p>
          <p className="text-[11px] text-slate-500 mt-1">Nobody is on the treatment table. Enjoy it while it lasts.</p>
        </div>
      )}
      {injured.map((p) => (
        <div key={p.id} className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px] font-bold", posBadgeClass(p.position))}>{p.position}</Badge>
            <p className="text-xs font-bold text-slate-200 truncate flex-1">{p.name}</p>
            <Badge variant="outline" className="text-[10px] border-rose-500/40 text-rose-400">{p.injuryWeeks}w out</Badge>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {p.overallRating} OVR · {formatMoney(p.salary)}/w · value {formatMoney(p.marketValue)}
          </p>
        </div>
      ))}
    </div>
  );
}
