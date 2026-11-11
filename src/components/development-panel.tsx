"use client";

/**
 * FIFA-style player development panel: playstyle badges, weekly training
 * plan (focus + intensity) and position retraining (conversion).
 */

import { useMemo } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { COACH_LEVELS, coachMultiplier } from "@/lib/game/advance";
import {
  FOCUS_POOL,
  GK_FOCUS_POOL,
  GK_TRAINING_FOCUSES,
  INTENSITY_META,
  MENTOR_WEEKS,
  PLAYSTYLES,
  TRAINING_FOCUSES,
  canBeMentor,
  canBeMentee,
  canChooseDevPath,
  canStartRetrain,
  computePlayStyles,
  devPathsFor,
  eligibleRetrainTargets,
  startRetrain,
} from "@/lib/game/development";
import { getFormation } from "@/lib/game/formations";
import { effectiveOvr } from "@/lib/game/tactics";
import { GK_ATTR_LABELS, isGKAttributes } from "@/lib/game/attributes";
import { cn } from "@/lib/utils";
import { Dumbbell, GraduationCap, GitBranch, Repeat, Star, Users } from "lucide-react";
import type { PlayerState, TrainingFocus, TrainingIntensity } from "@/lib/game/types";

const FOCUS_LABEL: Record<TrainingFocus, string> = {
  balanced: "Balanced",
  attacking: "Attacking",
  defensive: "Defensive",
  technical: "Technical",
  pace: "Pace",
  shooting: "Finishing",
  // keeper-native focuses
  "shot-stopping": "Shot Stopping",
  handling: "Handling",
  positioning: "Positioning",
  distribution: "Distribution",
  agility: "Agility",
};

/** Old saves may carry an outfield-named focus on a keeper. Map each legacy
 *  value to the keeper-native focus with the closest growth pool so the UI can
 *  still highlight an active button. The engine keeps resolving the raw value. */
const LEGACY_GK_FOCUS_MAP: Partial<Record<TrainingFocus, TrainingFocus>> = {
  attacking: "distribution",
  defensive: "handling",
  technical: "distribution",
  pace: "agility",
  shooting: "positioning",
};

export function DevelopmentPanel({ player }: { player: PlayerState }) {
  const game = useAppStore((s) => s.game);
  const update = useAppStore((s) => s.update);
  const playStyles = useMemo(() => computePlayStyles(player), [player]);
  const retrainTargets = useMemo(
    () => (canStartRetrain(player) ? eligibleRetrainTargets(player) : []),
    [player],
  );
  if (!game) return null;

  const isGK = isGKAttributes(player.attributes);
  const focusList: readonly TrainingFocus[] = isGK ? GK_TRAINING_FOCUSES : TRAINING_FOCUSES;
  const rawFocus = player.trainingPlan?.focus ?? "balanced";
  const activeFocus = isGK ? (LEGACY_GK_FOCUS_MAP[rawFocus] ?? rawFocus) : rawFocus;

  const coach = COACH_LEVELS[game.staff?.coachLevel ?? "Accomplished"];
  const inLineup = game.lineup.includes(player.id);
  const lineupSlot = inLineup ? game.lineup.indexOf(player.id) : -1;
  const slotEff = inLineup ? effectiveOvr(player, getFormation(game.tactics.formationName).positions[lineupSlot]) : null;

  const setPlan = (patch: Partial<PlayerState["trainingPlan"]>) => {
    update((g) => {
      const p = g.players.find((x) => x.id === player.id);
      if (p) p.trainingPlan = { ...p.trainingPlan, ...patch };
    });
  };

  const beginRetrain = (target: PlayerState["position"]) => {
    update((g) => {
      const p = g.players.find((x) => x.id === player.id);
      if (p) startRetrain(p, target);
    });
  };

  const setCoach = (level: keyof typeof COACH_LEVELS) => {
    update((g) => {
      g.staff.coachLevel = level;
    });
  };

  const choosePath = (pathId: string) => {
    update((g) => {
      const p = g.players.find((x) => x.id === player.id);
      if (p) p.devPath = pathId;
    });
  };

  const assignMentor = (mentorId: number) => {
    update((g) => {
      const p = g.players.find((x) => x.id === player.id);
      if (p) p.mentor = { mentorId, weeksLeft: MENTOR_WEEKS, totalWeeks: MENTOR_WEEKS };
    });
  };

  const paths = canChooseDevPath(player) ? devPathsFor(player) : [];
  const mentors = canBeMentee(player)
    ? game.players.filter((m) => canBeMentor(m, player)).sort((a, b) => b.overallRating - a.overallRating).slice(0, 3)
    : [];

  return (
    <div className="space-y-4">
      {/* playstyles */}
      <section aria-label="PlayStyles">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">PlayStyles</p>
        {playStyles.length === 0 ? (
          <p className="text-xs text-slate-600">
            Raise any attribute to 80 to unlock a PlayStyle. OVR 85+ or POT 90+ players earn Plus versions.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {playStyles.map((s) => {
              const def = PLAYSTYLES.find((d) => d.id === s.id);
              return (
                <Badge
                  key={s.id}
                  variant="outline"
                  className={cn(
                    "text-[10px] font-bold",
                    s.plus
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                      : "border-slate-600 bg-slate-800/60 text-slate-200",
                  )}
                  title={def?.desc}
                >
                  {s.plus && <Star className="mr-1 h-3 w-3 inline" aria-hidden />}
                  {s.name}{s.plus ? "+" : ""}
                </Badge>
              );
            })}
          </div>
        )}
        {slotEff !== null && (
          <p className="text-[10px] text-slate-500 mt-1.5">
            Playing at {getFormation(game.tactics.formationName).positions[lineupSlot]}, effective rating {slotEff}
            {player.retrain ? ", retraining in progress" : ""}
          </p>
        )}
      </section>

      {/* v4.3 evolution path */}
      {paths.length > 0 && (
        <section aria-label="Evolution path">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5" aria-hidden /> Evolution path
          </p>
          <div className="space-y-1.5">
            {paths.map((path) => (
              <button
                key={path.id}
                type="button"
                onClick={() => choosePath(path.id)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/40 p-2.5 text-left hover:border-emerald-600/50 transition-colors"
                aria-label={`Choose ${path.name} path`}
              >
                <p className="text-xs font-bold text-slate-100">{path.name}</p>
                <p className="text-[10px] text-slate-500">{path.desc}</p>
                <p className="text-[10px] text-emerald-400 mt-0.5">Boosts: {path.attrs.join(" + ")} · +10% XP</p>
              </button>
            ))}
          </div>
        </section>
      )}
      {player.devPath && (
        <p className="text-[10px] text-emerald-400 flex items-center gap-1">
          <GitBranch className="h-3 w-3" aria-hidden /> Evolution: {player.devPath.replace("-", " ")} (locked in)
        </p>
      )}

      {/* training plan */}
      <section aria-label="Training plan">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <Dumbbell className="h-3.5 w-3.5" aria-hidden /> Weekly training plan
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {focusList.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPlan({ focus: f })}
              aria-pressed={activeFocus === f}
              className={cn(
                "min-h-[34px] rounded-lg border text-[11px] font-semibold transition-colors",
                activeFocus === f
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                  : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700",
              )}
            >
              {FOCUS_LABEL[f]}
            </button>
          ))}
        </div>
        {rawFocus !== "balanced" && (
          <p className="text-[10px] text-slate-600 mt-1.5">
            Growth biased 70/30 into:{" "}
            {isGK
              ? (GK_FOCUS_POOL[rawFocus] ?? []).map((a) => GK_ATTR_LABELS[a]).join(" + ")
              : (FOCUS_POOL[rawFocus] ?? []).join(", ")}
          </p>
        )}
        <div className="grid grid-cols-3 gap-1.5 mt-2" role="group" aria-label="Training intensity">
          {(["light", "normal", "intense"] as TrainingIntensity[]).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPlan({ intensity: i })}
              aria-pressed={player.trainingPlan?.intensity === i}
              className={cn(
                "min-h-[34px] rounded-lg border text-[11px] font-semibold capitalize transition-colors",
                player.trainingPlan?.intensity === i
                  ? i === "intense"
                    ? "border-rose-500/60 bg-rose-500/10 text-rose-400"
                    : i === "light"
                      ? "border-sky-500/60 bg-sky-500/10 text-sky-400"
                      : "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                  : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700",
              )}
            >
              {i}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-1.5">
          {INTENSITY_META[player.trainingPlan?.intensity ?? "normal"].label}
        </p>
      </section>

      {/* position retraining */}
      <section aria-label="Position retraining">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5" aria-hidden /> Position conversion
        </p>
        {player.retrain ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
            <p className="text-xs font-semibold text-amber-300">
              Converting {player.position} → {player.retrain.target}
            </p>
            <Progress value={((player.retrain.totalWeeks - player.retrain.weeksLeft) / player.retrain.totalWeeks) * 100} className="mt-2 h-1.5" aria-label="Retraining progress" />
            <p className="text-[10px] text-slate-500 mt-1.5">
              {player.retrain.totalWeeks - player.retrain.weeksLeft}/{player.retrain.totalWeeks} weeks, growth halved while learning
            </p>
          </div>
        ) : player.position === "GK" ? (
          <p className="text-xs text-slate-600">Goalkeepers cannot convert to another position.</p>
        ) : player.age > 32 ? (
          <p className="text-xs text-slate-600">Too old to learn a new position (32+).</p>
        ) : player.injuryWeeks > 0 ? (
          <p className="text-xs text-slate-600">Wait until he recovers from injury.</p>
        ) : retrainTargets.length === 0 ? (
          <p className="text-xs text-slate-600">No viable conversion paths from {player.position}.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {retrainTargets.map(({ pos, weeks }) => (
              <button
                key={pos}
                type="button"
                onClick={() => beginRetrain(pos)}
                className="flex min-h-[38px] items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 px-2 hover:border-emerald-600/50 transition-colors"
                aria-label={`Retrain to ${pos} in ${weeks} weeks`}
              >
                <span className="text-xs font-bold text-slate-200">{player.position} → {pos}</span>
                <span className="text-[10px] text-slate-500">{weeks}w</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* v4.3 mentorship */}
      <section aria-label="Mentorship">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" aria-hidden /> Mentorship
        </p>
        {player.mentor ? (
          (() => {
            const m = game.players.find((x) => x.id === player.mentor!.mentorId);
            return (
              <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-2.5">
                <p className="text-xs font-semibold text-sky-300">Learning from {m?.name ?? "veteran"}</p>
                <Progress value={((player.mentor.totalWeeks - player.mentor.weeksLeft) / player.mentor.totalWeeks) * 100} className="mt-2 h-1.5" aria-label="Mentorship progress" />
                <p className="text-[10px] text-slate-500 mt-1.5">{player.mentor.weeksLeft} weeks left · +25% XP · absorbs veteran attributes</p>
              </div>
            );
          })()
        ) : mentors.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] text-slate-600">Pair with a veteran (30+, higher OVR) for {MENTOR_WEEKS} weeks of boosted growth:</p>
            {mentors.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => assignMentor(m.id)}
                className="w-full flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 p-2 hover:border-sky-600/50 transition-colors"
                aria-label={`Assign ${m.name} as mentor`}
              >
                <span className="text-xs font-semibold text-slate-200">{m.name}</span>
                <span className="text-[10px] text-slate-500">{m.age}y · OVR {m.overallRating}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600">
            {player.age > 21 ? "Mentorship is for players 21 or younger." : "No eligible veterans available."}
          </p>
        )}
      </section>

      {/* coaching staff */}
      <section aria-label="Coaching staff">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5" aria-hidden /> Coaching staff
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(COACH_LEVELS) as (keyof typeof COACH_LEVELS)[]).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setCoach(lvl)}
              aria-pressed={game.staff?.coachLevel === lvl}
              className={cn(
                "min-h-[44px] rounded-lg border p-1.5 text-center transition-colors",
                game.staff?.coachLevel === lvl
                  ? "border-emerald-500/60 bg-emerald-500/10"
                  : "border-slate-800 bg-slate-950/40 hover:border-slate-700",
              )}
            >
              <span className={cn("block text-[11px] font-bold", game.staff?.coachLevel === lvl ? "text-emerald-400" : "text-slate-300")}>
                {lvl}
              </span>
              <span className="block text-[9px] text-slate-500">{COACH_LEVELS[lvl].label} · ${COACH_LEVELS[lvl].wage / 1000}K/w</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-1.5">
          Current coach bonus ×{coachMultiplier(game.staff?.coachLevel).toFixed(2)} applied to every player&apos;s weekly XP. Staff wage ${Math.round(coach.wage / 1000)}K/week leaves the budget.
        </p>
      </section>
    </div>
  );
}
