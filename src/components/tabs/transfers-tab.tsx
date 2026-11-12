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
import {
  assignGtn,
  cancelGtn,
  fireYouthScout,
  GTN_POSITION_GROUPS,
  hireYouthScout,
  queueScout,
  scoutCost,
  scoutEstimate,
  toggleShortlist,
  transferWindow,
  weekOfSeason,
  youthTournament,
  YOUTH_SCOUT_TIERS,
} from "@/lib/game/career";
import { ArrowDownUp, BadgeCheck, Briefcase, Eye, Filter, GraduationCap, Search, Star, X } from "lucide-react";

type GroupFilter = "ALL" | "GK" | "DEF" | "MID" | "ATT";
type SortKey = "ovr" | "value" | "age" | "potential";

const GROUPS: Record<Exclude<GroupFilter, "ALL">, string[]> = {
  GK: ["GK"],
  DEF: ["CB", "LB", "RB", "LWB", "RWB"],
  MID: ["CDM", "CM", "CAM", "LM", "RM", "LAM", "RAM"],
  ATT: ["LW", "RW", "LF", "RF", "CF", "ST"],
};

type TransferSubView = "market" | "hub" | "gtn" | "youth";

/** v6.0 — FC-style Transfers section: Market / Transfer Hub / GTN / Youth Academy. */
export function TransfersTab() {
  const [sub, setSub] = useState<TransferSubView>("market");

  const SUBS: { key: TransferSubView; label: string }[] = [
    { key: "market", label: "Market" },
    { key: "hub", label: "Transfer Hub" },
    { key: "gtn", label: "GTN" },
    { key: "youth", label: "Youth Academy" },
  ];

  return (
    <div className="space-y-3">
      <nav aria-label="Transfer sections" className="flex gap-1.5 overflow-x-auto scrollbar-thin -mx-1 px-1 pb-1">
        {SUBS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSub(key)}
            aria-pressed={sub === key}
            className={cn(
              "h-9 px-3 rounded-lg border text-xs font-semibold shrink-0 transition-colors min-h-[36px]",
              sub === key
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                : "border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200",
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      {sub === "market" && <MarketView />}
      {sub === "hub" && <TransferHubView />}
      {sub === "gtn" && <GtnView />}
      {sub === "youth" && <YouthAcademyView />}
    </div>
  );
}

function MarketView() {
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
                <button
                  type="button"
                  onClick={() => useAppStore.getState().update((g) => toggleShortlist(g, p.id))}
                  className="shrink-0"
                  aria-label={game.shortlist.includes(p.id) ? `Remove ${p.name} from shortlist` : `Shortlist ${p.name}`}
                >
                  <Star className={cn("h-4 w-4", game.shortlist.includes(p.id) ? "fill-amber-400 text-amber-400" : "text-slate-600 hover:text-slate-400")} aria-hidden />
                </button>
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
                {target.teamId !== -1 && (
                  <Button
                    variant="outline"
                    className="flex-1 border-sky-600/50 text-sky-400 font-bold"
                    onClick={() => {
                      const res = useAppStore.getState().doLoanInPlayer(target.id);
                      setTarget(null);
                      if (!res.ok) { setBuySuccess(null); setBuyError(res.message); } else { setBuyError(null); setBuySuccess(res.message); }
                    }}
                    aria-label={`Loan in ${target.name} for 12 weeks`}
                  >
                    Loan in
                  </Button>
                )}
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

/* ================= v6.0 sub-screens ================= */

function TransferHubView() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const doSellPlayer = useAppStore((s) => s.doSellPlayer);
  const [msg, setMsg] = useState<string | null>(null);
  if (!game || !dataset) return null;

  const teamLabel = (teamId: number) => {
    if (teamId === -1) return "Free Agent";
    return dataset.teams.find((t) => t.id === teamId)?.shortName ?? "???";
  };
  const shortlisted = game.shortlist
    .map((id) => dataset.players.find((p) => p.id === id))
    .filter((p): p is PlayerRow => Boolean(p));
  const listed = game.players.filter((p) => game.transferListedIds.includes(p.id));
  const loanListed = game.players.filter((p) => game.loanListedIds.includes(p.id));
  const incomingBids = game.inbox.filter((m) => m.kind === "bid" && !m.resolvedOptionId);

  return (
    <div className="space-y-3">
      {msg && <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">{msg}</p>}

      {/* incoming bids */}
      <section aria-label="Incoming bids">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5" aria-hidden /> Incoming offers ({incomingBids.length})
        </h2>
        {incomingBids.length === 0 ? (
          <p className="text-[11px] text-slate-600">No live bids. Put players on the transfer list to attract offers.</p>
        ) : (
          <div className="space-y-2">
            {incomingBids.map((b) => (
              <div key={b.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs font-bold text-slate-100">{b.title}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{b.body}</p>
                <p className="mt-1.5 text-[10px] text-amber-400">Answer in the Central inbox.</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* transfer list */}
      <section aria-label="Transfer list">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">On the transfer list ({listed.length})</h2>
        {listed.length === 0 ? (
          <p className="text-[11px] text-slate-600">Nobody listed. Mark players in their Squad Hub profile.</p>
        ) : (
          <ul className="space-y-1.5">
            {listed.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold w-11 text-center shrink-0", posBadgeClass(p.position))}>{p.position}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-500">{p.overallRating} OVR · value {formatMoney(p.marketValue)}</p>
                </div>
                <Button size="sm" variant="outline" className="h-8 border-rose-500/40 text-rose-400" onClick={() => { const r = doSellPlayer(p.id); setMsg(r.message); }} aria-label={`Sell ${p.name}`}>
                  Sell now
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* loan list */}
      <section aria-label="Loan list">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">On the loan list ({loanListed.length})</h2>
        {loanListed.length === 0 ? (
          <p className="text-[11px] text-slate-600">Nobody available for loan. Youngters benefit most from a spell elsewhere.</p>
        ) : (
          <ul className="space-y-1.5">
            {loanListed.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold w-11 text-center shrink-0", posBadgeClass(p.position))}>{p.position}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-500">{p.age}y · {p.overallRating} OVR · waiting for a loan club</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* active loans */}
      <section aria-label="Active loans">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Active loans ({game.loans.length})</h2>
        {game.loans.length === 0 ? (
          <p className="text-[11px] text-slate-600">No players out or in on loan.</p>
        ) : (
          <ul className="space-y-1.5">
            {game.loans.map((l) => (
              <li key={l.id} className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
                <Badge variant="outline" className={cn("text-[9px] shrink-0", l.direction === "out" ? "border-slate-600 text-slate-400" : "border-sky-600/50 text-sky-400")}>
                  {l.direction === "out" ? "OUT" : "IN"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100 truncate">{l.playerName}</p>
                  <p className="text-[11px] text-slate-500">
                    {l.direction === "out" ? `at ${teamLabel(l.partnerTeamId)}` : `from ${teamLabel(l.partnerTeamId)}`} · {l.weeksLeft}w left
                  </p>
                </div>
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold shrink-0", posBadgeClass(l.position))}>{l.position}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* shortlist */}
      <section aria-label="Shortlist">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Shortlist ({shortlisted.length})</h2>
        {shortlisted.length === 0 ? (
          <p className="text-[11px] text-slate-600">Tap the star on any market player to shortlist him.</p>
        ) : (
          <ul className="space-y-1.5">
            {shortlisted.map((p) => {
              const scouted = game.scoutedIds.includes(p.id);
              return (
                <li key={p.id} className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400 shrink-0" aria-hidden />
                  <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold w-11 text-center shrink-0", posBadgeClass(p.position))}>{p.position}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {teamLabel(p.teamId)} · Age {p.age} · {scouted ? `${p.overallRating} OVR / ${p.potential} POT` : "unscouted"} · {formatMoney(p.marketValue)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-slate-700 text-slate-400"
                    onClick={() => useAppStore.getState().update((g) => toggleShortlist(g, p.id))}
                    aria-label={`Remove ${p.name} from shortlist`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function GtnView() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const [group, setGroup] = useState<string>("ATT");
  const [maxAge, setMaxAge] = useState(24);
  if (!game || !dataset) return null;

  const reports = game.gtnReport
    .map((r) => ({ ...r, player: dataset.players.find((p) => p.id === r.playerId) }))
    .filter((r): r is typeof r & { player: PlayerRow } => Boolean(r.player));
  const full = game.gtn.length >= 3;

  return (
    <div className="space-y-3">
      <section aria-label="GTN assignments" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Global Transfer Network</h2>
        <p className="text-[11px] text-slate-500 mb-2">
          Send the scouting network after a player profile. Each assignment takes 3 weeks, costs {formatMoney(60000)} a week and unlocks full dossiers for the findings.
        </p>
        {game.gtn.length === 0 ? (
          <p className="text-[11px] text-slate-600">No active assignments.</p>
        ) : (
          <ul className="space-y-1.5 mb-3">
            {game.gtn.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                <Badge variant="outline" className="text-[10px] border-emerald-600/40 text-emerald-400 shrink-0">
                  {GTN_POSITION_GROUPS.find((g) => g.id === a.positionGroup)?.label ?? a.positionGroup}
                </Badge>
                <span className="text-[11px] text-slate-400 flex-1">max age {a.maxAge}</span>
                <span className="text-[11px] text-amber-400 shrink-0">{a.weeksLeft}w left</span>
                <Button size="sm" variant="ghost" className="h-7 text-[10px] text-slate-500" onClick={() => useAppStore.getState().update((g) => cancelGtn(g, a.id))} aria-label="Cancel assignment">
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {GTN_POSITION_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              aria-pressed={group === g.id}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-[11px] font-bold min-h-[32px]",
                group === g.id ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400" : "border-slate-800 text-slate-400",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-500 flex-1">
            Max age: <span className="font-mono text-slate-300">{maxAge}</span>
            <input type="range" min={17} max={35} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} className="w-full accent-emerald-500" aria-label="Maximum age for GTN search" />
          </label>
          <Button
            size="sm"
            className="h-9 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
            disabled={full}
            onClick={() => useAppStore.getState().update((g) => { assignGtn(g, group as "GK" | "DEF" | "MID" | "ATT", maxAge); })}
            aria-label="Start GTN assignment"
          >
            {full ? "Network busy (3/3)" : "Send scouts"}
          </Button>
        </div>
      </section>

      <section aria-label="GTN report">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Latest findings ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="text-[11px] text-slate-600">No reports yet. Assignments return findings every 3 weeks.</p>
        ) : (
          <ul className="space-y-1.5">
            {reports.map((r) => (
              <li key={r.playerId} className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold w-11 text-center shrink-0", posBadgeClass(r.player.position))}>{r.player.position}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100 truncate">{r.player.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {dataset.teams.find((t) => t.id === r.player.teamId)?.shortName ?? "???"} · Age {r.player.age} · {r.player.overallRating} OVR / {r.player.potential} POT
                  </p>
                </div>
                <span className="text-[10px] text-slate-600 shrink-0">Wk {r.week}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function YouthAcademyView() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const [msg, setMsg] = useState<string | null>(null);
  if (!game || !dataset) return null;

  const prospects = game.players.filter((p) => p.age <= 19).sort((a, b) => b.potential - a.potential);
  const week = weekOfSeason(game);
  const tourDone = game.lastYouthTourWeek === week;
  const tw = transferWindow(week);
  void tw;

  return (
    <div className="space-y-3">
      {msg && <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">{msg}</p>}

      <section aria-label="Youth staff" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5" aria-hidden /> Youth staff ({game.youthScouts.length}/3)
        </h2>
        <p className="text-[11px] text-slate-500 mb-2">Scouts boost the yearly intake quality and add an extra prospect at high quality totals.</p>
        {game.youthScouts.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {game.youthScouts.map((sc) => (
              <li key={sc.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 shrink-0">
                  {YOUTH_SCOUT_TIERS.find((t) => t.quality === sc.quality)?.label}
                </Badge>
                <span className="text-[11px] text-slate-300 flex-1 truncate">{sc.name}</span>
                <span className="text-[11px] text-slate-500 shrink-0">{formatMoney(sc.weeklyWage)}/w</span>
                <Button size="sm" variant="ghost" className="h-7 text-[10px] text-rose-400" onClick={() => useAppStore.getState().update((g) => fireYouthScout(g, sc.id))} aria-label={`Release scout ${sc.name}`}>
                  Release
                </Button>
              </li>
            ))}
          </ul>
        )}
        {game.youthScouts.length < 3 && (
          <div className="flex flex-wrap gap-1.5">
            {YOUTH_SCOUT_TIERS.map((t) => (
              <Button
                key={t.quality}
                size="sm"
                variant="outline"
                className="h-9 border-slate-700 text-[11px]"
                onClick={() => {
                  const ok = useAppStore.getState().update((g) => hireYouthScout(g, t.quality));
                  void ok;
                  setMsg(`${t.label} hired (${formatMoney(t.wage)}/w)`);
                }}
                aria-label={`Hire ${t.label} for ${formatMoney(t.wage)} per week`}
              >
                Hire {t.label} · {formatMoney(t.wage)}/w
              </Button>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Youth squad" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Youth squad ({prospects.length})</h2>
        {prospects.length === 0 ? (
          <p className="text-[11px] text-slate-600">No U20 players yet. The yearly intake arrives at season end.</p>
        ) : (
          <ul className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin">
            {prospects.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold w-11 text-center shrink-0", posBadgeClass(p.position))}>{p.position}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100 truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-500">{p.age}y · {p.overallRating} OVR · POT {p.potential} · {formatMoney(p.salary)}/w</p>
                </div>
                <span className="text-[10px] text-slate-600 shrink-0">{p.seasonStats.apps} apps</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Youth tournament" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Youth tournament (5v5 Rush)</h2>
        <p className="text-[11px] text-slate-500 mb-2">Weekly academy event: young players gain sharpness and morale. One per week.</p>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-10 border-emerald-600/50 text-emerald-400 font-bold"
          disabled={tourDone || prospects.length < 3}
          onClick={() => {
            let message = "";
            useAppStore.getState().update((g) => { message = youthTournament(g).message; });
            setMsg(message);
          }}
          aria-label="Play youth tournament"
        >
          {tourDone ? "Played this week" : prospects.length < 3 ? "Need 3+ U20 players" : "Play the tournament"}
        </Button>
      </section>
    </div>
  );
}
