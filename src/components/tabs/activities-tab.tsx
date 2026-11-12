"use client";

import { useMemo } from "react";
import { Dumbbell, Lightbulb, ShoppingBag, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { useAppStore } from "@/lib/store/gameStore";
import { LIFESTYLE_ITEMS, answerProDecision, buyProItem } from "@/lib/game/playerCareer";
import { PLAYSTYLES } from "@/lib/game/development";
import { formatMoney, ratingColor } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GRADE_STYLE: Record<string, string> = {
  A: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  B: "border-teal-500/30 bg-teal-500/10 text-teal-400",
  C: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  D: "border-rose-500/30 bg-rose-500/10 text-rose-400",
};

const TRAIT_TONE: Record<string, string> = {
  Maverick: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  Virtuoso: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Heartbeat: "border-teal-500/30 bg-teal-500/10 text-teal-400",
};

function TraitChip({ trait, value }: { trait: string; value: number }) {
  const pos = value > 0;
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
        pos ? TRAIT_TONE[trait] ?? "border-slate-700 text-slate-300" : "border-rose-500/30 bg-rose-500/10 text-rose-400",
      )}
    >
      {trait} {pos ? "+" : ""}
      {value}
    </span>
  );
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-900/60 px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-black text-slate-200">{value}</p>
    </div>
  );
}

export function ActivitiesTab() {
  const game = useAppStore((s) => s.game);
  const update = useAppStore((s) => s.update);
  const { toast } = useToast();

  const player = useMemo(
    () => (game?.pro ? game.players.find((p) => p.id === game.pro!.playerId) ?? null : null),
    [game],
  );

  if (!game) return null;

  if (!game.pro || !player) {
    return (
      <section aria-label="Player career unavailable" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Activities</h2>
        <p className="mt-1.5 text-sm text-slate-400">
          Player Career only. Start a Be a Pro save to manage your Pro&apos;s life here.
        </p>
      </section>
    );
  }

  const pro = game.pro;
  const decision = pro.pendingDecision;
  const drills = game.preMatchDrills;
  const myGrants = drills ? drills.grants.filter((g) => g.playerId === pro.playerId) : [];
  const season = player.seasonStats;
  const seasonAvg = season.apps > 0 ? season.ratingSum / season.apps : 0;
  const career = player.careerStats;

  /** update() executes the mutator synchronously, so msg is set before the toast fires. */
  const answer = (optionId: string) => {
    update((g) => {
      answerProDecision(g, optionId);
    });
    toast({ title: "Decision made", description: "Personality profile updated" });
  };

  const buy = (itemId: string) => {
    let msg = "";
    update((g) => {
      const r = buyProItem(g, itemId);
      msg = r.message;
    });
    if (msg) toast({ title: msg });
  };

  return (
    <div className="space-y-4">
      {/* Wallet */}
      <section aria-label="Wallet" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Wallet className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Savings
          </p>
          <span className="text-xl font-black text-emerald-400">{formatMoney(pro.wallet)}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">+30% of salary every week</p>
      </section>

      {/* Weekly decision */}
      {decision ? (
        <section aria-label="Weekly decision" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
            <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Weekly decision
          </p>
          <p className="mt-1.5 text-sm font-bold text-slate-100">{decision.title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{decision.body}</p>
          <div className="mt-2.5 space-y-2">
            {decision.options.map((opt) => (
              <div key={opt.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                <p className="text-[11px] font-semibold text-slate-200">{opt.label}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {opt.maverick !== 0 && <TraitChip trait="Maverick" value={opt.maverick} />}
                  {opt.virtuoso !== 0 && <TraitChip trait="Virtuoso" value={opt.virtuoso} />}
                  {opt.heartbeat !== 0 && <TraitChip trait="Heartbeat" value={opt.heartbeat} />}
                  {opt.wallet !== 0 && (
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                        opt.wallet > 0
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-400",
                      )}
                    >
                      {opt.wallet > 0 ? "+" : "-"}
                      {formatMoney(Math.abs(opt.wallet))}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 w-full border-emerald-600/50 bg-transparent text-[11px] text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                  onClick={() => answer(opt.id)}
                  aria-label={`Choose: ${opt.label}`}
                >
                  Choose
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section aria-label="Weekly decision" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Lightbulb className="h-3.5 w-3.5 text-slate-600" aria-hidden /> Weekly decision
          </p>
          <p className="mt-1 text-[11px] text-slate-500">No decisions this week. Train hard.</p>
        </section>
      )}

      {/* Training / pre-match drills */}
      <section aria-label="Training" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Dumbbell className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Training
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Pre-match drills are run from Central before kickoff — open Match Center to complete them.
        </p>
        {drills ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {drills.grades.map((g, i) => (
                <span
                  key={`${g.drill}-${i}`}
                  className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold", GRADE_STYLE[g.grade] ?? "border-slate-700 text-slate-300")}
                >
                  {g.drill}: {g.grade}
                </span>
              ))}
            </div>
            {myGrants.length > 0 ? (
              <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <Sparkles className="h-3 w-3" aria-hidden />
                PlayStyle unlocked: {myGrants.map((g) => PLAYSTYLES.find((s) => s.id === g.styleId)?.name ?? g.styleId).join(", ")}
              </p>
            ) : (
              <p className="text-[10px] text-slate-600">
                {drills.grants.length > 0
                  ? `${drills.grants.length} squad PlayStyle grant${drills.grants.length === 1 ? "" : "s"} this session.`
                  : "No PlayStyle grants this session."}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-slate-600">No drill results yet this week.</p>
        )}
      </section>

      {/* Lifestyle store */}
      <section aria-label="Lifestyle store">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <ShoppingBag className="h-3.5 w-3.5 text-amber-400" aria-hidden /> Lifestyle store
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {LIFESTYLE_ITEMS.map((item) => {
            const owned = pro.items.includes(item.id);
            const affordable = pro.wallet >= item.cost;
            return (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl border p-3",
                  owned ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800 bg-slate-950/40",
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="min-w-0 truncate text-[11px] font-bold text-slate-200">{item.name}</p>
                  {owned && (
                    <Badge className="shrink-0 border-emerald-500/40 bg-emerald-500/15 text-[9px] text-emerald-400">
                      Owned
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-500">{item.desc}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {item.personality.maverick !== 0 && <TraitChip trait="Maverick" value={item.personality.maverick} />}
                  {item.personality.virtuoso !== 0 && <TraitChip trait="Virtuoso" value={item.personality.virtuoso} />}
                  {item.personality.heartbeat !== 0 && <TraitChip trait="Heartbeat" value={item.personality.heartbeat} />}
                </div>
                <p className="mt-1.5 text-xs font-black text-amber-400">{formatMoney(item.cost)}</p>
                <Button
                  size="sm"
                  className="mt-1.5 h-7 w-full bg-emerald-600 text-[11px] font-semibold text-white hover:bg-emerald-500"
                  disabled={owned || !affordable}
                  onClick={() => buy(item.id)}
                  aria-label={owned ? `${item.name} owned` : `Buy ${item.name} for ${formatMoney(item.cost)}`}
                >
                  {owned ? "Owned" : affordable ? "Buy" : "Not enough"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Career stats */}
      <section aria-label="Career statistics" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Career stats
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <StatCell label="Apps" value={season.apps} />
          <StatCell label="Goals" value={season.goals} />
          <StatCell label="Assists" value={season.assists} />
          <StatCell label="Avg" value={season.apps > 0 ? seasonAvg.toFixed(2) : "-"} />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-900/60 px-2.5 py-1.5 text-[11px]">
          <span className="text-slate-500">Career total</span>
          <span className="font-semibold text-slate-300">
            {career.apps} apps · {career.goals} goals · {career.assists} assists
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-0.5 text-[11px]">
          <span className="text-slate-500">Last match rating</span>
          {pro.lastMatchRating !== null ? (
            <span className={cn("font-bold", ratingColor(pro.lastMatchRating))}>
              {pro.lastMatchRating.toFixed(1)}
            </span>
          ) : (
            <span className="text-slate-600">No match played</span>
          )}
        </div>
      </section>
    </div>
  );
}
