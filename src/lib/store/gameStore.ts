"use client";

import { create } from "zustand";
import type { Dataset, Difficulty, GameState, MatchResult, MatchTeamConfig, SaveRecord } from "@/lib/game/types";
import {
  getGameDb,
  loadActiveDataset,
  listSaves,
  persistActiveDataset,
  putSave,
  deleteSave,
  getSave,
} from "@/lib/game/dexie";
import { createCareerState, advanceAfterUserMatch, buyPlayer, sellPlayer, refreshLineup, migrateGameState, type AdvanceOutcome } from "@/lib/game/advance";
import { generateDefaultDataset } from "@/lib/game/defaultData";
import { MatchRunner, type TickPayload } from "@/lib/game/matchEngine";
import type { LiveMatchSnapshot } from "@/lib/game/types";

export type TabKey = "home" | "squad" | "tactics" | "transfers" | "more";
type Phase = "boot" | "onboarding" | "manage";

export interface CloudSaveMeta {
  id: string;
  saveName: string;
  currentDate: string;
  updatedAt: string;
}

interface AppStore {
  phase: Phase;
  bootError: string | null;
  dataset: Dataset | null;
  datasetSource: string | null;
  game: GameState | null;
  saveId: string | null;
  saves: SaveRecord[];
  activeTab: TabKey;
  cloudOnline: boolean | null; // null = unknown
  userId: string;

  /* live match */
  runner: MatchRunner | null;
  liveFixtureId: number | null;
  liveSnapshot: LiveMatchSnapshot | null;
  liveResult: MatchResult | null;
  lastAdvance: AdvanceOutcome | null;

  boot: () => Promise<void>;
  setActiveTab: (tab: TabKey) => void;
  setCloudOnline: (v: boolean) => void;
  startCareer: (managerName: string, clubId: number, difficulty?: Difficulty) => Promise<void>;
  continueSave: (id: string) => Promise<void>;
  removeSave: (id: string) => Promise<void>;
  resetAllData: () => Promise<void>;
  update: (mutator: (game: GameState) => void) => void;
  updateDataset: (mutator: (ds: Dataset) => void) => void;
  importDataset: (ds: Dataset, source: string) => Promise<void>;
  applyAdvance: (outcome: AdvanceOutcome) => Promise<void>;

  /* live match actions */
  kickoff: (fixtureId: number, home: MatchConfigInput, away: MatchConfigInput) => void;
  shout: (id: "go-all-out" | "park-the-bus" | "press-hard" | "time-waste") => void;
  pushTick: (payload: TickPayload) => void;
  finishMatch: (result: MatchResult) => Promise<void>;
  clearLiveResult: () => void;
  disposeRunner: () => void;

  /* transfers */
  doBuyPlayer: (playerId: number) => { ok: boolean; message: string };
  doSellPlayer: (playerId: number) => { ok: boolean; message: string };

  /* cloud saves */
  saveToCloud: () => Promise<{ ok: boolean; message: string }>;
  fetchCloudSaves: () => Promise<CloudSaveMeta[]>;
  loadCloudSave: (id: string) => Promise<{ ok: boolean; message: string }>;

  /* master database sync (device <- Neon) */
  pullCloudDatabase: () => Promise<{ ok: boolean; message: string }>;
}

export type MatchConfigInput = MatchTeamConfig;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function getUserId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.localStorage.getItem("quattrick-user-id");
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem("quattrick-user-id", id);
  }
  return id;
}

export const useAppStore = create<AppStore>((set, get) => ({
  phase: "boot",
  bootError: null,
  dataset: null,
  datasetSource: null,
  game: null,
  saveId: null,
  saves: [],
  activeTab: "home",
  cloudOnline: null,
  userId: "pending",

  /* live match */
  runner: null,
  liveFixtureId: null,
  liveSnapshot: null,
  liveResult: null,
  lastAdvance: null,

  boot: async () => {
    set({ userId: getUserId() });
    try {
      // 1) local dataset first (offline-first)
      let dataset = await loadActiveDataset().catch(() => null);
      let source = dataset ? "local" : null;
      // 2) cloud bootstrap if missing
      if (!dataset) {
        try {
          const res = await fetch("/api/bootstrap", { signal: AbortSignal.timeout(6000) });
          if (res.ok) {
            const json = (await res.json()) as { dataset: Dataset };
            if (json.dataset?.players?.length) {
              dataset = json.dataset;
              source = "cloud";
              await persistActiveDataset(dataset, "cloud");
            }
          }
        } catch {
          /* offline — fall through to builtin */
        }
      }
      // 3) builtin fallback
      if (!dataset) {
        dataset = generateDefaultDataset();
        source = "builtin";
        await persistActiveDataset(dataset, "builtin");
      }
      const saves = await listSaves().catch(() => [] as SaveRecord[]);
      set({ dataset, datasetSource: source, saves, phase: "onboarding" });

      // background cloud health check
      fetch("/api/health", { signal: AbortSignal.timeout(5000) })
        .then((r) => r.json())
        .then((j: { cloud?: boolean }) => set({ cloudOnline: Boolean(j.cloud) }))
        .catch(() => set({ cloudOnline: false }));
    } catch (e) {
      set({ bootError: e instanceof Error ? e.message : "Boot failed", phase: "onboarding" });
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setCloudOnline: (v) => set({ cloudOnline: v }),

  startCareer: async (managerName, clubId, difficulty = "pro") => {
    const dataset = get().dataset;
    if (!dataset) return;
    const game = createCareerState(managerName, clubId, dataset, difficulty);
    const clubName = dataset.teams.find((t) => t.id === clubId)?.name ?? "Club";
    const record = await putSave(game, clubName).catch(() => null);
    set({ game, saveId: record?.id ?? null, saves: await listSaves().catch(() => []), phase: "manage", activeTab: "home" });
  },

  continueSave: async (id) => {
    const rec = await getSave(id).catch(() => null);
    if (!rec) return;
    const game = migrateGameState(rec.state);
    set({ game, saveId: rec.id, phase: "manage", activeTab: "home" });
  },

  removeSave: async (id) => {
    await deleteSave(id).catch(() => undefined);
    const saves = await listSaves().catch(() => []);
    const stillActive = get().saveId === id;
    set({ saves, ...(stillActive ? { game: null, saveId: null, phase: "onboarding" } : {}) });
  },

  /** Danger Zone — nuclear option: wipe every local save + the active dataset, then re-bootstrap fresh from the Neon cloud database (builtin fallback when offline). */
  resetAllData: async () => {
    get().disposeRunner();
    try {
      const db = getGameDb();
      await db.saves.clear();
      await db.datasets.clear();
    } catch {
      /* IndexedDB unavailable — continue with in-memory reset */
    }
    // Re-pull the latest cloud master database so the device ends up with the
    // freshly imported Excel data instead of stale factory defaults.
    let dataset: Dataset | null = null;
    let source = "builtin";
    try {
      const res = await fetch("/api/bootstrap", { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const json = (await res.json()) as { dataset: Dataset; source: string };
        if (json.dataset?.players?.length) {
          dataset = json.dataset;
          source = json.source === "neon" ? "cloud" : "builtin";
        }
      }
    } catch {
      /* offline — fall back to builtin below */
    }
    if (!dataset) {
      dataset = generateDefaultDataset();
      source = "builtin";
    }
    await persistActiveDataset(dataset, source).catch(() => undefined);
    set({
      dataset,
      datasetSource: source,
      game: null,
      saveId: null,
      saves: [],
      activeTab: "home",
      phase: "onboarding",
      liveFixtureId: null,
      liveSnapshot: null,
      liveResult: null,
      lastAdvance: null,
    });
  },

  update: (mutator) => {
    const { game } = get();
    if (!game) return;
    const clone: GameState = structuredClone(game);
    mutator(clone);
    set({ game: clone });
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const st = get();
      if (st.game) {
        const clubName = st.dataset?.teams.find((t) => t.id === st.game!.clubId)?.name ?? "Club";
        void putSave(st.game, clubName, st.saveId ?? undefined).then(() => listSaves().then((s) => set({ saves: s }))).catch(() => undefined);
      }
    }, 600);
  },

  updateDataset: (mutator) => {
    const { dataset } = get();
    if (!dataset) return;
    const clone: Dataset = structuredClone(dataset);
    mutator(clone);
    set({ dataset: clone });
    void persistActiveDataset(clone, get().datasetSource ?? "local").catch(() => undefined);
  },

  importDataset: async (ds, source) => {
    set({ dataset: ds, datasetSource: source });
    await persistActiveDataset(ds, source).catch(() => undefined);
  },

  applyAdvance: async (outcome) => {
    set({
      game: outcome.game,
      dataset: outcome.dataset,
      lastAdvance: outcome,
    });
    await persistActiveDataset(outcome.dataset, get().datasetSource ?? "local").catch(() => undefined);
    const st = get();
    const clubName = outcome.dataset.teams.find((t) => t.id === outcome.game.clubId)?.name ?? "Club";
    await putSave(outcome.game, clubName, st.saveId ?? undefined).catch(() => undefined);
    const saves = await listSaves().catch(() => []);
    set({ saves });
  },

  /* ---------- live match ---------- */
  kickoff: (fixtureId, home, away) => {
    // terminate any previous runner so two workers can never double-apply a result
    get().runner?.dispose();
    const runner = new MatchRunner();
    set({ runner, liveFixtureId: fixtureId, liveSnapshot: null, liveResult: null });
    runner.setCallbacks({
      onTick: (payload) => get().pushTick(payload),
      onFulltime: (result) => void get().finishMatch(result),
    });
    runner.start(fixtureId, home, away, 1, get().game?.clubId);
  },

  shout: (id) => get().runner?.shout(id),

  pushTick: (payload) => {
    set({
      liveSnapshot: {
        minute: payload.minute,
        half: payload.half,
        homeGoals: payload.snapshot.homeGoals,
        awayGoals: payload.snapshot.awayGoals,
        events: payload.snapshot.events as LiveMatchSnapshot["events"],
        stats: payload.snapshot.stats,
        momentum: payload.snapshot.momentum,
        shoutsLeft: payload.snapshot.shoutsLeft,
      },
    });
  },

  finishMatch: async (result) => {
    const { game, dataset } = get();
    get().disposeRunner();
    if (!game || !dataset) return;
    const outcome = advanceAfterUserMatch(game, dataset, result);
    await get().applyAdvance(outcome);
    set({ liveFixtureId: null, liveSnapshot: null, liveResult: result });
  },

  clearLiveResult: () => set({ liveResult: null, lastAdvance: null }),
  disposeRunner: () => {
    get().runner?.dispose();
    set({ runner: null });
  },

  /* ---------- transfers ---------- */
  doBuyPlayer: (playerId) => {
    const { game, dataset } = get();
    if (!game || !dataset) return { ok: false, message: "No active career" };
    const res = buyPlayer(game, dataset, playerId);
    if (res.ok) {
      refreshLineup(res.game);
      set({ game: res.game, dataset: res.dataset });
      void persistActiveDataset(res.dataset, get().datasetSource ?? "local").catch(() => undefined);
      const clubName = res.dataset.teams.find((t) => t.id === res.game.clubId)?.name ?? "Club";
      void putSave(res.game, clubName, get().saveId ?? undefined).catch(() => undefined);
    }
    return { ok: res.ok, message: res.message };
  },

  doSellPlayer: (playerId) => {
    const { game, dataset } = get();
    if (!game || !dataset) return { ok: false, message: "No active career" };
    const res = sellPlayer(game, dataset, playerId);
    if (res.ok) {
      refreshLineup(res.game);
      set({ game: res.game, dataset: res.dataset });
      void persistActiveDataset(res.dataset, get().datasetSource ?? "local").catch(() => undefined);
      const clubName = res.dataset.teams.find((t) => t.id === res.game.clubId)?.name ?? "Club";
      void putSave(res.game, clubName, get().saveId ?? undefined).catch(() => undefined);
    }
    return { ok: res.ok, message: res.message };
  },

  /* ---------- cloud saves ---------- */
  saveToCloud: async () => {
    const { game, dataset, userId, cloudOnline } = get();
    if (!game || !dataset) return { ok: false, message: "No active career" };
    if (cloudOnline === false) return { ok: false, message: "Cloud is offline — local save only" };
    try {
      const clubName = dataset.teams.find((t) => t.id === game.clubId)?.name ?? "Club";
      const saveName = `${game.managerName} — ${clubName} (S${game.season})`;
      const res = await fetch("/api/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, saveName, currentDate: game.currentDate, gameDataJson: game }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(await res.text());
      return { ok: true, message: "Career synced to cloud" };
    } catch (e) {
      set({ cloudOnline: false });
      return { ok: false, message: e instanceof Error ? `Cloud save failed: ${e.message}` : "Cloud save failed" };
    }
  },

  fetchCloudSaves: async () => {
    const { userId } = get();
    try {
      const res = await fetch(`/api/saves?userId=${encodeURIComponent(userId)}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error("Failed to list cloud saves");
      const json = (await res.json()) as { saves: CloudSaveMeta[] };
      set({ cloudOnline: true });
      return json.saves ?? [];
    } catch {
      set({ cloudOnline: false });
      return [];
    }
  },

  loadCloudSave: async (id) => {
    const { userId } = get();
    try {
      const res = await fetch(`/api/saves?userId=${encodeURIComponent(userId)}&id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error("Fetch failed");
      const json = (await res.json()) as { save?: { saveName: string; gameDataJson: GameState } };
      const save = json.save;
      if (!save?.gameDataJson) throw new Error("Empty save");
      const game = migrateGameState(save.gameDataJson);
      const clubName = get().dataset?.teams.find((t) => t.id === game.clubId)?.name ?? "Club";
      const record = await putSave(game, clubName).catch(() => null);
      set({ game, saveId: record?.id ?? null, phase: "manage", activeTab: "home" });
      return { ok: true, message: `Loaded "${save.saveName}"` };
    } catch (e) {
      set({ cloudOnline: false });
      return { ok: false, message: e instanceof Error ? e.message : "Cloud load failed" };
    }
  },

  /* ---------- master database sync (device <- Neon) ---------- */
  pullCloudDatabase: async () => {
    try {
      const res = await fetch("/api/bootstrap", { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { dataset: Dataset; source: string };
      if (!json.dataset?.players?.length) throw new Error("Cloud database is empty");
      await get().importDataset(json.dataset, "cloud");
      set({ cloudOnline: true });
      return {
        ok: true,
        message: `Cloud database pulled — ${json.dataset.teams.length} clubs and ${json.dataset.players.length} players are now active on this device`,
      };
    } catch (e) {
      set({ cloudOnline: false });
      return { ok: false, message: e instanceof Error ? `Sync failed: ${e.message}` : "Sync failed" };
    }
  },
}));
