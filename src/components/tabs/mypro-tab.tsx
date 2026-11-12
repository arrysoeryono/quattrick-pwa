"use client";

import { useMemo } from "react";
import { Check, Handshake, Plus, Shield, Sparkles, Target, Zap } from "lucide-react";
import { useAppStore } from "@/lib/store/gameStore";
import {
  proRequestTransfer,
  proSkillTree,
  proSpendSkillPoint,
  proTransferReady,
} from "@/lib/game/playerCareer";
import { computePlayStyles } from "@/lib/game/development";
import { posBadgeClass } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PERSONALITY_ROWS = [
  {
    key: "maverick" as const,
    label: "Maverick",
    desc: "Bold, flamboyant, unpredictable",
    bar: "[&>div]:bg-amber-400",
    text: "text-amber-400",
  },
  {
    key: "virtuoso" as const,
    label: "Virtuoso",
    desc: "Professional, technical excellence",
    bar: "[&>div]:bg-emerald-500",
    text: "text-emerald-400",
  },
  {
    key: "heartbeat" as const,
    label: "Heartbeat",
    desc: "Leader, loved by fans and dressing room",
    bar: "[&>div]:bg-teal-400",
    text: "text-teal-400",
  },
];

function trustLabel(trust: number): string {
  if (trust >= 70) return "Undroppable — the manager believes in you";
  if (trust >= 45) return "Solid standing — keep performing";
  if (trust >= 25) return "Faith is fading — impress in training";
  return "Frozen out — a move may be needed";
}

export function MyProTab() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const update = useAppStore((s) => s.update);
  const { toast } = useToast();

  const player = useMemo(
    () => (game?.pro ? game.players.find((p) => p.id === game.pro!.playerId) ?? null : null),
    [game],
  );

  if (!game || !dataset) return null;

  if (!game.pro || !player) {
    return (
      <section aria-label="Player career unavailable" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">My Pro</h2>
        <p className="mt-1.5 text-sm text-slate-400">
          Player Career only. Start a Be a Pro save to grow your wonderkid here.
        </p>
      </section>
    );
  }

  const pro = game.pro;
  const club = dataset.teams.find((t) => t.id === game.clubId);
  const skillTree = proSkillTree(player);
  const playStyles = computePlayStyles(player);
  const transferReady = proTransferReady(game);
  const avgRating = player.seasonStats.apps > 0 ? player.seasonStats.ratingSum / player.seasonStats.apps : 0;

  /** update() executes the mutator synchronously, so msg is set before the toast fires. */
  const spendPoint = (attrKey: string) => {
    let msg = "";
    update((g) => {
      const r = proSpendSkillPoint(g, attrKey);
      msg = r.message;
    });
    if (msg) toast({ title: msg });
  };

  const requestTransfer = () => {
    const st = useAppStore.getState();
    if (!st.game || !st.dataset) return;
    const res = proRequestTransfer(structuredClone(st.game), st.dataset);
    if (res.ok) {
      useAppStore.setState({ game: res.game, dataset: res.dataset });
      void st.syncNow();
    }
    toast({ title: res.message });
  };

  return (
    <div className="space-y-4">
      {/* Pro header */}
      <section aria-label="Pro profile" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-100">{player.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[10px] font-bold",
                  posBadgeClass(player.position),
                )}
              >
                {player.position}
              </span>
              <span className="text-[11px] text-slate-400">Age {player.age}</span>
              <span className="truncate text-[11px] text-slate-500">{club?.shortName ?? "Free agent"}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Contract: {player.contractYears} year{player.contractYears === 1 ? "" : "s"} left
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5 text-center">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1">
              <p className="text-[9px] uppercase tracking-wider text-amber-400">OVR</p>
              <p className="text-lg font-black leading-none text-amber-400">{player.overallRating}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1">
              <p className="text-[9px] uppercase tracking-wider text-slate-500">POT</p>
              <p className="text-lg font-black leading-none text-slate-200">{player.potential}</p>
            </div>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Sharpness</span>
              <span>{player.sharpness}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${player.sharpness}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Stamina</span>
              <span>{player.stamina}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-teal-400" style={{ width: `${player.stamina}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* Skill points */}
      <section aria-label="Skill points" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Zap className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Skill points
          </p>
          <span className="text-2xl font-black text-emerald-400">{pro.skillPoints}</span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">Earn points from match ratings and objectives</p>
      </section>

      {/* Skill tree */}
      <section aria-label="Skill tree">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Skill tree</h2>
        <div className="grid grid-cols-2 gap-2">
          {skillTree.map((attr) => (
            <div key={attr.key} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-1">
                <p className="min-w-0 truncate text-[11px] font-semibold text-slate-300">{attr.label}</p>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6 shrink-0 border-emerald-600/40 bg-slate-900 p-0 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                  disabled={pro.skillPoints < 1 || attr.value >= attr.max}
                  onClick={() => spendPoint(attr.key)}
                  aria-label={`Improve ${attr.label}`}
                >
                  <Plus className="h-3 w-3" aria-hidden />
                </Button>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-sm font-bold text-slate-100">{attr.value}</span>
                <span className="text-[10px] text-slate-500">/ {attr.max}</span>
              </div>
              <Progress
                value={attr.value}
                className="mt-1 h-1.5 bg-slate-800 [&>div]:bg-emerald-500"
                aria-label={`${attr.label} ${attr.value} out of ${attr.max}`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* PlayStyles */}
      <section aria-label="PlayStyles" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Sparkles className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> PlayStyles
        </p>
        {playStyles.length === 0 ? (
          <p className="mt-1.5 text-[11px] text-slate-500">
            No PlayStyles yet — push a key attribute to 80 or higher.
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {playStyles.map((ps) => (
              <span
                key={ps.id}
                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400"
              >
                {ps.name}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Personality */}
      <section aria-label="Personality" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Personality</h2>
        <div className="mt-2 space-y-2.5">
          {PERSONALITY_ROWS.map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between text-[11px]">
                <span className={cn("font-semibold", row.text)}>{row.label}</span>
                <span className="text-slate-500">{pro.personality[row.key]}/100</span>
              </div>
              <Progress
                value={pro.personality[row.key]}
                className={cn("mt-1 h-1.5 bg-slate-800", row.bar)}
                aria-label={`${row.label} ${pro.personality[row.key]} out of 100`}
              />
              <p className="mt-0.5 text-[10px] text-slate-600">{row.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Objectives */}
      <section aria-label="Season objectives">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Target className="h-3.5 w-3.5 text-amber-400" aria-hidden /> Objectives
        </h2>
        <div className="space-y-2">
          {pro.objectives.map((o) => {
            const isAvg = o.kind === "avgRating";
            const curTxt = isAvg ? (o.current / 100).toFixed(2) : String(o.current);
            const tgtTxt = isAvg ? (o.target / 100).toFixed(2) : String(o.target);
            const pct = Math.min(100, Math.round((o.current / Math.max(1, o.target)) * 100));
            return (
              <div key={o.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[11px] font-semibold text-slate-300">{o.label}</p>
                  {o.done ? (
                    <Badge className="border-emerald-500/40 bg-emerald-500/15 text-[10px] text-emerald-400">
                      <Check className="h-3 w-3" aria-hidden /> Done
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-400">
                      +{o.reward} SP
                    </Badge>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                  <span>
                    {curTxt} / {tgtTxt}
                  </span>
                  <span>{pct}%</span>
                </div>
                <Progress
                  value={pct}
                  className={cn("mt-1 h-1.5 bg-slate-800", o.done ? "[&>div]:bg-emerald-500" : "[&>div]:bg-amber-400")}
                  aria-label={`${o.label} progress ${pct}%`}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Agent / transfer */}
      <section aria-label="Agent and transfer" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Handshake className="h-3.5 w-3.5 text-amber-400" aria-hidden /> Agent
        </p>
        <p className="mt-2 text-[11px] text-slate-400">Target club for a dream move</p>
        <Select
          value={pro.agentTargetClubId !== null ? String(pro.agentTargetClubId) : "none"}
          onValueChange={(v) => {
            update((g) => {
              if (g.pro) g.pro.agentTargetClubId = v === "none" ? null : Number(v) || null;
            });
          }}
        >
          <SelectTrigger
            className="mt-1 w-full border-slate-700 bg-slate-900 text-xs text-slate-200"
            aria-label="Agent target club"
          >
            <SelectValue placeholder="Select target club" />
          </SelectTrigger>
          <SelectContent className="max-h-64 border-slate-700 bg-slate-900">
            <SelectItem value="none" className="text-xs text-slate-300">
              None
            </SelectItem>
            {dataset.teams
              .filter((t) => t.leagueId === game.leagueId && t.id !== game.clubId)
              .map((t) => (
                <SelectItem key={t.id} value={String(t.id)} className="text-xs text-slate-300">
                  {t.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <p className="mt-2 text-[11px] text-slate-500">
          {"Requirements: 15+ apps and 7.15+ avg rating (or trust <= 15)."}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-600">
          Current: {player.seasonStats.apps} apps, {avgRating.toFixed(2)} avg, trust {pro.managerTrust}
        </p>
        {transferReady && (
          <Button
            className="mt-2.5 h-9 w-full bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-500"
            onClick={requestTransfer}
            aria-label="Request transfer via agent"
          >
            Request transfer
          </Button>
        )}
      </section>

      {/* Manager trust */}
      <section aria-label="Manager trust" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-slate-300">
            <Shield className="h-3.5 w-3.5 text-amber-400" aria-hidden /> Manager trust
          </span>
          <span className="font-bold text-amber-400">{pro.managerTrust}/100</span>
        </div>
        <Progress
          value={pro.managerTrust}
          className="mt-2 h-2 bg-slate-800 [&>div]:bg-amber-400"
          aria-label={`Manager trust ${pro.managerTrust} out of 100`}
        />
        <p className="mt-1.5 text-[10px] text-slate-500">{trustLabel(pro.managerTrust)}</p>
      </section>
    </div>
  );
}
