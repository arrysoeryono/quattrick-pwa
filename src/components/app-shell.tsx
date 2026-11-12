"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { OnboardingScreen } from "@/components/onboarding";
import { AppHeader } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
import { HomeTab } from "@/components/tabs/home-tab";
import { SquadTab } from "@/components/tabs/squad-tab";
import { TransfersTab } from "@/components/tabs/transfers-tab";
import { SeasonTab } from "@/components/tabs/season-tab";
import { OfficeTab } from "@/components/tabs/office-tab";
import { MyProTab } from "@/components/tabs/mypro-tab";
import { ActivitiesTab } from "@/components/tabs/activities-tab";
import { setCurrency } from "@/lib/format";
import { LoaderCircle } from "lucide-react";

export function AppShell() {
  const phase = useAppStore((s) => s.phase);
  const activeTab = useAppStore((s) => s.activeTab);
  const game = useAppStore((s) => s.game);
  const boot = useAppStore((s) => s.boot);

  useEffect(() => {
    if (phase === "boot") void boot();
  }, [phase, boot]);

  // v6.0 — keep the global currency formatter in sync with the save's settings
  useEffect(() => {
    setCurrency(game?.settings?.currency);
  }, [game?.settings?.currency]);

  if (phase === "boot") {
    return (
      <div className="app-viewport w-full bg-slate-950 flex justify-center items-center font-sans antialiased">
        <div className="w-full max-w-[480px] h-full bg-slate-900 border-x border-slate-800 flex flex-col items-center justify-center gap-4 relative overflow-hidden shadow-2xl">
          <div className="h-16 w-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <LoaderCircle className="h-8 w-8 text-emerald-400 animate-spin" aria-hidden />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-100 tracking-tight">Quattrick Football Manager</p>
            <p className="text-xs text-slate-500 mt-1">Loading save engine (IndexedDB)...</p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "onboarding") {
    return <OnboardingScreen />;
  }

  const isPlayer = game?.careerMode === "player";

  return (
    <div className="app-viewport w-full bg-slate-950 flex justify-center items-center font-sans antialiased">
      <div className="w-full max-w-[480px] h-full bg-slate-900 border-x border-slate-800 flex flex-col relative overflow-hidden shadow-2xl">
        <AppHeader />
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4 pb-24 scrollbar-thin touch-scroll" aria-label="Main content">
          {activeTab === "home" && <HomeTab />}
          {activeTab === "squad" && <SquadTab />}
          {!isPlayer && activeTab === "transfers" && <TransfersTab />}
          {activeTab === "season" && <SeasonTab />}
          {!isPlayer && activeTab === "office" && <OfficeTab />}
          {isPlayer && activeTab === "mypro" && <MyProTab />}
          {isPlayer && activeTab === "activities" && <ActivitiesTab />}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
