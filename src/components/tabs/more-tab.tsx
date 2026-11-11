"use client";

import { useEffect, useState } from "react";
import { useAppStore, type CloudSaveMeta } from "@/lib/store/gameStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DatabaseManagerModal } from "@/components/database-manager-modal";
import { DangerZone } from "@/components/danger-zone";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatDate, formatMoney } from "@/lib/format";
import { ACHIEVEMENTS } from "@/lib/game/career";
import { cn } from "@/lib/utils";
import { Cloud, CloudOff, Database, Download, FileSpreadsheet, HardDrive, RefreshCw, Save, Trash2, Trophy, Upload } from "lucide-react";

export function MoreTab() {
  const dataset = useAppStore((s) => s.dataset);
  const datasetSource = useAppStore((s) => s.datasetSource);
  const game = useAppStore((s) => s.game);
  const saves = useAppStore((s) => s.saves);
  const saveId = useAppStore((s) => s.saveId);
  const cloudOnline = useAppStore((s) => s.cloudOnline);
  const saveToCloud = useAppStore((s) => s.saveToCloud);
  const fetchCloudSaves = useAppStore((s) => s.fetchCloudSaves);
  const loadCloudSave = useAppStore((s) => s.loadCloudSave);
  const continueSave = useAppStore((s) => s.continueSave);
  const removeSave = useAppStore((s) => s.removeSave);
  const importDataset = useAppStore((s) => s.importDataset);
  const disposeRunner = useAppStore((s) => s.disposeRunner);

  const [dbModal, setDbModal] = useState(false);
  const [cloudSheet, setCloudSheet] = useState(false);
  const [cloudSaves, setCloudSaves] = useState<CloudSaveMeta[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  useEffect(() => {
    disposeRunner();
  }, [disposeRunner]);

  const handleCloudSave = async () => {
    setBusyMsg("Syncing...");
    const res = await saveToCloud();
    if (res.ok) {
      setBusyMsg("Career synced to cloud");
      setTimeout(() => setBusyMsg(null), 3000);
    } else {
      setBusyMsg(res.message);
      setTimeout(() => setBusyMsg(null), 4000);
    }
  };

  const openCloudSheet = async () => {
    setCloudSheet(true);
    setCloudLoading(true);
    const list = await fetchCloudSaves();
    setCloudSaves(list);
    setCloudLoading(false);
  };

  const handleCloudLoad = async (id: string) => {
    setCloudLoading(true);
    const res = await loadCloudSave(id);
    setCloudLoading(false);
    setCloudSheet(false);
    setBusyMsg(res.message);
    setTimeout(() => setBusyMsg(null), 3000);
  };

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
            <p className="text-[11px] font-semibold text-slate-300">Youth academy · level {game.facilityLevel}/5</p>
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

      {/* cloud status */}
      <section aria-label="Cloud status" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {cloudOnline === false ? (
              <CloudOff className="h-4 w-4 text-slate-500" aria-hidden />
            ) : (
              <Cloud className="h-4 w-4 text-emerald-400" aria-hidden />
            )}
            <div>
              <p className="text-sm font-semibold text-slate-200">
                {cloudOnline === false ? "Cloud offline" : cloudOnline === null ? "Checking cloud..." : "Neon Postgres connected"}
              </p>
              <p className="text-[11px] text-slate-500">
                Local dataset source: {datasetSource ?? "unknown"} · {dataset.players.length} players loaded
              </p>
            </div>
          </div>
          <Badge variant="outline" className={cloudOnline === false ? "border-slate-700 text-slate-500" : "border-emerald-500/40 text-emerald-400"}>
            {cloudOnline === false ? "LOCAL" : "CLOUD"}
          </Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button className="h-10 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold" onClick={() => void handleCloudSave()} disabled={cloudOnline === false}>
            <Save className="h-4 w-4 mr-1.5" aria-hidden />
            Sync save
          </Button>
          <Button variant="outline" className="h-10 border-slate-700" onClick={() => void openCloudSheet()} disabled={cloudOnline === false}>
            <Upload className="h-4 w-4 mr-1.5" aria-hidden />
            Load from cloud
          </Button>
        </div>
      </section>

      {/* database manager */}
      <section aria-label="Database tools" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-emerald-400" aria-hidden />
          <p className="text-sm font-semibold text-slate-200">Excel Database Engine</p>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">
          Download the .xlsx template, fill thousands of players/teams with Excel or AI tools, then import. The active database also exports back out for modding.
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
            Export cloud DB
          </Button>
        </div>
      </section>

      {/* local saves */}
      <section aria-label="Local saves">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Local saves (IndexedDB)</h2>
          <HardDrive className="h-3.5 w-3.5 text-slate-600" aria-hidden />
        </div>
        <div className="space-y-2">
          {saves.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-200 truncate">
                  {s.name} {s.id === saveId && <span className="text-emerald-400">· active</span>}
                </p>
                <p className="text-[10px] text-slate-500">{formatDate(s.currentDate)} · updated {new Date(s.updatedAt).toLocaleTimeString()}</p>
              </div>
              {s.id !== saveId && (
                <Button variant="outline" size="sm" className="h-7 border-slate-700 text-[11px]" onClick={() => void continueSave(s.id)}>
                  Load
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-500 hover:text-rose-400"
                aria-label={`Delete save ${s.name}`}
                onClick={() => void removeSave(s.id)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <Separator className="bg-slate-800" />

      {/* danger zone — full reset engine with live data preview */}
      <DangerZone />

      {/* about */}
      <section aria-label="About" className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-center">
        <p className="text-xs font-bold text-slate-300">Quattrick Football Manager</p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          v4.0 Master Edition · Next.js PWA · Dexie offline engine · Neon Postgres cloud · Web Worker match sim
        </p>
        <p className="text-[10px] text-slate-600 mt-1">Season {game.season} · Manager {game.managerName}</p>
      </section>

      {/* database manager modal */}
      <DatabaseManagerModal
        open={dbModal}
        onOpenChange={setDbModal}
        currentDataset={dataset}
        onImportComplete={(ds) => {
          void importDataset(ds, "excel");
          setBusyMsg("Excel database imported — available for new careers");
          setTimeout(() => setBusyMsg(null), 4000);
        }}
      />

      {/* cloud saves sheet */}
      <Sheet open={cloudSheet} onOpenChange={setCloudSheet}>
        <SheetContent side="bottom" className="max-h-[min(70dvh,70vh)] overflow-y-auto overscroll-contain scrollbar-thin touch-scroll rounded-t-2xl border-slate-800 bg-slate-900">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>Cloud saves</SheetTitle>
            <SheetDescription>Saved careers stored in Neon Postgres for this device.</SheetDescription>
          </SheetHeader>
          <div className="p-4 space-y-2">
            {cloudLoading && (
              <p className="flex items-center gap-2 text-xs text-slate-400">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading cloud saves...
              </p>
            )}
            {!cloudLoading && cloudSaves.length === 0 && (
              <p className="text-xs text-slate-500">No cloud saves yet — hit Sync save first.</p>
            )}
            {cloudSaves.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-200 truncate">{s.saveName}</p>
                  <p className="text-[10px] text-slate-500">
                    {formatDate(typeof s.currentDate === "string" ? s.currentDate.slice(0, 10) : String(s.currentDate))} · {new Date(s.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Button size="sm" className="h-7 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-bold" onClick={() => void handleCloudLoad(s.id)}>
                  Load
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
