"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Cloud, CloudOff, Play, Trash2, Trophy, UserRound } from "lucide-react";
import { formatDate } from "@/lib/format";
import { DIFFICULTY_META, type Difficulty } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const CREST_COLORS = [
  "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-teal-600", "bg-orange-600",
  "bg-lime-700", "bg-fuchsia-700", "bg-cyan-700", "bg-red-700", "bg-yellow-600",
];

function crestColor(teamId: number): string {
  return CREST_COLORS[Math.abs(teamId) % CREST_COLORS.length];
}

export function OnboardingScreen() {
  const dataset = useAppStore((s) => s.dataset);
  const saves = useAppStore((s) => s.saves);
  const startCareer = useAppStore((s) => s.startCareer);
  const continueSave = useAppStore((s) => s.continueSave);
  const removeSave = useAppStore((s) => s.removeSave);
  const cloudOnline = useAppStore((s) => s.cloudOnline);

  const [managerName, setManagerName] = useState("");
  const [selectedClub, setSelectedClub] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("pro");
  const [starting, setStarting] = useState(false);

  const teams = useMemo(() => {
    const list = [...(dataset?.teams ?? [])];
    list.sort((a, b) => b.reputation - a.reputation);
    return list;
  }, [dataset]);

  const canStart = managerName.trim().length >= 2 && selectedClub !== null;

  const handleStart = async () => {
    if (!canStart) return;
    setStarting(true);
    await startCareer(managerName.trim(), selectedClub!, difficulty);
    setStarting(false);
  };

  return (
    <div className="app-viewport w-full bg-slate-950 flex justify-center items-center font-sans antialiased">
      <div className="w-full max-w-[480px] h-full bg-slate-900 border-x border-slate-800 flex flex-col relative overflow-hidden shadow-2xl">
        {/* hero */}
        <div className="px-6 pt-10 pb-6 border-b border-slate-800 bg-gradient-to-b from-emerald-950/40 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Trophy className="h-7 w-7 text-emerald-400" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-50">
                QUATTRICK
              </h1>
              <p className="text-xs text-slate-400">Football Manager</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs">
            {cloudOnline === false ? (
              <Badge variant="outline" className="gap-1 border-slate-700 text-slate-400">
                <CloudOff className="h-3 w-3" aria-hidden /> Offline mode
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-400">
                <Cloud className="h-3 w-3" aria-hidden /> Cloud connected
              </Badge>
            )}
            <Badge variant="outline" className="border-slate-700 text-slate-400">
              {dataset?.players.length ?? 0} players · {dataset?.teams.length ?? 0} clubs
            </Badge>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin touch-scroll">
          <div className="p-4 space-y-5">
            {/* continue saves */}
            {saves.length > 0 && (
              <section aria-label="Saved careers">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Continue career</h2>
                <div className="space-y-2">
                  {saves.slice(0, 4).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3"
                    >
                      <div className={`h-9 w-9 shrink-0 rounded-lg ${crestColor(s.clubId ?? 0)} flex items-center justify-center text-[10px] font-black text-white`}>
                        {dataset?.teams.find((t) => t.id === s.clubId)?.shortName ?? "FC"}
                      </div>
                      <button
                        type="button"
                        onClick={() => void continueSave(s.id)}
                        className="flex-1 min-w-0 text-left"
                        aria-label={`Continue career ${s.saveName}`}
                      >
                        <p className="text-sm font-semibold text-slate-100 truncate">{s.saveName}</p>
                        <p className="text-xs text-slate-500">{formatDate(typeof s.currentDate === "string" ? s.currentDate.slice(0, 10) : String(s.currentDate))}, tap to continue</p>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-rose-400"
                        aria-label={`Delete save ${s.saveName}`}
                        onClick={() => void removeSave(s.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* new career */}
            <section aria-label="New career">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">New career</h2>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" aria-hidden />
                <Input
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="Manager name"
                  maxLength={30}
                  className="pl-9 bg-slate-950 border-slate-800"
                  aria-label="Manager name"
                />
              </div>
              <p className="text-xs text-slate-500 mt-3 mb-2">Choose difficulty</p>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Difficulty selection">
                {(Object.keys(DIFFICULTY_META) as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    aria-pressed={difficulty === d}
                    className={cn(
                      "min-h-[52px] rounded-lg border p-1.5 text-center transition-colors",
                      difficulty === d
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                        : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700",
                    )}
                  >
                    <span className="block text-[11px] font-bold">{DIFFICULTY_META[d].label}</span>
                    <span className="block text-[9px] text-slate-500 leading-tight">{DIFFICULTY_META[d].desc}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3 mb-2">Choose your club</p>
              <div className="space-y-2">
                {teams.map((t) => {
                  const selected = selectedClub === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedClub(t.id)}
                      aria-pressed={selected}
                      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? "border-emerald-500/60 bg-emerald-500/10"
                          : "border-slate-800 bg-slate-900 hover:border-slate-700"
                      }`}
                    >
                      <div className={`h-9 w-9 shrink-0 rounded-lg ${crestColor(t.id)} flex items-center justify-center text-[10px] font-black text-white`}>
                        {t.shortName}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">{t.name}</p>
                        <p className="text-xs text-slate-500">
                          Reputation {t.reputation} · ${(t.transferBudget / 1e6).toFixed(0)}M budget
                        </p>
                      </div>
                      <div className="flex gap-0.5" aria-label={`Reputation ${t.reputation} of 100`}>
                        {[80, 70, 60, 55].map((threshold) => (
                          <span
                            key={threshold}
                            className={`h-1.5 w-4 rounded-full ${t.reputation >= threshold ? "bg-emerald-400" : "bg-slate-700"}`}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="pb-6">
              <Button
                size="lg"
                className="w-full h-12 text-base font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                disabled={!canStart || starting}
                onClick={() => void handleStart()}
                aria-label="Start managerial career"
              >
                <Play className="h-5 w-5 mr-2" aria-hidden />
                {starting ? "Setting up squad..." : "Start Career"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
