"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { OnboardingScreen } from "@/components/onboarding";
import { AppHeader } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
import { HomeTab } from "@/components/tabs/home-tab";
import { SquadTab } from "@/components/tabs/squad-tab";
import { TacticsTab } from "@/components/tabs/tactics-tab";
import { TransfersTab } from "@/components/tabs/transfers-tab";
import { MoreTab } from "@/components/tabs/more-tab";
import { LoaderCircle } from "lucide-react";

export function AppShell() {
  const phase = useAppStore((s) => s.phase);
  const activeTab = useAppStore((s) => s.activeTab);
  const boot = useAppStore((s) => s.boot);

  useEffect(() => {
    if (phase === "boot") void boot();
  }, [phase, boot]);

  if (phase === "boot") {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex justify-center items-center font-sans antialiased">
        <div className="w-full max-w-[480px] h-screen bg-slate-900 border-x border-slate-800 flex flex-col items-center justify-center gap-4 relative overflow-hidden shadow-2xl">
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

  return (
    <div className="min-h-screen w-full bg-slate-950 flex justify-center items-center font-sans antialiased">
      <div className="w-full max-w-[480px] h-screen bg-slate-900 border-x border-slate-800 flex flex-col relative overflow-hidden shadow-2xl">
        <AppHeader />
        <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 scrollbar-thin" aria-label="Main content">
          {activeTab === "home" && <HomeTab />}
          {activeTab === "squad" && <SquadTab />}
          {activeTab === "tactics" && <TacticsTab />}
          {activeTab === "transfers" && <TransfersTab />}
          {activeTab === "more" && <MoreTab />}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
