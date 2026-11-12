"use client";

import { useAppStore, type TabKey } from "@/lib/store/gameStore";
import { ArrowLeftRight, Briefcase, Dumbbell, House, Sparkles, Trophy, Users } from "lucide-react";

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof House;
}

/** Manager career: FC-style Central / Squad / Transfers / Season / Office. */
const MANAGER_TABS: TabDef[] = [
  { key: "home", label: "Central", icon: House },
  { key: "squad", label: "Squad", icon: Users },
  { key: "transfers", label: "Transfers", icon: ArrowLeftRight },
  { key: "season", label: "Season", icon: Trophy },
  { key: "office", label: "Office", icon: Briefcase },
];

/** Player career: Home / My Pro / Activities / Squad / Season. */
const PLAYER_TABS: TabDef[] = [
  { key: "home", label: "Home", icon: House },
  { key: "mypro", label: "My Pro", icon: Sparkles },
  { key: "activities", label: "Activities", icon: Dumbbell },
  { key: "squad", label: "Squad", icon: Users },
  { key: "season", label: "Season", icon: Trophy },
];

export function BottomNav() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const liveFixtureId = useAppStore((s) => s.liveFixtureId);
  const game = useAppStore((s) => s.game);

  const isPlayer = game?.careerMode === "player";
  const TABS = isPlayer ? PLAYER_TABS : MANAGER_TABS;

  const pendingCount = game
    ? game.inbox.filter((m) => !m.resolvedOptionId).length +
      (game.press && game.press.answered.length < game.press.questions.length ? 1 : 0) +
      (game.pro?.pendingDecision ? 1 : 0)
    : 0;

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
              {key === "home" && (liveFixtureId || pendingCount > 0) && (
                liveFixtureId ? (
                  <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
                ) : (
                  <span className="absolute -top-1.5 -right-2 min-w-3.5 h-3.5 px-0.5 rounded-full bg-amber-500 text-[8px] font-black text-slate-950 flex items-center justify-center" aria-label={`${pendingCount} pending`}>
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )
              )}
            </span>
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
