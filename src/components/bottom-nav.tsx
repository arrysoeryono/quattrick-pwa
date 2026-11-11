"use client";

import { useAppStore, type TabKey } from "@/lib/store/gameStore";
import { ArrowLeftRight, ClipboardList, House, Settings, Users } from "lucide-react";

const TABS: { key: TabKey; label: string; icon: typeof House }[] = [
  { key: "home", label: "Home", icon: House },
  { key: "squad", label: "Squad", icon: Users },
  { key: "tactics", label: "Tactics", icon: ClipboardList },
  { key: "transfers", label: "Market", icon: ArrowLeftRight },
  { key: "more", label: "More", icon: Settings },
];

export function BottomNav() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const liveFixtureId = useAppStore((s) => s.liveFixtureId);

  return (
    <nav
      className="h-16 bg-slate-900/95 backdrop-blur border-t border-slate-800 grid grid-cols-5 absolute bottom-0 inset-x-0 z-40 pb-safe"
      aria-label="App navigation"
    >
      {TABS.map(({ key, label, icon: Icon }) => {
        const active = activeTab === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={`relative flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors ${
              active ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-emerald-400" aria-hidden />}
            <span className="relative">
              <Icon className="h-5 w-5" aria-hidden />
              {key === "home" && liveFixtureId && (
                <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
              )}
            </span>
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
