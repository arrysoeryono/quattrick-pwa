"use client";

/**
 * Danger Zone — full data-destruction panel.
 * Shows a live preview of everything that will be deleted, lists the
 * consequences, and requires typing RESET_ALL_DATA before the nuclear
 * reset button unlocks. Lighter destructive actions (retire, regenerate)
 * are kept as separate quick actions.
 */
import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { generateDefaultDataset } from "@/lib/game/defaultData";
import { getGameDb } from "@/lib/game/dexie";
import { cn } from "@/lib/utils";
import {
  Database,
  Eye,
  EyeOff,
  HardDrive,
  ListOrdered,
  RefreshCw,
  Shield,
  Trash2,
  TriangleAlert,
  Trophy,
  User,
  Users,
} from "lucide-react";

const CONFIRM_PHRASE = "RESET_ALL_DATA";

interface DataCounts {
  saves: number;
  careers: number;
  trophies: number;
  players: number;
  clubs: number;
  leagues: number;
}

export function DangerZone() {
  const game = useAppStore((s) => s.game);
  const dataset = useAppStore((s) => s.dataset);
  const importDataset = useAppStore((s) => s.importDataset);
  const resetAllData = useAppStore((s) => s.resetAllData);

  const [hidden, setHidden] = useState(false);
  const [counts, setCounts] = useState<DataCounts | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

  /* remember the hide preference across visits */
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem("quattrick-danger-hidden") === "1");
    } catch {
      /* private mode */
    }
  }, []);

  const toggleHidden = () => {
    setHidden((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("quattrick-danger-hidden", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  /* live recount straight from IndexedDB + active state */
  const recount = useCallback(async () => {
    setRefreshing(true);
    try {
      const saves = await getGameDb().saves.count().catch(() => 0);
      setCounts({
        saves,
        careers: game ? 1 : 0,
        trophies: game?.achievements?.length ?? 0,
        players: dataset?.players.length ?? 0,
        clubs: dataset?.teams.length ?? 0,
        leagues: dataset?.leagues.length ?? 0,
      });
    } finally {
      setRefreshing(false);
    }
  }, [game, dataset]);

  useEffect(() => {
    void recount();
  }, [recount]);

  const total = counts ? counts.saves + counts.careers + counts.trophies + counts.players + counts.clubs + counts.leagues : 0;
  const confirmed = confirmText.trim() === CONFIRM_PHRASE;

  const summaryItems = [
    { label: "Local saves", icon: HardDrive, value: counts?.saves ?? 0 },
    { label: "Active career", icon: User, value: counts?.careers ?? 0 },
    { label: "Trophies", icon: Trophy, value: counts?.trophies ?? 0 },
    { label: "Players", icon: Users, value: counts?.players ?? 0 },
    { label: "Clubs", icon: Shield, value: counts?.clubs ?? 0 },
    { label: "Leagues", icon: ListOrdered, value: counts?.leagues ?? 0 },
  ];

  return (
    <section aria-label="Danger zone" className="rounded-xl border border-rose-500/30 bg-gradient-to-b from-rose-500/[0.07] to-rose-500/[0.03] p-3.5">
      {/* header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-start gap-2">
          <TriangleAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-sm font-bold text-rose-300">Danger Zone</p>
            <p className="text-[11px] text-rose-400/70">Permanent actions that erase data for good</p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleHidden}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-rose-300/80 hover:bg-rose-500/10 transition-colors"
          aria-expanded={!hidden}
          aria-label={hidden ? "Show danger zone actions" : "Hide danger zone actions"}
        >
          {hidden ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
          {hidden ? "Show" : "Hide"}
        </button>
      </div>

      {!hidden && (
        <div className="space-y-3">
          {/* data summary (preview) */}
          <div className="rounded-xl border border-rose-500/20 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between mb-2.5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                <Database className="h-3.5 w-3.5 text-rose-400" aria-hidden />
                Data summary (preview)
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
                onClick={() => void recount()}
                aria-label="Refresh data summary"
                disabled={refreshing}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-3" role="list" aria-label="Items that will be deleted">
              {summaryItems.map((item) => (
                <div key={item.label} role="listitem" className="min-w-0">
                  <p className="flex items-center gap-1 text-[9px] font-medium text-slate-500 truncate mb-0.5">
                    <item.icon className="h-3 w-3 shrink-0" aria-hidden />
                    {item.label}
                  </p>
                  <p className="text-lg font-bold leading-none text-rose-300 tabular-nums">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-rose-500/15 pt-2.5">
              <p className="text-xs font-bold text-slate-200">
                Total items to be deleted: <span className="text-rose-400 tabular-nums">{total}</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                Nothing is kept back. The whole on-device game database is emptied.
              </p>
            </div>
          </div>

          {/* lighter destructive quick actions */}
          <div className="grid grid-cols-1 gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full h-10 justify-start border-rose-500/40 bg-transparent text-rose-300 hover:bg-rose-500/10 hover:text-rose-200">
                  <Trash2 className="h-4 w-4 mr-2" aria-hidden />
                  Retire manager (delete active save)
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[380px]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Retire from {dataset?.teams.find((t) => t.id === game?.clubId)?.name ?? "your club"}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes the active save from this device. Cloud copies are kept until overwritten.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-rose-600 hover:bg-rose-500"
                    onClick={() => {
                      const saveId = useAppStore.getState().saveId;
                      if (saveId) void useAppStore.getState().removeSave(saveId);
                    }}
                  >
                    Retire
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full h-10 justify-start border-rose-500/40 bg-transparent text-rose-300 hover:bg-rose-500/10 hover:text-rose-200">
                  <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
                  Regenerate world database
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[380px]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Regenerate the player database?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Builds a fresh 10-club world including the new LWB / RWB / CDM depth chart. Existing saves stay untouched — new squads appear when you start or reload careers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-rose-600 hover:bg-rose-500"
                    onClick={() => {
                      void importDataset(generateDefaultDataset(), "builtin");
                    }}
                  >
                    Regenerate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* permanent warning */}
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3" role="alert">
            <p className="flex items-start gap-2 text-xs font-bold text-rose-200 leading-snug">
              <TriangleAlert className="h-4 w-4 shrink-0 mt-px" aria-hidden />
              This action is permanent and cannot be undone!
            </p>
            <ul className="mt-2 space-y-1.5 text-[11px] text-rose-300/80 list-disc pl-7 pr-1 marker:text-rose-400/60">
              <li>Every local career save on this device (IndexedDB) will be deleted</li>
              <li>Your active career, season stats, records and trophies will be gone</li>
              <li>The player &amp; club database is wiped, then re-synced fresh from the Neon cloud (factory defaults only when offline)</li>
              <li>Onboarding starts over as if you just installed the app</li>
              <li>Cloud career saves in Neon Postgres are NOT removed — delete those separately first if wanted</li>
            </ul>
          </div>

          {/* type-to-confirm */}
          <div>
            <p className="text-xs font-semibold text-slate-200 mb-1.5">
              Type <kbd className="rounded bg-rose-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-300 border border-rose-500/30">RESET_ALL_DATA</kbd> to confirm
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Type ${CONFIRM_PHRASE} here ...`}
              aria-label={`Type ${CONFIRM_PHRASE} to confirm full reset`}
              className="h-10 rounded-lg border-slate-700 bg-slate-950/80 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus-visible:ring-rose-500/60 focus-visible:border-rose-500/50"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>

          {/* nuclear button */}
          <Button
            className={cn(
              "w-full h-11 font-bold text-white transition-colors",
              confirmed ? "bg-rose-600 hover:bg-rose-500" : "bg-rose-900/60 hover:bg-rose-900/60",
            )}
            disabled={!confirmed || resetting}
            onClick={() => {
              setResetting(true);
              void resetAllData().finally(() => setResetting(false));
            }}
            aria-disabled={!confirmed || resetting}
          >
            {resetting ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" aria-hidden />
            )}
            {resetting ? "Resetting everything..." : "Reset All Data"}
          </Button>
        </div>
      )}
    </section>
  );
}
