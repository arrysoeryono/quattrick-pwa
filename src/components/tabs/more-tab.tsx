"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store/gameStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DatabaseManagerModal } from "@/components/database-manager-modal";
import { DangerZone } from "@/components/danger-zone";
import { formatDate, formatMoney } from "@/lib/format";
import { ACHIEVEMENTS } from "@/lib/game/career";
import { cn } from "@/lib/utils";
import { Cloud, CloudDownload, CloudOff, CloudUpload, Database, Download, FileSpreadsheet, RefreshCw, Trash2, Trophy, Upload } from "lucide-react";

export function MoreTab() {
  const dataset = useAppStore((s) => s.dataset);
  const game = useAppStore((s) => s.game);
  const saves = useAppStore((s) => s.saves);
  const activeCloudId = useAppStore((s) => s.activeCloudId);
  const cloudOnline = useAppStore((s) => s.cloudOnline);
  const syncNow = useAppStore((s) => s.syncNow);
  const refreshSaves = useAppStore((s) => s.refreshSaves);
  const continueSave = useAppStore((s) => s.continueSave);
  const removeSave = useAppStore((s) => s.removeSave);
  const importDataset = useAppStore((s) => s.importDataset);
  const disposeRunner = useAppStore((s) => s.disposeRunner);
  const pullCloudDatabase = useAppStore((s) => s.pullCloudDatabase);

  const [dbModal, setDbModal] = useState(false);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const showBusy = (msg: string, ms = 4000) => {
    setBusyMsg(msg);
    setTimeout(() => setBusyMsg(null), ms);
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    const res = await syncNow();
    setSyncing(false);
    showBusy(res.message, res.ok ? 3000 : 4500);
    if (res.ok) void refreshSaves();
  };

  const handlePullCloud = async () => {
    setPulling(true);
    const res = await pullCloudDatabase();
    setPulling(false);
    showBusy(res.message, res.ok ? 5000 : 4000);
  };

  useEffect(() => {
    disposeRunner();
  }, [disposeRunner]);

  if (!game || !dataset) return null;
  const unlocked = game.achievements ?? [];

  return (
    <div className="space-y-3">
      {busyMsg && (
        <p role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-300">{busyMsg}</p>
      )}

      {/* v4.4 career extras: trophy room + facility + sound */}
      <section aria-label="Trophy room and career settings" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-amber-400" aria-hidden /> Trophy room ({unlocked.length}/{ACHIEVEMENTS.length})
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {ACHIEVEMENTS.map((a) => {
              const got = unlocked.some((u) => u.id === a.id);
              return (
                <div
                  key={a.id}
                  title={a.desc}
                  className={cn(
                    "rounded-lg border p-2",
                    got ? "border-amber-500/40 bg-amber-500/10" : "border-slate-800 bg-slate-950/40 opacity-60",
                  )}
                >
                  <p className={cn("text-[10px] font-bold truncate", got ? "text-amber-300" : "text-slate-500")}>
                    {got ? <Trophy className="h-3 w-3 inline mr-1" aria-hidden /> : null}
                    {a.name}
                  </p>
                  <p className="text-[9px] text-slate-600 leading-tight">{a.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-[11px] font-semibold text-slate-300">Youth academy level {game.facilityLevel}/5</p>
            <p className="text-[10px] text-slate-500">Better facilities produce stronger academy regens each season.</p>
          </div>
          <Button
            size="sm"
            className="h-9 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
            disabled={game.facilityLevel >= 5 || game.transferBudget < game.facilityLevel * 3_000_000}
            onClick={() => {
              useAppStore.getState().update((g) => {
                if (g.facilityLevel < 5 && g.transferBudget >= g.facilityLevel * 3_000_000) {
                  g.transferBudget -= g.facilityLevel * 3_000_000;
                  g.facilityLevel += 1;
                }
              });
            }}
            aria-label={`Upgrade youth academy for ${formatMoney(game.facilityLevel * 3_000_000)}`}
          >
            {game.facilityLevel >= 5 ? "Max" : `Upgrade ${formatMoney(game.facilityLevel * 3_000_000)}`}
          </Button>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={game.soundEnabled}
          onClick={() => useAppStore.getState().update((g) => { g.soundEnabled = !g.soundEnabled; })}
          className={cn(
            "w-full flex items-center justify-between rounded-lg border p-2.5 transition-colors",
            game.soundEnabled ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-800 bg-slate-950/40",
          )}
        >
          <span className="text-xs font-semibold text-slate-200">Crowd sound & vibration on goals</span>
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", game.soundEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500")}>
            {game.soundEnabled ? "ON" : "OFF"}
          </span>
        </button>
      </section>

      {/* cloud status — full online, auto-sync */}
      <section aria-label="Cloud sync status" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {cloudOnline === false ? (
              <CloudOff className="h-4 w-4 text-slate-500" aria-hidden />
            ) : (
              <Cloud className="h-4 w-4 text-emerald-400" aria-hidden />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-200">
                {cloudOnline === false ? "Offline" : cloudOnline === null ? "Connecting..." : "Auto-sync on"}
              </p>
              <p className="text-[11px] text-slate-500">
                Database: {dataset.players.length} players, {dataset.teams.length} clubs
              </p>
            </div>
          </div>
          <Badge variant="outline" className={cloudOnline === false ? "border-slate-700 text-slate-500" : "border-emerald-500/40 text-emerald-400"}>
            {cloudOnline === false ? "OFFLINE" : "ONLINE"}
          </Badge>
        </div>
        <p className="text-[11px] text-slate-500 mt-2 leading-snug">
          Career data syncs to the cloud automatically.
        </p>
        <Button
          variant="outline"
          className="mt-2 w-full h-10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
          onClick={() => void handleSyncNow()}
          disabled={syncing || cloudOnline === false}
        >
          {syncing ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" aria-hidden /> : <CloudUpload className="h-4 w-4 mr-1.5" aria-hidden />}
          {syncing ? "Syncing..." : "Sync now"}
        </Button>
      </section>

      {/* database manager */}
      <section aria-label="Database tools" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-emerald-400" aria-hidden />
          <p className="text-sm font-semibold text-slate-200">Excel Database</p>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          Download the template, fill in players and teams, then import. The database is shared across all devices.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-10 border-slate-700" onClick={() => setDbModal(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-400" aria-hidden />
            Import / Template
          </Button>
          <Button
            variant="outline"
            className="h-10 border-slate-700"
            onClick={() => {
              window.location.href = "/api/database/export";
            }}
            disabled={cloudOnline === false}
          >
            <Download className="h-4 w-4 mr-1.5" aria-hidden />
            Export database
          </Button>
        </div>
        <Button
          variant="outline"
          className="mt-2 w-full h-10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
          onClick={() => void handlePullCloud()}
          disabled={pulling || cloudOnline === false}
        >
          {pulling ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" aria-hidden /> : <CloudDownload className="h-4 w-4 mr-1.5" aria-hidden />}
          {pulling ? "Loading..." : "Reload database from cloud"}
        </Button>
        <p className="text-[10px] text-slate-600 mt-2 leading-snug">
          Get the latest database from the cloud. New clubs and players appear right away.
        </p>
      </section>

      {/* cloud careers */}
      <section aria-label="Saved careers">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saved careers (cloud)</h2>
          <button
            type="button"
            className="text-slate-500 hover:text-emerald-400 transition-colors"
            onClick={() => void refreshSaves()}
            aria-label="Refresh saved careers"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <div className="space-y-2">
          {saves.length === 0 && (
            <p className="text-[11px] text-slate-600">No saved careers yet.</p>
          )}
          {saves.map((s) => {
            const active = s.id === activeCloudId;
            return (
              <div key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-200 truncate">
                    {s.saveName} {active && <span className="text-emerald-400">(active)</span>}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {formatDate(typeof s.currentDate === "string" ? s.currentDate.slice(0, 10) : String(s.currentDate))} · updated {new Date(s.updatedAt).toLocaleTimeString()}
                  </p>
                </div>
                {!active && (
                  <Button variant="outline" size="sm" className="h-7 border-slate-700 text-[11px]" onClick={() => void continueSave(s.id)}>
                    Load
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-500 hover:text-rose-400"
                  aria-label={`Delete save ${s.saveName}`}
                  onClick={() => void removeSave(s.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <Separator className="bg-slate-800" />

      {/* danger zone */}
      <DangerZone />

      {/* about */}
      <section aria-label="About" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-center">
        <p className="text-xs font-bold text-slate-300">Quattrick Football Manager</p>
        <p className="text-[10px] text-slate-600 mt-1">Season {game.season}, Manager {game.managerName}</p>
      </section>

      {/* database manager modal */}
      <DatabaseManagerModal
        open={dbModal}
        onOpenChange={setDbModal}
        currentDataset={dataset}
        onImportComplete={(ds) => {
          void importDataset(ds, "excel");
          showBusy("Database imported", 4500);
        }}
      />
    </div>
  );
}
