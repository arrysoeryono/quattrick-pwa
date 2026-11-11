"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatMoney, formatWage, posBadgeClass } from "@/lib/format";
import { ALL_POSITIONS, type PlayerRow } from "@/lib/game/types";
import { queueScout, scoutCost, scoutEstimate } from "@/lib/game/career";
import { ArrowDownUp, BadgeCheck, Eye, Filter, Search, X } from "lucide-react";

type GroupFilter = "ALL" | "GK" | "DEF" | "MID" | "ATT";
type SortKey = "ovr" | "value" | "age" | "potential";

const GROUPS: Record<Exclude<GroupFilter, "ALL">, string[]> = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CDM", "CM", "CAM", "LM", "RM", "LAM", "RAM"],
  ATT: ["LW", "RW", "LF", "RF", "CF", "ST"],
};

export function TransfersTab() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const doBuyPlayer = useAppStore((s) => s.doBuyPlayer);
  const doSellPlayer = useAppStore((s) => s.doSellPlayer);

  const [filter, setFilter] = useState<GroupFilter>("ALL");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ovr");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [target, setTarget] = useState<PlayerRow | null>(null);
  const [selling, setSelling] = useState<PlayerRow | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [exactPos, setExactPos] = useState<string>("ALL");
  const [minAge, setMinAge] = useState(15);
  const [maxAge, setMaxAge] = useState(45);
  const [minPot, setMinPot] = useState(0);
  const [freeOnly, setFreeOnly] = useState(false);
  const [affordableOnly, setAffordableOnly] = useState(false);

  const market = useMemo(() => {
    if (!dataset || !game) return [];
    let list = dataset.players.filter((p) => p.teamId !== game.clubId);
    if (filter !== "ALL") list = list.filter((p) => GROUPS[filter].includes(p.position));
    if (exactPos !== "ALL") list = list.filter((p) => p.position === exactPos);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (maxPrice !== null) list = list.filter((p) => (p.teamId === -1 ? 0 : p.marketValue) <= maxPrice);
    list = list.filter((p) => p.age >= minAge && p.age <= maxAge);
    list = list.filter((p) => p.potential >= minPot);
    if (freeOnly) list = list.filter((p) => p.teamId === -1);
    if (affordableOnly) list = list.filter((p) => (p.teamId === -1 ? 0 : p.marketValue) <= game.transferBudget);
    list.sort((a, b) => {
      switch (sortKey) {
        case "value": return b.marketValue - a.marketValue;
        case "age": return a.age - b.age;
        case "potential": return b.potential - a.potential;
        default: return b.overallRating - a.overallRating;
      }
    });
    return list;
  }, [dataset, game, filter, query, sortKey, maxPrice, exactPos, minAge, maxAge, minPot, freeOnly, affordableOnly]);

  if (!game || !dataset) return null;
  const visible = showAll ? market : market.slice(0, 40);
  const mySquadSorted = [...game.players].sort((a, b) => b.overallRating - a.overallRating);

  const teamLabel = (teamId: number) => {
    if (teamId === -1) return "Free Agent";
    return dataset.teams.find((t) => t.id === teamId)?.shortName ?? "???";
  };

  const confirmBuy = () => {
    if (!target) return;
    const res = doBuyPlayer(target.id);
    setTarget(null);
    if (!res.ok) {
      setBuySuccess(null);
      setBuyError(res.message);
    } else {
      setBuyError(null);
      setBuySuccess(res.message);
    }
  };

  const confirmSell = () => {
    if (!selling) return;
    const res = doSellPlayer(selling.id);
    setSelling(null);
    if (res.ok) {
      setBuyError(null);
      setBuySuccess(res.message);
    }
  };

  return (
    <div className="space-y-3">
      {/* budget header */}
      <section aria-label="Transfer budget" className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Transfer budget</p>
          <p className="text-lg font-black text-emerald-400">{formatMoney(game.transferBudget)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Wage room / week</p>
          <p className="text-lg font-black text-slate-200">
            {formatMoney(Math.max(0, game.wageBudget - game.players.reduce((s, p) => s + p.salary, 0)))}
          </p>
        </div>
      </section>

      {buyError && (
        <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-300">{buyError}</p>
      )}
      {buySuccess && (
        <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">{buySuccess}</p>
      )}

      {/* search + filters */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search market..."
          className="pl-9 bg-slate-950 border-slate-800"
          aria-label="Search transfer market"
        />
      </div>

      <div className="flex gap-1.5" role="group" aria-label="Position filter">
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

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-pressed={showFilters}
          aria-label="Toggle advanced market filters"
          className={cn(
            "flex items-center gap-1 rounded-lg border px-3 min-h-[32px] text-[11px] font-semibold shrink-0 transition-colors",
            showFilters ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-slate-800 bg-slate-950/40 text-slate-400",
          )}
        >
          <Filter className="h-3 w-3" aria-hidden /> Filters
        </button>
        <button
          type="button"
          onClick={() => setSortKey(sortKey === "ovr" ? "value" : sortKey === "value" ? "potential" : sortKey === "potential" ? "age" : "ovr")}
          className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/40 px-3 min-h-[32px] text-[11px] font-semibold text-slate-300 shrink-0"
          aria-label="Cycle sort order"
        >
          <ArrowDownUp className="h-3 w-3 text-emerald-400" aria-hidden />
          {sortKey === "ovr" ? "Overall" : sortKey === "value" ? "Value" : sortKey === "potential" ? "Potential" : "Age"}
        </button>
        <Select
          value={maxPrice === null ? "any" : String(maxPrice)}
          onValueChange={(v) => setMaxPrice(v === "any" ? null : Number(v))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Maximum transfer price"
            className={cn(
              "flex-1 w-auto min-w-0 rounded-lg text-[11px] font-semibold",
              maxPrice !== null
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                : "border-slate-800 bg-slate-950/40 text-slate-400",
            )}
          >
            <SelectValue placeholder="Price limit" />
          </SelectTrigger>
          <SelectContent className="border-slate-800 bg-slate-950 text-slate-200">
            <SelectItem value="any" className="text-[11px]">Any price</SelectItem>
            <SelectItem value="5000000" className="text-[11px]">≤ {formatMoney(5000000)}</SelectItem>
            <SelectItem value="15000000" className="text-[11px]">≤ {formatMoney(15000000)}</SelectItem>
            <SelectItem value="50000000" className="text-[11px]">≤ {formatMoney(50000000)}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showFilters && (
        <section aria-label="Advanced market filters" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Exact position</p>
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
            <label className="text-[10px] text-slate-500 col-span-2">
              Min POT: <span className="font-mono text-slate-300">{minPot}</span>
              <input type="range" min={0} max={99} value={minPot} onChange={(e) => setMinPot(Number(e.target.value))} className="w-full accent-emerald-500" aria-label="Minimum potential" />
            </label>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={() => setFreeOnly((v) => !v)} aria-pressed={freeOnly} className={cn("rounded-md border px-2 py-1 text-[10px] font-bold", freeOnly ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-slate-800 text-slate-400")}>Free agents</button>
            <button type="button" onClick={() => setAffordableOnly((v) => !v)} aria-pressed={affordableOnly} className={cn("rounded-md border px-2 py-1 text-[10px] font-bold", affordableOnly ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-slate-800 text-slate-400")}>Within budget</button>
            <button
              type="button"
              onClick={() => { setExactPos("ALL"); setMinAge(15); setMaxAge(45); setMinPot(0); setFreeOnly(false); setAffordableOnly(false); }}
              className="rounded-md border border-rose-500/40 text-rose-400 px-2 py-1 text-[10px] font-bold ml-auto"
              aria-label="Clear advanced filters"
            >
              <X className="h-3 w-3 inline mr-0.5" aria-hidden />Clear
            </button>
          </div>
        </section>
      )}

      {/* market list */}
      <div>
        <ul className="space-y-1.5" aria-label="Transfer market list">
          {visible.map((p) => {
            const price = p.teamId === -1 ? 0 : p.marketValue;
            const affordable = price <= game.transferBudget;
            return (
              <li key={p.id} className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold w-11 text-center shrink-0", posBadgeClass(p.position))}>
                  {p.position}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {teamLabel(p.teamId)} · Age {p.age} · {formatWage(p.salary)}
                    {game.scoutedIds.includes(p.id) ? "" : " · unscouted"}
                  </p>
                </div>
                <div className="text-right shrink-0 mr-1">
                  {game.scoutedIds.includes(p.id) ? (
                    <>
                      <p className="text-base font-black text-slate-100 leading-none">{p.overallRating}</p>
                      <p className="text-[10px] text-emerald-400 font-semibold">POT {p.potential}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm leading-none text-amber-400" aria-label={`${scoutEstimate(p)} star estimate`}>{"★".repeat(scoutEstimate(p))}</p>
                      <p className="text-[9px] text-slate-600">estimate</p>
                    </>
                  )}
                </div>
                {!game.scoutedIds.includes(p.id) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 border-sky-600/50 text-sky-400 font-bold"
                    disabled={game.scoutingQueue.some((s) => s.playerId === p.id) || game.scoutingQueue.length >= 3 || game.transferBudget < scoutCost(p)}
                    onClick={() => {
                      useAppStore.getState().update((g) => {
                        if (queueScout(g, p.id)) g.transferBudget -= scoutCost(p);
                      });
                    }}
                    aria-label={`Send scout to observe ${p.name} for ${formatMoney(scoutCost(p))}`}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" aria-hidden />
                    {game.scoutingQueue.some((s) => s.playerId === p.id) ? "Scouting" : formatMoney(scoutCost(p))}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 shrink-0 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                    onClick={() => setTarget(p)}
                    aria-label={`Buy ${p.name} for ${formatMoney(price)}`}
                  >
                    {price === 0 ? "Free" : formatMoney(price)}
                  </Button>
                )}
              </li>
            );
          })}
          {market.length === 0 && <li className="py-8 text-center text-xs text-slate-600">No players match your filters.</li>}
        </ul>
        {!showAll && market.length > 40 && (
          <Button variant="outline" className="mt-2 w-full border-slate-700 text-slate-300" onClick={() => setShowAll(true)}>
            Show all {market.length} players
          </Button>
        )}
      </div>

      {/* my squad quick sell */}
      <section aria-label="Sell players">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Sell from squad (90% value)</h2>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1">
          {mySquadSorted.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelling(p)}
              className="shrink-0 w-24 rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-left hover:border-rose-500/50 transition-colors"
              aria-label={`Sell ${p.name}`}
            >
              <p className="text-[11px] font-semibold text-slate-200 truncate">{p.name}</p>
              <p className="text-[10px] text-slate-500">{p.position} · {p.overallRating} OVR</p>
              <p className="text-[10px] font-bold text-amber-400">{formatMoney(Math.round(p.marketValue * 0.9))}</p>
            </button>
          ))}
        </div>
      </section>

      {/* buy confirm dialog */}
      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-[380px]">
          {target && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">Confirm transfer</DialogTitle>
                <DialogDescription className="text-left">
                  Sign <strong className="text-slate-200">{target.name}</strong> ({target.position}, OVR {target.overallRating}, POT {target.potential}) from {teamLabel(target.teamId)}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Fee</span><span className="font-bold text-slate-200">{target.teamId === -1 ? "Free transfer" : formatMoney(target.marketValue)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Weekly wage</span><span className="font-bold text-slate-200">{formatWage(target.salary)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Contract</span><span className="font-bold text-slate-200">3 years</span></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-slate-700" onClick={() => setTarget(null)}>Cancel</Button>
                <Button
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                  onClick={confirmBuy}
                  disabled={(target.teamId === -1 ? 0 : target.marketValue) > game.transferBudget}
                  aria-label="Confirm signing"
                >
                  <BadgeCheck className="h-4 w-4 mr-1.5" aria-hidden />
                  Sign player
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* sell confirm dialog */}
      <Dialog open={selling !== null} onOpenChange={(o) => !o && setSelling(null)}>
        <DialogContent className="max-w-[380px]">
          {selling && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">Sell {selling.name}?</DialogTitle>
                <DialogDescription className="text-left">
                  You will receive {formatMoney(Math.round(selling.marketValue * 0.9))} (90% of {formatMoney(selling.marketValue)}). The player leaves immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-slate-700" onClick={() => setSelling(null)}>Cancel</Button>
                <Button variant="destructive" className="flex-1 font-bold" onClick={confirmSell} aria-label="Confirm sale">
                  Sell player
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
