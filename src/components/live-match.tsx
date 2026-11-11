"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Goal, Megaphone, Pause, Play, Shield, Square, Timer, Zap } from "lucide-react";

function eventIcon(type: string) {
  switch (type) {
    case "goal": return <Goal className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden />;
    case "card": return <Square className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0 mt-1" aria-hidden />;
    case "info": return <Megaphone className="h-3.5 w-3.5 text-sky-400 shrink-0 mt-0.5" aria-hidden />;
    default: return <span className="h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0 mt-2" aria-hidden />;
  }
}

/* ---------- v4.4 crowd audio + haptics ---------- */
function playCrowdRoar(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const dur = 1.6;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      // swelling white-noise roar
      data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) * 0.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + dur);
    if (navigator.vibrate) navigator.vibrate([90, 40, 160]);
  } catch {
    /* audio unavailable */
  }
}

export function LiveMatch() {
  const liveSnapshot = useAppStore((s) => s.liveSnapshot);
  const runner = useAppStore((s) => s.runner);
  const dataset = useAppStore((s) => s.dataset);
  const game = useAppStore((s) => s.game);
  const liveFixtureId = useAppStore((s) => s.liveFixtureId);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const lastGoalCount = useRef(0);
  const shout = useAppStore((s) => s.shout);

  const fx = game?.fixtures.find((f) => f.id === liveFixtureId);
  const homeId = fx?.homeId ?? 0;
  const awayId = fx?.awayId ?? 0;
  const homeTeam = dataset?.teams.find((t) => t.id === homeId);
  const awayTeam = dataset?.teams.find((t) => t.id === awayId);
  const userIsHome = fx ? fx.homeId === game?.clubId : true;

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [liveSnapshot?.events.length]);

  // goal roar + haptics
  useEffect(() => {
    if (!liveSnapshot) return;
    const goals = liveSnapshot.homeGoals + liveSnapshot.awayGoals;
    if (goals > lastGoalCount.current) {
      lastGoalCount.current = goals;
      playCrowdRoar(useAppStore.getState().game?.soundEnabled ?? true);
    }
  }, [liveSnapshot?.homeGoals, liveSnapshot?.awayGoals, liveSnapshot]);

  if (!liveSnapshot || !game || !dataset) return null;

  const homeShort = homeTeam?.shortName ?? "HOM";
  const awayShort = awayTeam?.shortName ?? "AWY";
  const userGoalsFirst = userIsHome;
  const displayScore: [number, number] = userGoalsFirst
    ? [liveSnapshot.homeGoals, liveSnapshot.awayGoals]
    : [liveSnapshot.awayGoals, liveSnapshot.homeGoals];
  const displayNames: [string, string] = userIsHome ? [homeShort, awayShort] : [awayShort, homeShort];

  const minute = liveSnapshot.minute;
  const progress = Math.min(100, (minute / 95) * 100);

  const changeSpeed = (s: number) => {
    setSpeed(s);
    runner?.setSpeed(s);
  };

  const togglePause = () => {
    if (paused) {
      runner?.resume();
      setPaused(false);
    } else {
      runner?.pause();
      setPaused(true);
    }
  };

  return (
    <section aria-label="Live match" className="space-y-3">
      {/* scoreboard */}
      <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-b from-emerald-950/40 to-slate-900 p-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-medium">{liveSnapshot.half === "FT" ? "Full Time" : liveSnapshot.half === 2 ? "2nd Half" : "1st Half"}</span>
          <span className="font-mono text-emerald-400 font-bold">{minute}&apos;</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex-1 text-center">
            <p className={cn("text-sm font-bold truncate", userIsHome ? "text-emerald-300" : "text-slate-200")}>{displayNames[0]}</p>
          </div>
          <div className="px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 font-mono text-2xl font-black text-slate-50 tabular-nums">
            {displayScore[0]}<span className="text-slate-600 mx-1.5">-</span>{displayScore[1]}
          </div>
          <div className="flex-1 text-center">
            <p className={cn("text-sm font-bold truncate", !userIsHome ? "text-emerald-300" : "text-slate-200")}>{displayNames[1]}</p>
          </div>
        </div>
        <Progress value={progress} className="mt-3 h-1 bg-slate-800" aria-label="Match progress" />

        {/* momentum meter */}
        {typeof liveSnapshot.momentum === "number" && (
          <div className="mt-3" aria-label="Match momentum">
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-500">
              <span className={cn(liveSnapshot.momentum > 15 && "text-emerald-400")}>{displayNames[0]}</span>
              <span>Momentum</span>
              <span className={cn(liveSnapshot.momentum < -15 && "text-sky-400")}>{displayNames[1]}</span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-600" aria-hidden />
              <div
                className={cn("absolute inset-y-0 rounded-full transition-all duration-700", liveSnapshot.momentum >= 0 ? "bg-emerald-500" : "bg-sky-500")}
                style={{
                  width: `${Math.min(50, Math.abs(liveSnapshot.momentum) / 2)}%`,
                  left: liveSnapshot.momentum >= 0 ? "50%" : undefined,
                  right: liveSnapshot.momentum < 0 ? "50%" : undefined,
                }}
                aria-hidden
              />
            </div>
          </div>
        )}

        {/* stats */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-400">
          <div>
            <p className="font-mono text-slate-200 text-xs">{liveSnapshot.stats.possession[0]}% · {liveSnapshot.stats.possession[1]}%</p>
            <p>Possession</p>
          </div>
          <div>
            <p className="font-mono text-slate-200 text-xs">{liveSnapshot.stats.shots[0]} · {liveSnapshot.stats.shots[1]}</p>
            <p>Shots (on target {liveSnapshot.stats.onTarget[0]}-{liveSnapshot.stats.onTarget[1]})</p>
          </div>
          <div>
            <p className="font-mono text-slate-200 text-xs">{liveSnapshot.stats.xg[0]} · {liveSnapshot.stats.xg[1]}</p>
            <p>Expected goals</p>
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="flex items-center gap-2" role="group" aria-label="Match speed controls">
        <Button variant="outline" size="sm" className="h-8 border-slate-700" onClick={togglePause} aria-label={paused ? "Resume match" : "Pause match"}>
          {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
          {paused ? "Resume" : "Pause"}
        </Button>
        {[1, 2, 4].map((s) => (
          <Button
            key={s}
            variant="outline"
            size="sm"
            className={cn("h-8 border-slate-700", speed === s && !paused && "border-emerald-500/60 text-emerald-400")}
            onClick={() => changeSpeed(s)}
            aria-pressed={speed === s}
          >
            {s}x
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-amber-500/50 text-amber-400 ml-auto"
          onClick={() => runner?.instant()}
          aria-label="Skip to full time"
        >
          <Zap className="h-3.5 w-3.5 mr-1" aria-hidden />
          Skip to FT
        </Button>
      </div>

      {/* v4.4 touchline shouts */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5" aria-hidden /> Touchline shouts
          <span className="ml-auto font-mono text-[10px] text-slate-600">{liveSnapshot.shoutsLeft ?? 3} left</span>
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {([
            { id: "go-all-out" as const, label: "Go all out", icon: Goal },
            { id: "park-the-bus" as const, label: "Park the bus", icon: Shield },
            { id: "press-hard" as const, label: "Press hard", icon: Zap },
            { id: "time-waste" as const, label: "Run the clock", icon: Timer },
          ]).map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant="outline"
              size="sm"
              className="h-9 border-slate-700 text-[11px] font-semibold"
              disabled={(liveSnapshot.shoutsLeft ?? 3) <= 0}
              onClick={() => shout(id)}
              aria-label={`Shout: ${label}`}
            >
              <Icon className="h-3.5 w-3.5 mr-1.5" aria-hidden />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* commentary */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/50">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 pt-2.5">Commentary</p>
        <div ref={feedRef} className="max-h-64 overflow-y-auto overscroll-contain scrollbar-thin touch-scroll px-3 pb-3">
          <ol className="space-y-2 pt-1" aria-live="polite" aria-label="Match commentary feed">
            {[...liveSnapshot.events].reverse().map((e, i) => (
              <li key={`${e.minute}-${i}`} className={cn("flex gap-2 text-xs leading-snug", e.type === "goal" && "font-semibold text-emerald-300", e.type === "card" && "text-amber-200", e.type === "injury" && "text-rose-300")}>
                <span className="font-mono text-slate-500 w-8 shrink-0 text-right">{e.minute}&apos;</span>
                {eventIcon(e.type)}
                <span className={cn(e.type === "goal" ? "text-emerald-200" : e.type === "ht" || e.type === "ko" || e.type === "ft" ? "text-slate-400 italic" : "text-slate-300")}>{e.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
