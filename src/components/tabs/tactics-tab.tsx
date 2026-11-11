"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FORMATIONS, formationCoordinates, getFormation, positionAffinity, affinityLabel } from "@/lib/game/formations";
import { autoPickLineup, effectiveOvr, squadChemistry } from "@/lib/game/tactics";
import { cn } from "@/lib/utils";
import { Sparkles, Wand2 } from "lucide-react";

const CATEGORY_TONE: Record<string, string> = {
  Balanced: "text-slate-300 border-slate-600",
  Attacking: "text-emerald-400 border-emerald-500/40",
  Defensive: "text-sky-300 border-sky-500/40",
  Possession: "text-teal-300 border-teal-500/40",
  "Meta / Control": "text-amber-400 border-amber-500/40",
  "Meta / Balanced Attack": "text-amber-400 border-amber-500/40",
  "Meta / Counter Attack": "text-amber-400 border-amber-500/40",
  "Central Attack": "text-rose-300 border-rose-500/40",
  "Wide Attack": "text-rose-300 border-rose-500/40",
  "Counter Attack": "text-orange-300 border-orange-500/40",
  Control: "text-slate-300 border-slate-600",
  "Midfield Control": "text-slate-300 border-slate-600",
  "Heavy Attacking Midfield": "text-emerald-400 border-emerald-500/40",
  "Ultra Attacking": "text-emerald-300 border-emerald-400/40",
  "Balanced Wing Control": "text-slate-300 border-slate-600",
  "Attacking Midfield": "text-emerald-400 border-emerald-500/40",
  "High Press": "text-emerald-400 border-emerald-500/40",
  "Attacking Possession": "text-teal-300 border-teal-500/40",
  "Single Pivot Control": "text-slate-300 border-slate-600",
  "Total Football": "text-teal-300 border-teal-500/40",
  "Counter Attack / Solid": "text-orange-300 border-orange-500/40",
  "Ultra Defensive": "text-sky-300 border-sky-500/40",
  "Defensive Control": "text-sky-300 border-sky-500/40",
  "Wing Counter Attack": "text-orange-300 border-orange-500/40",
};

function affinityRing(a: number): string {
  if (a >= 0.95) return "border-emerald-400";
  if (a >= 0.8) return "border-emerald-500/60";
  if (a >= 0.65) return "border-amber-500/60";
  return "border-rose-500/70";
}

export function TacticsTab() {
  const game = useAppStore((s) => s.game);
  const update = useAppStore((s) => s.update);
  const [formationDialog, setFormationDialog] = useState(false);
  const [slotDialog, setSlotDialog] = useState<number | null>(null);

  const formation = useMemo(() => (game ? getFormation(game.tactics.formationName) : null), [game]);
  const coords = useMemo(() => (formation ? formationCoordinates(formation.positions) : []), [formation]);
  const chemistry = useMemo(
    () => (game && formation ? squadChemistry(game.players, formation.name, game.lineup) : 0),
    [game, formation],
  );
  const selectedSlot = slotDialog !== null ? slotDialog : null;
  const benchOptions = useMemo(() => {
    if (selectedSlot === null || !game || !formation) return [];
    const slot = formation.positions[selectedSlot];
    return [...game.players]
      .map((p) => ({ p, aff: positionAffinity(p.position, slot), eff: effectiveOvr(p, slot) }))
      .sort((a, b) => b.eff - a.eff)
      .slice(0, 18);
  }, [selectedSlot, game, formation]);

  if (!game || !formation) return null;

  const setFormation = (name: string) => {
    update((g) => {
      g.tactics.formationName = name;
      const f = getFormation(name);
      const used = new Set<number>();
      g.lineup = f.positions.map((slot, i) => {
        const currentId = g.lineup[i];
        if (currentId) {
          const p = g.players.find((x) => x.id === currentId);
          if (p && positionAffinity(p.position, slot) >= 0.8 && !used.has(p.id)) {
            used.add(p.id);
            return p.id;
          }
        }
        return null;
      });
      // fill gaps
      const auto = autoPickLineup(g.players, name);
      g.lineup = g.lineup.map((id, i) => (id !== null ? id : auto[i]));
    });
    setFormationDialog(false);
  };

  const assignPlayer = (slotIndex: number, playerId: number | null) => {
    update((g) => {
      if (playerId !== null) {
        // swap if player already occupies another slot
        const existingIdx = g.lineup.indexOf(playerId);
        if (existingIdx >= 0 && existingIdx !== slotIndex) {
          g.lineup[existingIdx] = g.lineup[slotIndex];
        }
      }
      g.lineup[slotIndex] = playerId;
    });
    setSlotDialog(null);
  };

  const autoPick = () => {
    update((g) => {
      g.lineup = autoPickLineup(g.players, g.tactics.formationName);
    });
  };

  const setMentality = (m: "defensive" | "balanced" | "attacking") => {
    update((g) => {
      g.tactics.mentality = m;
    });
  };

  const slotPlayer = (i: number) => game.players.find((p) => p.id === game.lineup[i]) ?? null;

  return (
    <div className="space-y-3">
      {/* header row */}
      <section aria-label="Formation controls" className="flex items-center gap-2">
        <Button variant="outline" className="flex-1 h-10 justify-between border-slate-700 bg-slate-950/40" onClick={() => setFormationDialog(true)} aria-label="Change formation">
          <span className="text-sm font-bold text-slate-200">{formation.name}</span>
          <Badge variant="outline" className={cn("text-[9px]", CATEGORY_TONE[formation.category] ?? "text-slate-300 border-slate-600")}>
            {formation.category}
          </Badge>
        </Button>
        <Button variant="outline" size="icon" className="h-10 w-10 border-slate-700" onClick={autoPick} aria-label="Auto pick best XI">
          <Wand2 className="h-4 w-4 text-emerald-400" aria-hidden />
        </Button>
      </section>

      {/* pitch */}
      <section aria-label="Pitch lineup">
        <div className="pitch-bg relative rounded-xl border border-emerald-900/60 overflow-hidden" style={{ aspectRatio: "3 / 4" }}>
          {/* markings */}
          <div className="absolute inset-2 border border-white/20 rounded-md" aria-hidden />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[22%] w-[30%] border border-white/20 rounded-full" aria-hidden />
          <div className="absolute left-2 right-2 top-1/2 h-px bg-white/20" aria-hidden />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-2 w-[44%] h-[14%] border border-white/20 border-b-0" aria-hidden />
          <div className="absolute left-1/2 -translate-x-1/2 top-2 w-[44%] h-[14%] border border-white/20 border-t-0" aria-hidden />

          {coords.map((c, i) => {
            const player = slotPlayer(i);
            const slot = formation.positions[i];
            const aff = player ? positionAffinity(player.position, slot) : 1;
            const eff = player ? effectiveOvr(player, slot) : 0;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSlotDialog(i)}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 min-h-[44px] min-w-[44px] justify-center"
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                aria-label={`Slot ${slot}: ${player ? player.name : "empty"}`}
              >
                <span className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 bg-slate-950/85 text-xs font-black shadow-lg",
                  player ? `${affinityRing(aff)} text-slate-50` : "border-dashed border-slate-400/70 text-slate-500",
                )}>
                  {player ? eff : slot}
                </span>
                <span className="max-w-[68px] truncate rounded bg-slate-950/80 px-1 text-[9px] font-semibold text-slate-300">
                  {player ? player.name.split(" ").pop() : "Empty"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* chemistry + mentality */}
      <section aria-label="Team instructions" className="space-y-2">
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className={cn("h-4 w-4", chemistry >= 85 ? "text-emerald-400" : chemistry >= 70 ? "text-amber-400" : "text-rose-400")} aria-hidden />
            <span className="text-xs text-slate-400">Team chemistry</span>
          </div>
          <span className={cn("text-sm font-black", chemistry >= 85 ? "text-emerald-400" : chemistry >= 70 ? "text-amber-400" : "text-rose-400")}>
            {chemistry}%
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Mentality">
          {(["defensive", "balanced", "attacking"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMentality(m)}
              aria-pressed={game.tactics.mentality === m}
              className={cn(
                "min-h-[38px] rounded-lg border text-xs font-semibold capitalize transition-colors",
                game.tactics.mentality === m
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                  : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-600 text-center">
          Tap a position chip to swap players. Ring color shows position familiarity.
        </p>
      </section>

      {/* formation picker dialog */}
      <Dialog open={formationDialog} onOpenChange={setFormationDialog}>
        <DialogContent className="max-w-[420px] max-h-[80vh] p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Choose formation</DialogTitle>
            <DialogDescription>29 tactical presets across back-3, back-4 and back-5 systems.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[56vh] px-4 pb-4 scrollbar-thin">
            {[3, 4, 5].map((back) => (
              <div key={back} className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                  Back {back} systems
                </p>
                <div className="space-y-1.5">
                  {FORMATIONS.filter((f) => f.backLine === back).map((f) => (
                    <button
                      key={f.name}
                      type="button"
                      onClick={() => setFormation(f.name)}
                      className={cn(
                        "w-full flex items-center justify-between rounded-lg border p-2.5 text-left transition-colors",
                        f.name === game.tactics.formationName
                          ? "border-emerald-500/60 bg-emerald-500/10"
                          : "border-slate-800 bg-slate-950/40 hover:border-slate-700",
                      )}
                      aria-label={`Select formation ${f.name}`}
                    >
                      <span className="text-sm font-semibold text-slate-200">{f.name}</span>
                      <Badge variant="outline" className={cn("text-[9px]", CATEGORY_TONE[f.category] ?? "text-slate-300 border-slate-600")}>
                        {f.category}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* slot picker dialog */}
      <Dialog open={slotDialog !== null} onOpenChange={(o) => !o && setSlotDialog(null)}>
        <DialogContent className="max-w-[400px] max-h-[80vh] p-0">
          {selectedSlot !== null && (
            <>
              <DialogHeader className="px-4 pt-4 pb-2">
                <DialogTitle>
                  Select {formation.positions[selectedSlot]} — slot {selectedSlot + 1}
                </DialogTitle>
                <DialogDescription>Sorted by effective rating in this role.</DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[52vh] px-4 pb-4 scrollbar-thin">
                <ul className="space-y-1.5">
                  {benchOptions.map(({ p, aff, eff }) => {
                    const label = affinityLabel(aff);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => assignPlayer(selectedSlot, p.id)}
                          className={cn(
                            "w-full flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors",
                            p.injuryWeeks > 0 ? "border-rose-500/30 bg-rose-500/5 opacity-70" : "border-slate-800 bg-slate-950/40 hover:border-slate-600",
                          )}
                          aria-label={`Assign ${p.name}`}
                        >
                          <span className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black",
                            aff >= 0.8 ? "border-emerald-500/60 text-emerald-400" : aff >= 0.65 ? "border-amber-500/60 text-amber-400" : "border-rose-500/60 text-rose-400",
                          )}>
                            {eff}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-200 truncate">
                              {p.name} {p.injuryWeeks > 0 && <span className="text-[10px] text-rose-400">(injured {p.injuryWeeks}w)</span>}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {p.position} · OVR {p.overallRating} · {label.label}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  variant="outline"
                  className="mt-2 w-full border-slate-700 text-slate-400"
                  onClick={() => assignPlayer(selectedSlot, null)}
                  aria-label="Leave slot empty"
                >
                  Leave empty
                </Button>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
