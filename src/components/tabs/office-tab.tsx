"use client";

/**
 * Office tab — board room, finances, staff, job offers, career history, settings.
 * v6.0 FC Career Mode expansion.
 */

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { MoreTab } from "@/components/tabs/more-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CURRENCIES, formatDate, formatMoney, formatWage, ordinal, setCurrency } from "@/lib/format";
import { uid, weekOfSeason } from "@/lib/game/career";
import { COACH_LEVELS } from "@/lib/game/advance";
import { DIFFICULTY_META, type Currency, type Difficulty, type JobOffer } from "@/lib/game/types";
import { Briefcase, Landmark, Star, Trophy, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- shared style tokens ---------- */
const CARD = "rounded-xl border border-slate-800 bg-slate-950/40 p-3";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-slate-500";
const OPT_BASE =
  "rounded-lg border px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40";
const OPT_ACTIVE = "border-emerald-500/60 bg-emerald-500/10 text-emerald-300";
const OPT_IDLE = "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700";

/* ---------- staff option tables ---------- */
const COACH_KEYS = ["Novice", "Accomplished", "Expert"] as const;
type CoachKey = (typeof COACH_KEYS)[number];

const LINE_COACHES: { key: "gk" | "def" | "mid" | "att"; label: string }[] = [
  { key: "gk", label: "Goalkeepers" },
  { key: "def", label: "Defence" },
  { key: "mid", label: "Midfield" },
  { key: "att", label: "Attack" },
];
const LINE_LEVEL_LABELS = ["None", "I", "II", "III"];
const LINE_LEVEL_COST = 6000;

const DIFFICULTY_ORDER: Difficulty[] = ["amateur", "pro", "legend"];

const CUP_TARGET_LABEL: Record<string, string> = {
  win: "Win the cup",
  final: "Reach the final",
  none: "No cup target",
};

/* ---------- helpers ---------- */

/** rep (0-100) -> 0-5 stars, rounded to the nearest half. */
function repToStars(rep: number): number {
  return Math.min(5, Math.max(0, Math.round((rep / 20) * 2) / 2));
}

function StarRating({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, value - i));
        if (fill >= 1) {
          return <Star key={i} className="h-4 w-4 text-emerald-400" fill="currentColor" strokeWidth={0} aria-hidden />;
        }
        if (fill > 0) {
          return (
            <span key={i} className="relative inline-block h-4 w-4" aria-hidden>
              <Star className="absolute left-0 top-0 h-4 w-4 text-slate-700" />
              <span className="absolute left-0 top-0 h-4 w-1/2 overflow-hidden">
                <Star className="h-4 w-4 text-emerald-400" fill="currentColor" strokeWidth={0} />
              </span>
            </span>
          );
        }
        return <Star key={i} className="h-4 w-4 text-slate-700" aria-hidden />;
      })}
    </div>
  );
}

function confidenceTone(v: number): { label: string; bar: string } {
  if (v >= 70) return { label: "The board loves you", bar: "[&>div]:bg-emerald-500" };
  if (v >= 45) return { label: "Keep winning", bar: "[&>div]:bg-amber-500" };
  if (v >= 25) return { label: "Under pressure", bar: "[&>div]:bg-orange-500" };
  return { label: "Sack talk in the press", bar: "[&>div]:bg-rose-500" };
}

/* ---------- main component ---------- */

export function OfficeTab() {
  const game = useAppStore((s) => s.game);
  const update = useAppStore((s) => s.update);
  const { toast } = useToast();

  const [budgetInput, setBudgetInput] = useState("");
  const [pendingOffer, setPendingOffer] = useState<JobOffer | null>(null);
  const [difficultyChanged, setDifficultyChanged] = useState(false);

  const currency = game?.settings?.currency ?? "USD";
  const halfLength = game?.settings?.halfLengthMin ?? 4;

  // keep the module-level currency in format.ts in sync with the active save
  useEffect(() => {
    setCurrency(currency);
  }, [currency]);

  const offers = useMemo(() => game?.offers ?? [], [game]);
  const ledger = useMemo(() => game?.ledger ?? [], [game]);
  const history = useMemo(() => game?.history ?? [], [game]);

  if (!game) return null;

  const wageBill = game.players.reduce((s, p) => s + p.salary, 0);
  const ffpPct = Math.min(999, Math.round((wageBill / Math.max(game.wageBudget, 1)) * 100));
  const confidence = Math.min(100, Math.max(0, game.boardConfidence ?? 60));
  const tone = confidenceTone(confidence);
  const stars = repToStars(game.managerRep ?? 0);
  const totalTrophies = history.reduce((s, h) => s + (h.trophies?.length ?? 0), 0);
  const lineCoaches = game.staff?.lineCoaches ?? { gk: 0, def: 0, mid: 0, att: 0 };

  /* ----- finances: convert transfer budget into weekly wage budget ----- */
  const applyBudgetMove = () => {
    const amount = Number(budgetInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Invalid amount", description: "Enter an amount greater than zero." });
      return;
    }
    let moved = 0;
    let weekly = 0;
    update((g) => {
      const amt = Math.min(amount, g.transferBudget);
      if (amt <= 0) return;
      moved = amt;
      weekly = Math.round(amt / 52);
      g.transferBudget -= amt;
      g.wageBudget += weekly;
      g.ledger = [
        { id: uid(), date: g.currentDate, week: weekOfSeason(g), label: "Budget converted to wages", amount: -amt },
        ...g.ledger,
      ].slice(0, 50);
    });
    if (moved > 0) {
      setBudgetInput("");
      toast({
        title: "Budget converted",
        description: `${formatMoney(moved)} moved to wages (${formatWage(weekly)} per week).`,
      });
    } else {
      toast({ title: "No transfer budget", description: "Your transfer budget is already empty." });
    }
  };

  /* ----- jobs: confirm + accept an offer ----- */
  const confirmAcceptOffer = () => {
    if (!pendingOffer) return;
    const res = useAppStore.getState().doAcceptOffer(pendingOffer.id);
    toast({ title: res.ok ? "Offer accepted" : "Cannot accept offer", description: res.message });
    setPendingOffer(null);
  };

  return (
    <Tabs defaultValue="board" className="gap-3">
      <TabsList className="grid w-full grid-cols-6 h-auto bg-slate-900/60 border border-slate-800 rounded-lg p-0.5">
        {(["board", "finances", "staff", "jobs", "career", "settings"] as const).map((t) => (
          <TabsTrigger
            key={t}
            value={t}
            className="px-1 text-[11px] capitalize text-slate-400 dark:text-slate-400 data-[state=active]:bg-slate-800 dark:data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-300 dark:data-[state=active]:text-emerald-300"
          >
            {t}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* ================= BOARD ================= */}
      <TabsContent value="board" className="space-y-3 mt-1">
        <section aria-label="Season objectives" className="grid grid-cols-2 gap-2">
          <div className={CARD}>
            <p className={SECTION_TITLE}>League objective</p>
            <p className="mt-1.5 text-lg font-black leading-tight text-slate-100">Finish {ordinal(game.seasonObjective.targetPosition)}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Set by the board for this season</p>
          </div>
          <div className={CARD}>
            <p className={SECTION_TITLE}>Cup objective</p>
            <p className="mt-1.5 text-lg font-black leading-tight text-slate-100">
              {CUP_TARGET_LABEL[game.seasonObjective.cupTarget] ?? "No cup target"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">Domestic cup ambition</p>
          </div>
        </section>

        <section aria-label="Board confidence" className={CARD}>
          <div className="flex items-center justify-between">
            <p className={cn(SECTION_TITLE, "flex items-center gap-1.5")}>
              <Landmark className="h-3.5 w-3.5 text-amber-400" aria-hidden /> Board confidence
            </p>
            <span className="text-xs font-bold text-slate-200">{confidence}%</span>
          </div>
          <Progress value={confidence} className="mt-2 bg-slate-800" aria-label={`Board confidence ${confidence} percent`} />
          <p className="mt-1.5 text-[11px] text-slate-500">{tone.label}</p>
        </section>

        <section aria-label="Manager rating" className={CARD}>
          <div className="flex items-center justify-between">
            <p className={SECTION_TITLE}>Manager rating</p>
            <span className="text-xs font-bold text-slate-200">{game.managerRep ?? 0} rep</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <StarRating value={stars} label={`Manager rating ${stars} out of 5 stars`} />
            <span className="text-[11px] text-slate-500">{stars.toFixed(1)} / 5</span>
          </div>
        </section>
      </TabsContent>

      {/* ================= FINANCES ================= */}
      <TabsContent value="finances" className="space-y-3 mt-1">
        <section aria-label="Budget overview" className="grid grid-cols-3 gap-2">
          <div className={cn(CARD, "text-center")}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Transfer</p>
            <p className="mt-1 text-sm font-black text-slate-100">{formatMoney(game.transferBudget)}</p>
          </div>
          <div className={cn(CARD, "text-center")}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Wage budget</p>
            <p className="mt-1 text-sm font-black text-slate-100">{formatWage(game.wageBudget)}</p>
          </div>
          <div className={cn(CARD, "text-center")}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Wage bill</p>
            <p className="mt-1 text-sm font-black text-slate-100">{formatMoney(wageBill)}</p>
          </div>
        </section>

        <section aria-label="FFP usage" className={CARD}>
          <div className="flex items-center justify-between">
            <p className={cn(SECTION_TITLE, "flex items-center gap-1.5")}>
              <Wallet className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> FFP usage
            </p>
            <span
              className={cn(
                "text-xs font-bold",
                ffpPct >= 100 ? "text-rose-400" : ffpPct >= 90 ? "text-amber-400" : "text-emerald-400",
              )}
            >
              {ffpPct}%
            </span>
          </div>
          <Progress
            value={Math.min(100, ffpPct)}
            className="mt-2 bg-slate-800 [&>div]:bg-emerald-500"
            aria-label={`Wage bill uses ${ffpPct} percent of wage budget`}
          />
          <p className="mt-1.5 text-[11px] text-slate-500">
            {formatMoney(wageBill)} of {formatWage(game.wageBudget)} committed
          </p>
        </section>

        <section aria-label="Budget allocation" className={CARD}>
          <p className={SECTION_TITLE}>Budget allocation</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Move transfer funds into the weekly wage budget (spread over 52 weeks).
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="Amount"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              aria-label="Amount to move to wage budget"
              className="h-9 flex-1 border-slate-800 bg-slate-900/70 text-slate-200 placeholder:text-slate-600"
            />
            <Button
              size="sm"
              className="h-9 bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              onClick={applyBudgetMove}
              aria-label="Move to wage budget"
            >
              Move to wage budget
            </Button>
          </div>
        </section>

        <section aria-label="Finance ledger">
          <p className={cn(SECTION_TITLE, "mb-2")}>Finance ledger</p>
          {ledger.length === 0 ? (
            <div className={cn(CARD, "text-center")}>
              <p className="text-xs text-slate-500">No finance movements yet.</p>
            </div>
          ) : (
            <div className={cn(CARD, "divide-y divide-slate-800/60 p-0")}>
              {ledger.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-200">{e.label}</p>
                    <p className="text-[11px] text-slate-500">{formatDate(e.date)}</p>
                  </div>
                  <span className={cn("shrink-0 text-xs font-bold", e.amount >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {e.amount >= 0 ? `+${formatMoney(e.amount)}` : `\u2212${formatMoney(Math.abs(e.amount))}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </TabsContent>

      {/* ================= STAFF ================= */}
      <TabsContent value="staff" className="space-y-3 mt-1">
        <section aria-label="Head coach" className={CARD}>
          <p className={cn(SECTION_TITLE, "flex items-center gap-1.5")}>
            <Users className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Head coach
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {COACH_KEYS.map((key) => {
              const meta = COACH_LEVELS[key];
              const active = game.staff.coachLevel === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => update((g) => { g.staff.coachLevel = key; })}
                  aria-label={`Hire ${key} head coach, wage ${formatMoney(meta.wage)} per week, training ${meta.label}`}
                  aria-pressed={active}
                  className={cn(OPT_BASE, active ? OPT_ACTIVE : OPT_IDLE)}
                >
                  <span className="block text-xs font-bold">{key}</span>
                  <span className="mt-0.5 block text-[11px]">{formatMoney(meta.wage)}/w</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-label="Specialist coaches" className={CARD}>
          <p className={SECTION_TITLE}>Specialist coaches</p>
          <p className="mt-1 text-[11px] text-slate-500">+6% development XP per level for that line</p>
          <div className="mt-2 space-y-3">
            {LINE_COACHES.map(({ key, label }) => {
              const level = lineCoaches[key] ?? 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">{label}</span>
                    <span className="text-[11px] text-slate-500">
                      {level > 0 ? `${formatMoney(level * LINE_LEVEL_COST)}/w` : "No wage"}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                    {LINE_LEVEL_LABELS.map((lvlLabel, lvl) => (
                      <button
                        key={lvlLabel}
                        type="button"
                        onClick={() =>
                          update((g) => {
                            g.staff.lineCoaches = { ...(g.staff.lineCoaches ?? { gk: 0, def: 0, mid: 0, att: 0 }), [key]: lvl };
                          })
                        }
                        aria-label={`${label} coach level ${lvlLabel}${lvl > 0 ? `, cost ${formatMoney(lvl * LINE_LEVEL_COST)} per week` : ", no cost"}`}
                        aria-pressed={level === lvl}
                        className={cn(
                          OPT_BASE,
                          "text-center text-[11px] font-semibold",
                          level === lvl ? OPT_ACTIVE : OPT_IDLE,
                        )}
                      >
                        {lvlLabel}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </TabsContent>

      {/* ================= JOBS ================= */}
      <TabsContent value="jobs" className="space-y-3 mt-1">
        <section aria-label="Job offers">
          <p className={cn(SECTION_TITLE, "flex items-center gap-1.5")}>
            <Briefcase className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Job offers
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Offers arrive at season end</p>

          {offers.length === 0 ? (
            <div className={cn(CARD, "mt-2 text-center")}>
              <Briefcase className="mx-auto h-6 w-6 text-slate-700" aria-hidden />
              <p className="mt-2 text-xs text-slate-500">
                No offers right now. Overachieve at season end to attract bigger clubs.
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {offers.map((offer) => (
                <div key={offer.id} className={CARD} aria-label={`Job offer from ${offer.teamName}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-slate-100">{offer.teamName}</p>
                    <Badge variant="outline" className="shrink-0 border-slate-700 text-[10px] text-amber-400">
                      Rep {offer.rep}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">Objective: Finish top {offer.objectiveTarget}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-slate-400">
                      <p>Transfer {formatMoney(offer.transferBudget)}</p>
                      <p>Wages {formatWage(offer.wageBudget)}</p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                      onClick={() => setPendingOffer(offer)}
                      aria-label={`Accept job offer from ${offer.teamName}`}
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </TabsContent>

      {/* ================= CAREER ================= */}
      <TabsContent value="career" className="space-y-3 mt-1">
        <section aria-label="Career summary" className="grid grid-cols-3 gap-2">
          <div className={cn(CARD, "text-center")}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Seasons</p>
            <p className="mt-1 text-lg font-black text-slate-100">{history.length}</p>
          </div>
          <div className={cn(CARD, "text-center")}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Trophies</p>
            <p className="mt-1 text-lg font-black text-amber-400">{totalTrophies}</p>
          </div>
          <div className={cn(CARD, "text-center")}>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Reputation</p>
            <p className="mt-1 text-lg font-black text-emerald-400">{game.managerRep ?? 0}</p>
          </div>
        </section>

        <section aria-label="Season history">
          <p className={cn(SECTION_TITLE, "mb-2")}>My Career</p>
          {history.length === 0 ? (
            <div className={cn(CARD, "text-center")}>
              <Trophy className="mx-auto h-6 w-6 text-slate-700" aria-hidden />
              <p className="mt-2 text-xs text-slate-500">First season in progress</p>
            </div>
          ) : (
            <div className={cn(CARD, "divide-y divide-slate-800/60 p-0")}>
              {history.map((h) => (
                <div key={h.season} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200">
                      {h.season}/{String((h.season + 1) % 100).padStart(2, "0")}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {h.won}-{h.drawn}-{h.lost} · {h.points} pts
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={cn(
                        "text-sm font-black",
                        h.position <= (game.seasonObjective?.targetPosition ?? 4) ? "text-emerald-400" : "text-slate-300",
                      )}
                    >
                      {ordinal(h.position)}
                    </span>
                    {h.trophies.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-1">
                        {h.trophies.map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-400"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </TabsContent>

      {/* ================= SETTINGS ================= */}
      <TabsContent value="settings" className="space-y-3 mt-1">
        <section aria-label="Currency setting" className={CARD}>
          <p className={SECTION_TITLE}>Currency</p>
          <Select value={currency} onValueChange={(v) => {
            const c = v as Currency;
            setCurrency(c);
            update((g) => { g.settings.currency = c; });
          }}>
            <SelectTrigger
              aria-label="Currency"
              className="mt-2 w-full border-slate-800 bg-slate-900/70 text-slate-200"
            >
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent className="border-slate-800 bg-slate-950 text-slate-200">
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c} className="text-slate-200 focus:bg-slate-800 focus:text-emerald-300">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section aria-label="Half length setting" className={CARD}>
          <div className="flex items-center justify-between">
            <p className={SECTION_TITLE}>Half length</p>
            <span className="text-xs font-bold text-emerald-400">{halfLength} min per half</span>
          </div>
          <Slider
            min={3}
            max={8}
            step={1}
            value={[halfLength]}
            onValueChange={(vals) =>
              update((g) => { g.settings.halfLengthMin = vals[0]; })
            }
            aria-label="Half length in minutes"
            className="mt-3 [&_[data-slot=slider-track]]:bg-slate-800 [&_[data-slot=slider-range]]:bg-emerald-500 [&_[data-slot=slider-thumb]]:border-emerald-500"
          />
          <p className="mt-1.5 text-[11px] text-slate-500">Affects live match playback speed</p>
        </section>

        <section aria-label="Difficulty setting" className={CARD}>
          <p className={SECTION_TITLE}>Difficulty</p>
          <div className="mt-2 space-y-2">
            {DIFFICULTY_ORDER.map((key) => {
              const meta = DIFFICULTY_META[key];
              const active = game.difficulty === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDifficultyChanged(true);
                    update((g) => { g.difficulty = key; });
                  }}
                  aria-label={`Set difficulty ${meta.label}`}
                  aria-pressed={active}
                  className={cn(OPT_BASE, "w-full", active ? OPT_ACTIVE : OPT_IDLE)}
                >
                  <span className="block text-xs font-bold">{meta.label}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">{meta.desc}</span>
                </button>
              );
            })}
          </div>
          {difficultyChanged && (
            <p className="mt-2 text-[11px] font-semibold text-amber-400" role="status">
              Applies fully from next season
            </p>
          )}
        </section>

        <section aria-label="Technical and data">
          <p className={cn(SECTION_TITLE, "mb-2")}>Technical &amp; Data</p>
          <MoreTab />
        </section>
      </TabsContent>

      {/* job offer confirmation dialog */}
      <Dialog open={pendingOffer !== null} onOpenChange={(open) => { if (!open) setPendingOffer(null); }}>
        <DialogContent className="border-slate-800 bg-slate-950 sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              Accept offer from {pendingOffer?.teamName}?
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              You will leave your current club immediately. Objective: Finish top {pendingOffer?.objectiveTarget}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-200"
              onClick={() => setPendingOffer(null)}
              aria-label="Cancel offer acceptance"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              onClick={confirmAcceptOffer}
              aria-label="Confirm offer acceptance"
            >
              Accept offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
