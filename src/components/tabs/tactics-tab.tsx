"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FORMATIONS, formationCoordinates, getFormation, positionAffinity, affinityLabel, positionGroup } from "@/lib/game/formations";
import { autoPickLineup, autoRotateLineup, effectiveOvr, squadChemistry } from "@/lib/game/tactics";
import { GAME_PLANS, SLIDER_META, ATTACK_INSTRUCTIONS, DEFEND_INSTRUCTIONS, instructionsForGroup } from "@/lib/game/tacticPresets";
import {
  FOCUS_DEFS,
  ROLE_FOCUSES,
  ROLE_SHORT,
  bestRoleForPlayer,
  roleBlurb,
  rolesForSlot,
} from "@/lib/game/fcIq";
import { buildFcProfile } from "@/lib/game/fc";
import { AdvancedPitch, affinityRing } from "@/components/advanced-pitch";
import { cn } from "@/lib/utils";
import { ClipboardList, Dumbbell, RefreshCw, Repeat, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import type { PlayerState, SetPieceAssignments, SlotRole } from "@/lib/game/types";

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
  "Attacking Wing Play": "text-teal-300 border-teal-500/40",
  "Counter Attack / Solid": "text-orange-300 border-orange-500/40",
  "Ultra Defensive": "text-sky-300 border-sky-500/40",
  "Defensive Control": "text-sky-300 border-sky-500/40",
  "Wing Counter Attack": "text-orange-300 border-orange-500/40",
};

const SET_PIECE_ROLES: { key: keyof SetPieceAssignments; label: string }[] = [
  { key: "captain", label: "Captain" },
  { key: "penalty", label: "Penalty taker" },
  { key: "freeKick", label: "Free kick taker" },
  { key: "cornerLeft", label: "Corner (left)" },
  { key: "cornerRight", label: "Corner (right)" },
];

function statTone(v: number, great = 80, good = 65): string {
  return v >= great ? "text-emerald-400" : v >= good ? "text-amber-400" : "text-rose-400";
}

export function TacticsTab() {
  const game = useAppStore((s) => s.game);
  const update = useAppStore((s) => s.update);
  const [formationDialog, setFormationDialog] = useState(false);
  const [setPieceDialog, setSetPieceDialog] = useState(false);
  const [slotDialog, setSlotDialog] = useState<number | null>(null);
  const [presetDialog, setPresetDialog] = useState(false);
  const [presetName, setPresetName] = useState("");

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

  const slotFcProfile = useMemo(() => {
    if (selectedSlot === null || !game) return null;
    const p = game.players.find((x) => x.id === game.lineup[selectedSlot]);
    if (!p) return null;
    return buildFcProfile(p);
  }, [selectedSlot, game]);

  if (!game || !formation) return null;
  const t = game.tactics;

  /** v5.0 FC IQ — give every filled slot a legal role (auto = best mastery). */
  const syncRoles = (g: NonNullable<typeof game>) => {
    g.tactics.roles ??= {};
    formation.positions.forEach((slot, i) => {
      const p = g.players.find((x) => x.id === g.lineup[i]);
      if (!p) {
        delete g.tactics.roles[String(i)];
        return;
      }
      const cur = g.tactics.roles[String(i)];
      const legal = rolesForSlot(slot);
      const valid = cur && legal.some((r) => r.id === cur.roleId) &&
        (ROLE_FOCUSES[cur.roleId] ?? []).includes(cur.focusId);
      if (!valid) g.tactics.roles[String(i)] = bestRoleForPlayer(p, slot);
    });
  };

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
      // drop instructions for out-of-group slots
      g.tactics.instructions = {};
      syncRoles(g);
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
      // clear stale instructions on that slot
      delete g.tactics.instructions[String(slotIndex)];
      g.tactics.roles ??= {};
      // v5.0 FC IQ — auto-assign the new player's best role for this slot
      if (playerId !== null) {
        const p = g.players.find((x) => x.id === playerId);
        if (p) g.tactics.roles[String(slotIndex)] = bestRoleForPlayer(p, formation.positions[slotIndex]);
      } else {
        delete g.tactics.roles[String(slotIndex)];
      }
      // swapped-out player keeps a valid role in his new slot
      syncRoles(g);
    });
    setSlotDialog(null);
  };

  const autoPick = () => {
    update((g) => {
      g.lineup = autoPickLineup(g.players, g.tactics.formationName);
      g.tactics.instructions = {};
      syncRoles(g);
    });
  };

  const autoRotate = () => {
    update((g) => {
      g.lineup = autoRotateLineup(g.players, g.tactics.formationName);
      g.tactics.instructions = {};
      syncRoles(g);
    });
  };

  const setSlotRole = (slotIndex: number, role: Partial<SlotRole>) => {
    update((g) => {
      g.tactics.roles ??= {};
      const slot = formation.positions[slotIndex];
      const cur = g.tactics.roles[String(slotIndex)] ?? bestRoleForPlayer(
        g.players.find((x) => x.id === g.lineup[slotIndex]) ?? { id: 0, position: slot, attributes: { pace: 50, shooting: 50, passing: 50, dribbling: 50, defending: 50, physical: 50 } },
        slot,
      );
      g.tactics.roles[String(slotIndex)] = { ...cur, ...role };
    });
  };

  const setMentality = (m: "defensive" | "balanced" | "attacking") => {
    update((g) => {
      g.tactics.mentality = m;
    });
  };

  const applyPlan = (planId: string) => {
    update((g) => {
      const plan = GAME_PLANS.find((p) => p.id === planId) ?? GAME_PLANS[0];
      g.tactics.gamePlan = plan.id;
      g.tactics.sliders = { ...plan.sliders };
      g.tactics.mentality = plan.mentality;
    });
  };

  const setSlider = (key: keyof (typeof t)["sliders"], value: number) => {
    update((g) => {
      g.tactics.sliders[key] = value;
    });
  };

  const setInstruction = (slotIndex: number, phase: "att" | "def", id: string) => {
    update((g) => {
      const key = String(slotIndex);
      const cur = g.tactics.instructions[key] ?? {};
      g.tactics.instructions[key] = { ...cur, [phase]: id === "none" ? undefined : id } as { att?: string; def?: string };
    });
  };

  const setSetPiece = (role: keyof SetPieceAssignments, playerId: string) => {
    update((g) => {
      g.tactics.setPieces[role] = playerId === "none" ? null : Number(playerId);
    });
  };

  const snapshotTactics = (g: NonNullable<typeof game>) => ({
    formationName: g.tactics.formationName,
    mentality: g.tactics.mentality,
    gamePlan: g.tactics.gamePlan,
    sliders: { ...g.tactics.sliders },
    lineup: [...g.lineup],
    roles: { ...(g.tactics.roles ?? {}) },
    instructions: Object.fromEntries(Object.entries(g.tactics.instructions ?? {}).map(([k, v]) => [k, { ...v }])),
    setPieces: { ...(g.tactics.setPieces ?? { captain: null, penalty: null, freeKick: null, cornerLeft: null, cornerRight: null }) },
  });

  const savePreset = () => {
    update((g) => {
      if (g.tacticPresets.length >= 6) return;
      g.tacticPresets = [...g.tacticPresets, {
        id: Math.random().toString(36).slice(2, 10),
        name: presetName.trim() || `Preset ${g.tacticPresets.length + 1}`,
        ...snapshotTactics(g),
      }];
    });
    setPresetName("");
    setPresetDialog(false);
  };

  /** v5.1 — overwrite an existing preset with the current tactic, lineup,
   *  FC IQ roles, instructions and set pieces. */
  const updatePreset = (id: string) => {
    update((g) => {
      const idx = g.tacticPresets.findIndex((p) => p.id === id);
      if (idx === -1) return;
      g.tacticPresets = g.tacticPresets.map((p, i) => (i === idx ? { ...p, ...snapshotTactics(g) } : p));
    });
  };

  const applyPreset = (id: string) => {
    update((g) => {
      const preset = g.tacticPresets.find((p) => p.id === id);
      if (!preset) return;
      g.tactics.formationName = preset.formationName;
      g.tactics.mentality = preset.mentality;
      g.tactics.gamePlan = preset.gamePlan;
      g.tactics.sliders = { ...preset.sliders };
      // v5.1 — restore saved instructions (legacy presets fall back to none)
      g.tactics.instructions = Object.fromEntries(
        Object.entries(preset.instructions ?? {}).map(([k, v]) => [k, { ...v }]),
      );
      if (preset.setPieces) g.tactics.setPieces = { ...preset.setPieces };
      g.tactics.roles = { ...(preset.roles ?? {}) };
      // restore the saved lineup, dropping players who left the club, then fill gaps
      const squadIds = new Set(g.players.map((p) => p.id));
      const valid = preset.lineup.map((pid) => (pid !== null && squadIds.has(pid) ? pid : null));
      while (valid.length < 11) valid.push(null);
      const auto = autoPickLineup(g.players, preset.formationName);
      g.lineup = valid.map((pid, i) => (pid !== null ? pid : auto[i]));
      syncRoles(g);
    });
  };

  const deletePreset = (id: string) => {
    update((g) => {
      g.tacticPresets = g.tacticPresets.filter((p) => p.id !== id);
    });
  };

  const slotPlayer = (i: number): PlayerState | null => game.players.find((p) => p.id === game.lineup[i]) ?? null;
  const lineupPlayers = game.lineup
    .map((id) => game.players.find((p) => p.id === id))
    .filter(Boolean) as PlayerState[];

  /* ---- v4.8 advanced pitch stats ---- */
  const pitchStats = (() => {
    let effSum = 0;
    let effCount = 0;
    let natural = 0;
    game.lineup.forEach((id, i) => {
      if (!id) return;
      const p = game.players.find((x) => x.id === id);
      if (!p) return;
      const slot = formation.positions[i];
      effSum += effectiveOvr(p, slot);
      effCount += 1;
      if (positionAffinity(p.position, slot) >= 0.8) natural += 1;
    });
    const avg = (nums: number[]) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0);
    return {
      avgEff: effCount ? Math.round(effSum / effCount) : 0,
      avgSharp: avg(lineupPlayers.map((p) => p.sharpness)),
      avgStamina: avg(lineupPlayers.map((p) => p.stamina)),
      natural,
      filled: effCount,
    };
  })();

  const slotGroup = selectedSlot !== null ? positionGroup(formation.positions[selectedSlot]) : null;
  const slotInstr = slotGroup ? instructionsForGroup(slotGroup) : null;
  const slotPlayerInstr = selectedSlot !== null ? t.instructions?.[String(selectedSlot)] : undefined;
  const balance = game.teamTraining?.balance ?? 50;
  const trainingTone = balance >= 67
    ? { badge: "border-emerald-500/40 text-emerald-400", label: "All Out Performance" }
    : balance <= 33
      ? { badge: "border-sky-500/40 text-sky-400", label: "All Out Energy" }
      : { badge: "border-slate-600 text-slate-300", label: "Balanced workload" };
  const trainingEffect = balance >= 67
    ? "Match sharpness stays alive between games. Stamina recovers slowly (−5/wk)."
    : balance <= 33
      ? "Stamina recovers fast (+5/wk). Sharpness fades quickly between matches."
      : "Steady recovery with natural sharpness drift. No extreme cost either way.";

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
        <Button variant="outline" size="icon" className="h-10 w-10 border-slate-700" onClick={autoPick} title="Auto pick strongest XI" aria-label="Auto pick best XI">
          <Wand2 className="h-4 w-4 text-emerald-400" aria-hidden />
        </Button>
        <Button variant="outline" size="icon" className="h-10 w-10 border-slate-700" onClick={autoRotate} title="Auto rotation — give minutes to low-minute players to raise sharpness" aria-label="Auto rotation: prioritise players with few minutes">
          <Repeat className="h-4 w-4 text-sky-300" aria-hidden />
        </Button>
        <Button variant="outline" size="icon" className="h-10 w-10 border-slate-700" onClick={() => setSetPieceDialog(true)} title="Set piece takers" aria-label="Set piece takers">
          <ClipboardList className="h-4 w-4 text-amber-400" aria-hidden />
        </Button>
      </section>

      {/* v4.8 advanced pitch */}
      <section aria-label="Pitch lineup" className="space-y-2">
        <AdvancedPitch
          coords={coords}
          players={coords.map((c, i) => {
            const player = slotPlayer(i);
            if (!player) return null;
            const slot = formation.positions[i];
            // saved role, or the player's best role as a display fallback
            const roleId = (t.roles?.[String(i)] ?? bestRoleForPlayer(player, slot)).roleId;
            return {
              id: player.id,
              slotCode: slot,
              name: player.name,
              eff: effectiveOvr(player, slot),
              affinity: positionAffinity(player.position, slot),
              naturalPos: player.position,
              roleCode: roleId ? ROLE_SHORT[roleId] : undefined,
              sharpness: player.sharpness,
              stamina: player.stamina,
              injured: player.injuryWeeks > 0,
              hasInstruction: Boolean(t.instructions?.[String(i)]?.att || t.instructions?.[String(i)]?.def),
              isCaptain: t.setPieces?.captain === player.id,
              yellow: 0,
            };
          })}
          onSelect={(i) => setSlotDialog(i)}
          showBars="both"
          connections
          ariaLabel={`Formation pitch, ${formation.name}, with player ratings, sharpness and stamina`}
        />
        <div className="grid grid-cols-5 gap-1.5 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 text-center">
          <div>
            <p className={cn("font-mono text-sm font-black tabular-nums", statTone(pitchStats.avgEff))}>{pitchStats.avgEff}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">XI ovr</p>
          </div>
          <div>
            <p className={cn("font-mono text-sm font-black tabular-nums", statTone(chemistry, 85, 70))}>{chemistry}%</p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Chem</p>
          </div>
          <div>
            <p className={cn("font-mono text-sm font-black tabular-nums", statTone(pitchStats.avgSharp, 80, 60))}>{pitchStats.avgSharp}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Sharp</p>
          </div>
          <div>
            <p className={cn("font-mono text-sm font-black tabular-nums", statTone(pitchStats.avgStamina, 85, 70))}>{pitchStats.avgStamina}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Fit</p>
          </div>
          <div>
            <p className={cn("font-mono text-sm font-black tabular-nums", pitchStats.natural === pitchStats.filled && pitchStats.filled > 0 ? "text-emerald-400" : "text-amber-400")}>
              {pitchStats.natural}<span className="text-slate-600">/{pitchStats.filled}</span>
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Natural</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[9px] text-slate-600">
          <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-emerald-400" aria-hidden /> high</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-amber-400" aria-hidden /> medium</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-rose-400" aria-hidden /> low</span>
          <span>position · FC IQ role · player</span>
          <span>top bar = sharpness · bottom bar = fitness</span>
          <span className="flex items-center gap-1"><span className="flex h-3 w-3 items-center justify-center rounded-full bg-amber-400 text-[7px] font-black text-slate-950">C</span> captain</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden /> custom instruction</span>
        </div>
      </section>

      {/* game plans */}
      <section aria-label="Game plans" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Game plan</p>
          <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400">
            {GAME_PLANS.find((p) => p.id === t.gamePlan)?.name ?? "Custom"}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {GAME_PLANS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPlan(p.id)}
              aria-pressed={t.gamePlan === p.id}
              className={cn(
                "min-h-[38px] rounded-lg border px-2 text-left transition-colors",
                t.gamePlan === p.id
                  ? "border-emerald-500/60 bg-emerald-500/10"
                  : "border-slate-800 bg-slate-950/40 hover:border-slate-700",
              )}
            >
              <span className={cn("block text-xs font-bold", t.gamePlan === p.id ? "text-emerald-400" : "text-slate-300")}>{p.name}</span>
              <span className="block text-[9px] text-slate-500 leading-tight truncate">{p.tagline}</span>
            </button>
          ))}
        </div>
      </section>

      {/* sliders */}
      <section aria-label="Tactical sliders" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Custom instructions</p>
        {SLIDER_META.map(({ key, label, low, high }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-slate-300">{label}</span>
              <span className="text-[10px] font-mono text-emerald-400 tabular-nums">{t.sliders[key]}</span>
            </div>
            <Slider
              value={[t.sliders[key]]}
              min={1}
              max={100}
              step={1}
              onValueChange={([v]) => setSlider(key, v)}
              aria-label={label}
              className="[&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5"
            />
            <div className="flex justify-between mt-0.5">
              <span className="text-[9px] text-slate-600">{low}</span>
              <span className="text-[9px] text-slate-600">{high}</span>
            </div>
          </div>
        ))}
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
              aria-pressed={t.mentality === m}
              className={cn(
                "min-h-[38px] rounded-lg border text-xs font-semibold capitalize transition-colors",
                t.mentality === m
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                  : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-600 text-center">
          Tap a chip to swap players, choose their FC IQ role & focus, and add per-player instructions. The repeat button rotates low-minute players into position-faithful slots.
        </p>
      </section>

      {/* v4.7 — tactic presets */}
      <section aria-label="Tactic presets" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Save className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Tactic presets
          </p>
          <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-400">
            {game.tacticPresets.length}/6
          </Badge>
        </div>
        {game.tacticPresets.length === 0 ? (
          <p className="text-[11px] text-slate-600 mb-2">
            Save up to 6 complete tactics — formation, starting XI, game plan, sliders, FC IQ roles, instructions and set pieces — then swap them in one tap.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {game.tacticPresets.map((preset) => {
              const roleCount = Object.keys(preset.roles ?? {}).length;
              const instrCount = Object.values(preset.instructions ?? {}).filter((i) => i.att !== "none" || i.def !== "none").length;
              return (
                <div key={preset.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                  <p className="text-xs font-bold text-slate-200 truncate">{preset.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{preset.formationName} · {preset.mentality}</p>
                  {(roleCount > 0 || instrCount > 0) && (
                    <p className="text-[9px] text-slate-600 mt-0.5 truncate">
                      {roleCount > 0 && `${roleCount} roles`}
                      {roleCount > 0 && instrCount > 0 && " · "}
                      {instrCount > 0 && `${instrCount} instructions`}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-1.5">
                    <button
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className="flex-1 min-h-[28px] rounded-md border border-emerald-500/50 bg-emerald-500/10 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      aria-label={`Apply preset ${preset.name}`}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => updatePreset(preset.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-sky-500/40 text-sky-400 hover:bg-sky-500/10 transition-colors"
                      aria-label={`Overwrite preset ${preset.name} with current tactic`}
                      title="Overwrite this preset with the current tactic, lineup, roles, instructions and set pieces"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePreset(preset.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition-colors"
                      aria-label={`Delete preset ${preset.name}`}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Button
          variant="outline"
          className="w-full border-slate-700 text-slate-300"
          disabled={game.tacticPresets.length >= 6}
          onClick={() => { setPresetName(""); setPresetDialog(true); }}
          aria-label="Save current tactic as preset"
        >
          <Save className="h-4 w-4 mr-2" aria-hidden />
          {game.tacticPresets.length >= 6 ? "All 6 slots used — delete one first" : "Save current tactic"}
        </Button>
      </section>

      {/* v4.7 — weekly team training balance */}
      <section aria-label="Weekly training balance" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Dumbbell className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Weekly training plan
          </p>
          <Badge variant="outline" className={cn("text-[9px]", trainingTone.badge)}>{trainingTone.label}</Badge>
        </div>
        <Slider
          value={[balance]}
          min={0}
          max={100}
          step={5}
          onValueChange={([v]) => update((g) => { g.teamTraining.balance = v; })}
          aria-label="Training balance between sharpness and recovery"
          className="[&_[role=slider]]:h-3.5 [&_[role=slider]]:w-3.5"
        />
        <div className="flex justify-between">
          <span className="text-[9px] font-semibold text-sky-400">All Out Energy · recovery</span>
          <span className="text-[9px] font-semibold text-emerald-400">All Out Performance · sharpness</span>
        </div>
        <p className="text-[10px] text-slate-600">{trainingEffect}</p>
        <p className="text-[10px] text-slate-600">
          One weekly session for the whole squad — no need to play drills one by one. Applies to every player each week.
        </p>
      </section>

      {/* save preset dialog */}
      <Dialog open={presetDialog} onOpenChange={setPresetDialog}>
        <DialogContent className="max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-left">Save tactic preset</DialogTitle>
            <DialogDescription className="text-left">
              Snapshots the current formation, starting XI, game plan, sliders, FC IQ roles, instructions and set pieces. {6 - game.tacticPresets.length} slot{6 - game.tacticPresets.length === 1 ? "" : "s"} left.
            </DialogDescription>
          </DialogHeader>
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder={`Preset ${game.tacticPresets.length + 1}`}
            maxLength={24}
            aria-label="Preset name"
            className="w-full h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-emerald-500/60"
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 border-slate-700" onClick={() => setPresetDialog(false)}>Cancel</Button>
            <Button className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold" onClick={savePreset} aria-label="Confirm save preset">
              Save preset
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* formation picker dialog */}
      <Dialog open={formationDialog} onOpenChange={setFormationDialog}>
        <DialogContent className="max-w-[420px] max-h-[min(80dvh,80vh)] overflow-y-auto overscroll-contain p-0 touch-scroll">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Choose formation</DialogTitle>
            <DialogDescription>30 tactical presets across back-3, back-4 and back-5 systems.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(56dvh,56vh)] overflow-y-auto overscroll-contain px-4 pb-4 scrollbar-thin touch-scroll">
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
                        f.name === t.formationName
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
          </div>
        </DialogContent>
      </Dialog>

      {/* slot picker + instructions dialog */}
      <Dialog open={slotDialog !== null} onOpenChange={(o) => !o && setSlotDialog(null)}>
        <DialogContent className="max-w-[420px] max-h-[min(84dvh,84vh)] overflow-y-auto overscroll-contain p-0 touch-scroll">
          {selectedSlot !== null && (
            <>
              <DialogHeader className="px-4 pt-4 pb-2">
                <DialogTitle>
                  {formation.positions[selectedSlot]}, slot {selectedSlot + 1}
                </DialogTitle>
                <DialogDescription>
                  {slotPlayer(selectedSlot) ? slotPlayer(selectedSlot)!.name : "Empty slot"} · assign, pick the FC IQ role + focus, or set instructions
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="assign" className="px-4 pb-4">
                <TabsList className="w-full bg-slate-950 border border-slate-800">
                  <TabsTrigger value="assign" className="flex-1 text-xs data-[state=active]:text-emerald-400">Assign</TabsTrigger>
                  <TabsTrigger value="role" className="flex-1 text-xs data-[state=active]:text-emerald-400" disabled={!slotPlayer(selectedSlot)}>
                    FC IQ Role
                  </TabsTrigger>
                  <TabsTrigger value="instructions" className="flex-1 text-xs data-[state=active]:text-emerald-400" disabled={!slotPlayer(selectedSlot)}>
                    Instructions
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="assign" className="mt-2">
                  <div className="max-h-[min(42dvh,42vh)] overflow-y-auto overscroll-contain scrollbar-thin touch-scroll">
                    <ul className="space-y-1.5 pr-1">
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
                  </div>
                </TabsContent>

                <TabsContent value="role" className="mt-2 space-y-3">
                  {slotPlayer(selectedSlot) && slotFcProfile && (() => {
                    const slot = formation.positions[selectedSlot];
                    const roleList = rolesForSlot(slot);
                    const cur = t.roles?.[String(selectedSlot)] ?? bestRoleForPlayer(slotPlayer(selectedSlot)!, slot);
                    const masteryOf = (roleId: string) => slotFcProfile.roles.find((r) => r.id === roleId)?.level ?? null;
                    const masteryTone = (lvl: string | null) =>
                      lvl === "++"
                        ? "border-amber-400/60 text-amber-300"
                        : lvl === "+"
                          ? "border-emerald-500/50 text-emerald-400"
                          : "border-slate-600 text-slate-400";
                    const focuses = ROLE_FOCUSES[cur.roleId] ?? ["balanced"];
                    const roleName = (id: string) => roleList.find((r) => r.id === id)?.name ?? id;
                    return (
                      <>
                        <div className="max-h-[min(30dvh,30vh)] space-y-1.5 overflow-y-auto overscroll-contain pr-1 scrollbar-thin touch-scroll">
                          {roleList.map((role) => {
                            const lvl = masteryOf(role.id);
                            const active = cur.roleId === role.id;
                            return (
                              <button
                                key={role.id}
                                type="button"
                                onClick={() => setSlotRole(selectedSlot, { roleId: role.id, focusId: (ROLE_FOCUSES[role.id] ?? ["balanced"])[0] })}
                                aria-pressed={active}
                                aria-label={`Role ${role.name}`}
                                className={cn(
                                  "w-full flex items-center gap-2 rounded-lg border p-2.5 text-left transition-colors",
                                  active ? "border-emerald-500/60 bg-emerald-500/10" : "border-slate-800 bg-slate-950/40 hover:border-slate-700",
                                )}
                              >
                                <span className={cn(
                                  "flex h-8 w-9 shrink-0 items-center justify-center rounded-md border text-[10px] font-black",
                                  active ? "border-emerald-500/60 text-emerald-400" : "border-slate-700 text-slate-400",
                                )}>
                                  {ROLE_SHORT[role.id] ?? "--"}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className={cn("block text-sm font-semibold", active ? "text-emerald-400" : "text-slate-200")}>{role.name}</span>
                                  <span className="block text-[10px] leading-tight text-slate-500">{roleBlurb(role.id)}</span>
                                </span>
                                <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-black", masteryTone(lvl))} title={lvl ? `Role mastery: ${lvl}` : "Not familiar with this role"}>
                                  {lvl ?? "—"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Focus · {roleName(cur.roleId)}</p>
                          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Role focus">
                            {focuses.map((fid) => (
                              <button
                                key={fid}
                                type="button"
                                onClick={() => setSlotRole(selectedSlot, { focusId: fid })}
                                aria-pressed={cur.focusId === fid}
                                className={cn(
                                  "min-h-[34px] rounded-lg border text-[11px] font-semibold capitalize transition-colors",
                                  cur.focusId === fid
                                    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                                    : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700",
                                )}
                              >
                                {FOCUS_DEFS[fid]?.name ?? fid}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">{FOCUS_DEFS[cur.focusId]?.desc}</p>
                        </div>
                        <p className="text-[10px] text-slate-600">
                          Mastery (++) comes from the player's in-game stats — the role shapes their movement in the match engine: attacking runs, defensive cover, stamina drain and pressing.
                        </p>
                      </>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="instructions" className="mt-2 space-y-3">
                  {slotInstr && (
                    <>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Attacking phase</p>
                        <Select
                          value={slotPlayerInstr?.att ?? "none"}
                          onValueChange={(v) => setInstruction(selectedSlot, "att", v)}
                        >
                          <SelectTrigger className="bg-slate-950 border-slate-800" aria-label="Attacking instruction">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-950 border-slate-800">
                            {slotInstr.att.map((o) => (
                              <SelectItem key={o.id} value={o.id} className="text-xs">
                                {o.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {ATTACK_INSTRUCTIONS.find((o) => o.id === (slotPlayerInstr?.att ?? "none"))?.desc}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Defensive phase</p>
                        <Select
                          value={slotPlayerInstr?.def ?? "none"}
                          onValueChange={(v) => setInstruction(selectedSlot, "def", v)}
                        >
                          <SelectTrigger className="bg-slate-950 border-slate-800" aria-label="Defensive instruction">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-950 border-slate-800">
                            {slotInstr.def.map((o) => (
                              <SelectItem key={o.id} value={o.id} className="text-xs">
                                {o.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {DEFEND_INSTRUCTIONS.find((o) => o.id === (slotPlayerInstr?.def ?? "none"))?.desc}
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-600">
                        Instructions are role-aware: wingers can cut inside, full-backs can overlap, keepers can sweep.
                      </p>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* set pieces dialog */}
      <Dialog open={setPieceDialog} onOpenChange={setSetPieceDialog}>
        <DialogContent className="max-w-[400px] p-0">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Set pieces & leadership</DialogTitle>
            <DialogDescription>Assign takers from the current starting XI. The captain steadies morale after setbacks.</DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-4 space-y-2.5">
            {SET_PIECE_ROLES.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-28 text-xs font-semibold text-slate-400 shrink-0">{label}</span>
                <Select
                  value={t.setPieces?.[key] != null ? String(t.setPieces[key]) : "none"}
                  onValueChange={(v) => setSetPiece(key, v)}
                >
                  <SelectTrigger className="flex-1 bg-slate-950 border-slate-800" aria-label={label}>
                    <SelectValue placeholder="Select player" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800">
                    <SelectItem value="none" className="text-xs">Not assigned</SelectItem>
                    {lineupPlayers.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)} className="text-xs">
                        {p.name} ({p.position})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
