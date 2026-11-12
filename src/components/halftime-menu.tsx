"use client";

/**
 * v4.8 Half-time menu — FIFA-style break screen between 1st and 2nd half.
 *
 * The match worker pauses itself at 45+added time and hands over a full
 * break report (score, stats, per-player stamina/ratings, bench). The
 * manager can then review the pitch, tweak mentality & sliders, make up to
 * five substitutions, and kick off the second half.
 */
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { AdvancedPitch, type PitchChipPlayer } from "@/components/advanced-pitch";
import { SLIDER_META } from "@/lib/game/tacticPresets";
import { ROLE_SHORT } from "@/lib/game/fcIq";
import { formationCoordinates, getFormation, positionAffinity } from "@/lib/game/formations";
import { ratingColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowRightLeft, Play, Timer, Zap } from "lucide-react";
import type { HalftimePayload, HalftimePlayer, Mentality, PlayerState, PositionCode, TacticSliders } from "@/lib/game/types";

const MAX_SUBS = 5;

const DEFAULT_SLIDERS: TacticSliders = {
  buildUpSpeed: 50,
  chanceCreation: 50,
  attackingWidth: 50,
  defensiveWidth: 50,
  pressingIntensity: 50,
  defensiveLine: 50,
  tempo: 50,
  aggression: 40,
};

interface MadeSub {
  outId: number;
  inId: number;
  outName: string;
  inName: string;
}

function staminaTone(v: number): string {
  return v >= 75 ? "bg-emerald-400" : v >= 50 ? "bg-amber-400" : "bg-rose-400";
}

export function HalftimeMenu({ ht }: { ht: HalftimePayload }) {
  const game = useAppStore((s) => s.game);
  const clearHalftime = useAppStore((s) => s.clearHalftime);
  const liveSub = useAppStore((s) => s.liveSub);
  const liveTactics = useAppStore((s) => s.liveTactics);
  const liveInstant = useAppStore((s) => s.liveInstant);

  const formationName = game?.tactics.formationName ?? "4-3-3 Standard";
  const formation = useMemo(() => getFormation(formationName), [formationName]);
  const coords = useMemo(() => formationCoordinates(formation.positions), [formation]);

  // working copies — mirror the engine while the break menu is open
  const [xi, setXi] = useState<HalftimePlayer[]>(ht.players);
  const [benchIds, setBenchIds] = useState<number[]>(ht.benchIds);
  const [subs, setSubs] = useState<MadeSub[]>([]);
  const [selOut, setSelOut] = useState<number | null>(null);
  const [selIn, setSelIn] = useState<number | null>(null);
  const [mentality, setMentality] = useState<Mentality>(game?.tactics.mentality ?? "balanced");
  const [sliders, setSliders] = useState<TacticSliders>(game?.tactics.sliders ?? DEFAULT_SLIDERS);

  const benchPlayers = useMemo(
    () =>
      benchIds
        .map((id) => game?.players.find((p) => p.id === id) ?? null)
        .filter((p): p is PlayerState => p !== null),
    [benchIds, game],
  );

  const subsLeft = MAX_SUBS - subs.length;
  const userIsHome = ht.userSide === "home";
  const myGoals = userIsHome ? ht.homeGoals : ht.awayGoals;
  const oppGoals = userIsHome ? ht.awayGoals : ht.homeGoals;
  const myName = userIsHome ? ht.homeName : ht.awayName;
  const oppName = userIsHome ? ht.awayName : ht.homeName;
  const myStats = userIsHome ? 0 : 1;
  const oppStats = userIsHome ? 1 : 0;
  const userMomentum = userIsHome ? ht.momentum : -ht.momentum;

  const confirmSub = () => {
    if (selOut === null || selIn === null || subsLeft <= 0) return;
    const outP = xi.find((p) => p.id === selOut);
    const inP = benchPlayers.find((p) => p.id === selIn);
    if (!outP || !inP) return;
    liveSub(selOut, selIn);
    setXi((prev) =>
      prev.map((x) =>
        x.id === selOut
          ? {
              id: inP.id,
              name: inP.name,
              slot: outP.slot,
              position: inP.position,
              ovr: inP.overallRating,
              staminaNow: 100,
              rating: 0,
              goals: 0,
              assists: 0,
              yellow: 0,
              sentOff: false,
              subbedOut: false,
            }
          : x,
      ),
    );
    setSubs((prev) => [...prev, { outId: selOut, inId: selIn, outName: outP.name, inName: inP.name }]);
    setBenchIds((prev) => prev.filter((id) => id !== selIn));
    setSelOut(null);
    setSelIn(null);
  };

  const pickMentality = (m: Mentality) => {
    setMentality(m);
    liveTactics(m, undefined);
  };

  const pickSlider = (key: keyof TacticSliders, v: number) => {
    setSliders((prev) => ({ ...prev, [key]: v }));
    liveTactics(undefined, { [key]: v });
  };

  const chips: (PitchChipPlayer | null)[] = coords.map((c, i) => {
    const p = xi[i];
    if (!p || p.subbedOut || p.sentOff) return null;
    const slot = formation.positions[i];
    return {
      id: p.id,
      slotCode: slot,
      name: p.name,
      eff: p.ovr,
      affinity: positionAffinity(p.position as PositionCode, slot),
      naturalPos: p.position,
      roleCode: p.role ? ROLE_SHORT[p.role.roleId] : undefined,
      stamina: p.staminaNow,
      isCaptain: game?.tactics.setPieces.captain === p.id,
      yellow: p.yellow,
      justIn: subs.some((s) => s.inId === p.id),
      showRating: p.rating > 0 ? p.rating : undefined,
    };
  });

  const topRated = [...xi].filter((p) => !p.subbedOut).sort((a, b) => b.rating - a.rating).slice(0, 3);
  const keyEvents = ht.events.filter((e) => e.type === "goal" || e.type === "card" || e.type === "injury");

  return (
    <section aria-label="Half-time menu" className="space-y-3">
      {/* break header */}
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-950/30 to-slate-900 p-4 text-center">
        <Badge variant="outline" className="border-amber-500/50 text-amber-400 gap-1">
          <Timer className="h-3 w-3" aria-hidden /> HALF-TIME · {ht.minute}&apos;
        </Badge>
        <p className="mt-2 font-mono text-4xl font-black text-slate-50 tabular-nums">
          {myGoals} <span className="text-slate-600">-</span> {oppGoals}
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-300">
          <span className="text-emerald-300">{myName}</span> vs {oppName}
        </p>
        <p className="mt-1 text-[10px] text-slate-500">Set up your second half — changes apply to this match only.</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="w-full bg-slate-950 border border-slate-800">
          <TabsTrigger value="overview" className="flex-1 text-xs data-[state=active]:text-amber-400">Overview</TabsTrigger>
          <TabsTrigger value="pitch" className="flex-1 text-xs data-[state=active]:text-amber-400">Pitch</TabsTrigger>
          <TabsTrigger value="strategy" className="flex-1 text-xs data-[state=active]:text-amber-400">Strategy</TabsTrigger>
          <TabsTrigger value="subs" className="flex-1 text-xs data-[state=active]:text-amber-400">
            Subs{subsLeft < MAX_SUBS ? ` (${subsLeft})` : ""}
          </TabsTrigger>
        </TabsList>

        {/* ---------- overview ---------- */}
        <TabsContent value="overview" className="mt-2 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {([
              { label: "Possession", my: `${ht.stats.possession[myStats]}%`, opp: `${ht.stats.possession[oppStats]}%` },
              { label: "Shots", my: String(ht.stats.shots[myStats]), opp: String(ht.stats.shots[oppStats]) },
              { label: "On target", my: String(ht.stats.onTarget[myStats]), opp: String(ht.stats.onTarget[oppStats]) },
              { label: "Expected goals", my: String(ht.stats.xg[myStats]), opp: String(ht.stats.xg[oppStats]) },
            ]).map(({ label, my, opp }) => (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 text-center">{label}</p>
                <p className="mt-1 flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="font-bold text-emerald-300">{my}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-300">{opp}</span>
                </p>
              </div>
            ))}
          </div>

          {/* momentum */}
          <div aria-label="Match momentum" className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-500">
              <span className={cn("truncate", userMomentum > 15 && "text-emerald-400")}>{myName}</span>
              <span>Momentum</span>
              <span className={cn("truncate", userMomentum < -15 && "text-sky-400")}>{oppName}</span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-600" aria-hidden />
              <div
                className={cn("absolute inset-y-0 rounded-full transition-all duration-700", userMomentum >= 0 ? "bg-emerald-500" : "bg-sky-500")}
                style={{
                  width: `${Math.min(50, Math.abs(userMomentum) / 2)}%`,
                  left: userMomentum >= 0 ? "50%" : undefined,
                  right: userMomentum < 0 ? "50%" : undefined,
                }}
                aria-hidden
              />
            </div>
          </div>

          {/* top performers */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Top rated (your team)</p>
            <ul className="space-y-1">
              {topRated.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-300">
                    {p.name}
                    {p.goals > 0 && <span className="ml-1 rounded bg-emerald-500/20 px-1 text-[9px] font-bold text-emerald-300">{p.goals}G</span>}
                    {p.assists > 0 && <span className="ml-1 rounded bg-sky-500/20 px-1 text-[9px] font-bold text-sky-300">{p.assists}A</span>}
                  </span>
                  <span className={cn("font-mono font-bold tabular-nums", ratingColor(p.rating))}>{p.rating.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* key events */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">1st half events</p>
            {keyEvents.length === 0 ? (
              <p className="text-xs text-slate-500">A quiet first half — no goals or cards.</p>
            ) : (
              <ul className="space-y-1">
                {keyEvents.map((e, i) => (
                  <li key={i} className={cn("flex gap-2 text-xs", e.type === "goal" && "font-semibold text-emerald-300", e.type === "card" && "text-amber-200", e.type === "injury" && "text-rose-300")}>
                    <span className="font-mono text-slate-500 w-8 shrink-0 text-right">{e.minute}&apos;</span>
                    <span className="truncate">{e.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        {/* ---------- pitch ---------- */}
        <TabsContent value="pitch" className="mt-2 space-y-2">
          <AdvancedPitch
            coords={coords}
            players={chips}
            showBars="stamina"
            connections
            ariaLabel="Half-time formation view with live stamina"
          />
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[9px] text-slate-600">
            <span>circle = effective rating</span>
            <span>bar = live stamina</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-rose-400" aria-hidden /> under 50 = sub him</span>
          </div>
          <p className="text-[11px] text-slate-500 text-center">
            {formation.name} · make changes on the Strategy and Subs tabs.
          </p>
        </TabsContent>

        {/* ---------- strategy ---------- */}
        <TabsContent value="strategy" className="mt-2 space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Mentality</p>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Second half mentality">
              {(["defensive", "balanced", "attacking"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMentality(m)}
                  aria-pressed={mentality === m}
                  className={cn(
                    "min-h-[38px] rounded-lg border text-xs font-semibold capitalize transition-colors",
                    mentality === m
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                      : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Team sliders</p>
            {SLIDER_META.map(({ key, label, low, high }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-300">{label}</span>
                  <span className="text-[10px] font-mono text-emerald-400 tabular-nums">{sliders[key]}</span>
                </div>
                <Slider
                  value={[sliders[key]]}
                  min={1}
                  max={100}
                  step={1}
                  onValueChange={([v]) => pickSlider(key, v)}
                  aria-label={`${label} (second half)`}
                  className="[&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5"
                />
                <div className="flex justify-between mt-0.5">
                  <span className="text-[9px] text-slate-600">{low}</span>
                  <span className="text-[9px] text-slate-600">{high}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 text-center">
            Applies to the second half of this match only — your saved tactics stay untouched.
          </p>
        </TabsContent>

        {/* ---------- substitutions ---------- */}
        <TabsContent value="subs" className="mt-2 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Substitutions</p>
            <Badge variant="outline" className={cn("text-[9px]", subsLeft > 0 ? "border-emerald-500/40 text-emerald-400" : "border-rose-500/40 text-rose-400")}>
              {subsLeft} of {MAX_SUBS} left
            </Badge>
          </div>

          {subs.length > 0 && (
            <ul className="space-y-1" aria-label="Substitutions made">
              {subs.map((s) => (
                <li key={s.outId} className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[11px]">
                  <ArrowRightLeft className="h-3 w-3 text-emerald-400 shrink-0" aria-hidden />
                  <span className="truncate text-slate-300">
                    <span className="font-semibold text-emerald-300">{s.inName}</span> <span className="text-slate-500">for</span> {s.outName}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">On the pitch — tap to take OFF</p>
            <div className="max-h-56 overflow-y-auto overscroll-contain scrollbar-thin touch-scroll pr-1">
              <ul className="space-y-1.5">
                {xi.filter((p) => !p.subbedOut && !p.sentOff).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelOut((cur) => (cur === p.id ? null : p.id))}
                      aria-pressed={selOut === p.id}
                      className={cn(
                        "w-full rounded-lg border p-2 text-left transition-colors",
                        selOut === p.id ? "border-amber-400 bg-amber-500/10" : "border-slate-800 bg-slate-950/40 hover:border-slate-600",
                      )}
                      aria-label={`Take ${p.name} off`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-black text-slate-300">{p.slot}</span>
                        <span className="flex-1 min-w-0 truncate text-xs font-semibold text-slate-200">{p.name}</span>
                        {p.yellow > 0 && <span className="h-2.5 w-2 rounded-sm bg-amber-400" title="Booked" aria-label="Booked" />}
                        <span className={cn("font-mono text-xs font-bold tabular-nums", ratingColor(p.rating))}>{p.rating > 0 ? p.rating.toFixed(1) : "–"}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                          <span className={cn("block h-full", staminaTone(p.staminaNow))} style={{ width: `${p.staminaNow}%` }} />
                        </span>
                        <span className="w-8 text-right font-mono text-[10px] tabular-nums text-slate-400">{p.staminaNow}%</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Bench — tap to bring ON</p>
            {benchPlayers.length === 0 ? (
              <p className="text-xs text-slate-500">No substitutes available.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto overscroll-contain scrollbar-thin touch-scroll pr-1">
                <ul className="space-y-1.5">
                  {benchPlayers.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelIn((cur) => (cur === p.id ? null : p.id))}
                        aria-pressed={selIn === p.id}
                        className={cn(
                          "w-full flex items-center gap-2 rounded-lg border p-2 text-left transition-colors",
                          selIn === p.id ? "border-emerald-400 bg-emerald-500/10" : "border-slate-800 bg-slate-950/40 hover:border-slate-600",
                        )}
                        aria-label={`Bring on ${p.name}`}
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 text-[10px] font-black text-slate-200">
                          {p.overallRating}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-xs font-semibold text-slate-200">{p.name}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">{p.position}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <Button
            className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
            disabled={selOut === null || selIn === null || subsLeft <= 0}
            onClick={confirmSub}
            aria-label="Confirm substitution"
          >
            <ArrowRightLeft className="h-4 w-4 mr-2" aria-hidden />
            {subsLeft <= 0 ? "All substitutions used" : "Confirm substitution"}
          </Button>
        </TabsContent>
      </Tabs>

      {/* break actions */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-11 border-slate-700 text-slate-300" onClick={liveInstant} aria-label="Skip to full time">
          <Zap className="h-4 w-4 mr-1.5" aria-hidden />
          Skip to FT
        </Button>
        <Button className="flex-[2] h-11 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold" onClick={clearHalftime} aria-label="Start second half">
          <Play className="h-4 w-4 mr-2 fill-slate-950" aria-hidden />
          Start second half
        </Button>
      </div>
    </section>
  );
}
