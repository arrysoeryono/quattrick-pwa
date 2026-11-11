"use client";

import { create } from "zustand";
import type { Dataset, Difficulty, GameState, MatchResult, MatchTeamConfig } from "@/lib/game/types";
import {
  getGameDb,
  loadActiveDataset,
  listSaves,
  persistActiveDataset,
  putSave,
} from "@/lib/game/dexie";
import { createCareerState, advanceAfterUserMatch, buyPlayer, sellPlayer, refreshLineup, migrateGameState, type AdvanceOutcome } from "@/lib/game/advance";
import { generateDefaultDataset } from "@/lib/game/defaultData";
import { computeOverall, migratePlayerAttributes } from "@/lib/game/attributes";
import { MatchRunner, type TickPayload } from "@/lib/game/matchEngine";
import type { LiveMatchSnapshot } from "@/lib/game/types";

export type TabKey = "home" | "squad" | "tactics" | "transfers" | "more";
type Phase = "boot" | "onboarding" | "manage";

export interface CloudSaveMeta {
  id: string;
  saveName: string;
  currentDate: string;
  updatedAt: string;
  clubId?: number;
}

/**
 * FULL-ONLINE ARCHITECTURE
 * — Neon Postgres is the single source of truth for both the master database
 *   (leagues/teams/players) and every career save.
 * — One shared cloud identity: every device converges on the same careers, so
 *   playing on the phone and continuing on the PC (or after an Excel import)
 *   always shows identical data.
 * — IndexedDB remains only as a write-through cache for instant boots and
 *   read-only fallback when the network is down.
 */
const SHARED_USER_ID = "quattrick-solo-manager";
const SAVES_CACHE_KEY = "quattrick-cloud-saves-cache";

function cacheSaves(metas: CloudSaveMeta[]): void {
  try {
    window.localStorage.setItem(SAVES_CACHE_KEY, JSON.stringify(metas));
  } catch {
    /* private mode */
  }
}

/** v4.5: goalkeepers carry their own attribute set. Cached datasets from an
 *  older build may still hold outfield attributes on GK rows — migrate them. */
function migrateDatasetGk(ds: Dataset): Dataset {
  let changed = false;
  const players = ds.players.map((p) => {
    const mig = migratePlayerAttributes(p.position, p.attributes);
    if (!mig.changed) return p;
    changed = true;
    return { ...p, attributes: mig.attributes, overallRating: computeOverall(mig.attributes, p.position) };
  });
  return changed ? { ...ds, players } : ds;
}

function readCachedSaves(): CloudSaveMeta[] {
  try {
    const raw = window.localStorage.getItem(SAVES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CloudSaveMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clearSavesCache(): void {
  try {
    window.localStorage.removeItem(SAVES_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Neon free tier occasionally drops the first request after compute wake-up — retry once. */
async function fetchRetry(input: string, init: RequestInit, attempts = 2): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(input, init);
      // wake-up drops can surface as 5xx — retry those too
      if (res.ok || i === attempts - 1 || res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 900));
  }
  throw lastErr instanceof Error ? lastErr : new Error("Request failed");
}

interface AppStore {
  phase: Phase;
  bootError: string | null;
  dataset: Dataset | null;
  datasetSource: string | null;
  game: GameState | null;
  saveId: string | null; // local cache record id (write-through mirror)
  activeCloudId: string | null; // cloud row id of the active career
  saves: CloudSaveMeta[]; // cloud-backed career list
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
  continueSave: (cloudId: string) => Promise<void>;
  removeSave: (cloudId: string) => Promise<void>;
  resetAllData: () => Promise<void>;
  update: (mutator: (game: GameState) => void) => void;
  updateDataset: (mutator: (ds: Dataset) => void) => void;
  importDataset: (ds: Dataset, source: string) => Promise<void>;
  applyAdvance: (outcome: AdvanceOutcome) => Promise<void>;
  refreshSaves: () => Promise<void>;
  syncNow: () => Promise<{ ok: boolean; message: string }>;

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

  /* master database sync (device <- Neon) */
  pullCloudDatabase: () => Promise<{ ok: boolean; message: string }>;
}

export type MatchConfigInput = MatchTeamConfig;

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppStore>((set, get) => {
  /** Write-through persistence: local cache first (instant), then Neon cloud.
   *  Cloud identity = (userId, saveName) so every device converges on the same row. */
  const persistGame = async (
    state: GameState,
    localSaveId: string | undefined,
    dataset: Dataset,
  ): Promise<{ recordId: string | null; cloudId: string | null }> => {
    const clubName = dataset.teams.find((t) => t.id === state.clubId)?.name ?? "Club";
    const saveName = `${state.managerName} - ${clubName} (S${state.season})`.slice(0, 100);

    // 1) local write-through cache
    const record = await putSave(state, clubName, localSaveId, saveName).catch(() => null);

    // 2) cloud push
    let cloudId: string | null = null;
    try {
      const res = await fetchRetry("/api/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: SHARED_USER_ID, saveName, currentDate: state.currentDate, gameDataJson: state }),
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const j = (await res.json()) as { id?: string };
        cloudId = j.id ?? null;
        set({ cloudOnline: true });
      } else {
        set({ cloudOnline: false });
      }
    } catch {
      set({ cloudOnline: false });
    }

    // 3) converge identities: drop the stale cloud row if the save name changed a row
    const prevCloudId = get().activeCloudId;
    if (cloudId && prevCloudId && prevCloudId !== cloudId) {
      fetch(`/api/saves?userId=${SHARED_USER_ID}&id=${encodeURIComponent(prevCloudId)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(8000),
      }).catch(() => undefined);
    }
    if (cloudId) set({ activeCloudId: cloudId });

    // 4) update the saves meta list + cache
    if (cloudId) {
      const meta: CloudSaveMeta = {
        id: cloudId,
        saveName,
        currentDate: state.currentDate,
        updatedAt: new Date().toISOString(),
        clubId: state.clubId,
      };
      const rest = get().saves.filter((m) => m.id !== cloudId && m.saveName !== saveName);
      const saves = [meta, ...rest].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      set({ saves });
      cacheSaves(saves);
    }

    return { recordId: record?.id ?? localSaveId ?? null, cloudId };
  };

  return {
    phase: "boot",
    bootError: null,
    dataset: null,
    datasetSource: null,
    game: null,
    saveId: null,
    activeCloudId: null,
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
      set({ userId: SHARED_USER_ID });
      try {
        // 1) cloud dataset first — Neon is the source of truth
        let dataset: Dataset | null = null;
        let source: string | null = null;
        try {
          const res = await fetch("/api/bootstrap", { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            const json = (await res.json()) as { dataset: Dataset; source: string };
            if (json.dataset?.players?.length) {
              dataset = json.dataset;
              source = "cloud";
              await persistActiveDataset(dataset, "cloud").catch(() => undefined);
            }
          }
        } catch {
          /* offline — fall through to cache */
        }
        // 2) offline fallback: last cached dataset
        if (!dataset) {
          dataset = await loadActiveDataset().catch(() => null);
          source = dataset ? "cache" : null;
        }
        // 3) last resort: builtin
        if (!dataset) {
          dataset = generateDefaultDataset();
          source = "builtin";
          await persistActiveDataset(dataset, "builtin").catch(() => undefined);
        }
        dataset = migrateDatasetGk(dataset);

        const saves = readCachedSaves();
        set({ dataset, datasetSource: source, saves, phase: "onboarding" });

        // background: refresh cloud careers + health check
        void get().refreshSaves();
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
      const { recordId } = await persistGame(game, undefined, dataset);
      set({ game, saveId: recordId, phase: "manage", activeTab: "home" });
    },

    continueSave: async (cloudId) => {
      const meta = get().saves.find((m) => m.id === cloudId);
      try {
        const res = await fetchRetry(`/api/saves?userId=${SHARED_USER_ID}&id=${encodeURIComponent(cloudId)}`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error("Fetch failed");
        const json = (await res.json()) as { save?: { saveName: string; gameDataJson: GameState } };
        const save = json.save;
        if (!save?.gameDataJson) throw new Error("Empty save");
        const game = migrateGameState(save.gameDataJson);
        const clubName = get().dataset?.teams.find((t) => t.id === game.clubId)?.name ?? "Club";
        const record = await putSave(game, clubName, undefined, save.saveName).catch(() => null);
        set({ game, saveId: record?.id ?? null, activeCloudId: cloudId, phase: "manage", activeTab: "home", cloudOnline: true });
      } catch {
        set({ cloudOnline: false });
        // offline fallback: continue from the local cache mirror
        if (meta) {
          const local = (await listSaves().catch(() => [])).find((r) => r.name === meta.saveName);
          if (local) {
            const game = migrateGameState(local.state);
            set({ game, saveId: local.id, activeCloudId: meta.id, phase: "manage", activeTab: "home" });
          }
        }
      }
    },

    removeSave: async (cloudId) => {
      const meta = get().saves.find((m) => m.id === cloudId);
      try {
        await fetch(`/api/saves?userId=${SHARED_USER_ID}&id=${encodeURIComponent(cloudId)}`, { method: "DELETE", signal: AbortSignal.timeout(8000) });
      } catch {
        set({ cloudOnline: false });
      }
      // prune local cache mirrors of this career
      if (meta) {
        try {
          const db = getGameDb();
          const locals = await db.saves.toArray();
          const staleIds = locals.filter((r) => r.name === meta.saveName).map((r) => r.id);
          if (staleIds.length > 0) await db.saves.bulkDelete(staleIds);
        } catch {
          /* ignore */
        }
      }
      const saves = get().saves.filter((m) => m.id !== cloudId);
      set({ saves });
      cacheSaves(saves);
      if (meta && get().activeCloudId === cloudId) {
        set({ game: null, saveId: null, activeCloudId: null, phase: "onboarding", activeTab: "home" });
      }
    },

    /** Danger Zone — nuclear option: wipe every career save (cloud + local cache)
     *  AND the whole Neon master database (leagues, teams, players), so the cloud
     *  is completely clean and a fresh Excel database can be imported. The device
     *  continues with the builtin dataset until a new database is imported. */
    resetAllData: async () => {
      get().disposeRunner();
      try {
        const db = getGameDb();
        await db.saves.clear();
        await db.datasets.clear();
      } catch {
        /* IndexedDB unavailable — continue with in-memory reset */
      }
      clearSavesCache();
      // 1) wipe cloud careers too — cloud is the source of truth now
      try {
        await fetch(`/api/saves?userId=${SHARED_USER_ID}&all=1`, { method: "DELETE", signal: AbortSignal.timeout(10000) });
      } catch {
        /* offline — cloud rows will be wiped next time reset runs */
      }
      // 2) wipe the Neon master database (leagues, teams, players + id sequences)
      let cloudWiped = false;
      try {
        const res = await fetch("/api/database/reset", { method: "DELETE", signal: AbortSignal.timeout(15000) });
        cloudWiped = res.ok;
      } catch {
        /* offline — the cloud master DB is wiped next time reset runs */
      }
      // 3) bootstrap again: Neon is empty now, so the device gets the builtin
      //    dataset until the user imports a fresh Excel database (which re-seeds
      //    the cloud via /api/database/import).
      let dataset: Dataset | null = null;
      let source = "builtin";
      if (!cloudWiped) {
        // cloud reset failed (offline?) — try keeping whatever the cloud still holds
        try {
          const res = await fetch("/api/bootstrap", { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            const json = (await res.json()) as { dataset: Dataset; source: string };
            if (json.dataset?.players?.length) {
              dataset = migrateDatasetGk(json.dataset);
              source = json.source === "neon" ? "cloud" : "builtin";
            }
          }
        } catch {
          /* offline — fall back to builtin below */
        }
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
        activeCloudId: null,
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
        if (st.game && st.dataset) {
          void persistGame(st.game, st.saveId ?? undefined, st.dataset).catch(() => undefined);
        }
      }, 600);
    },

    updateDataset: (mutator) => {
      const { dataset } = get();
      if (!dataset) return;
      const clone: Dataset = structuredClone(dataset);
      mutator(clone);
      set({ dataset: clone });
      void persistActiveDataset(clone, get().datasetSource ?? "cache").catch(() => undefined);
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
      await persistActiveDataset(outcome.dataset, get().datasetSource ?? "cache").catch(() => undefined);
      const st = get();
      await persistGame(outcome.game, st.saveId ?? undefined, outcome.dataset).catch(() => undefined);
    },

    refreshSaves: async () => {
      try {
        const res = await fetchRetry(`/api/saves?userId=${SHARED_USER_ID}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error("Failed to list cloud saves");
        const json = (await res.json()) as { saves: CloudSaveMeta[] };
        const saves = json.saves ?? [];
        set({ saves, cloudOnline: true });
        cacheSaves(saves);
      } catch {
        set({ cloudOnline: false });
      }
    },

    syncNow: async () => {
      const st = get();
      if (!st.game || !st.dataset) return { ok: false, message: "No active career" };
      const r = await persistGame(st.game, st.saveId ?? undefined, st.dataset);
      return r.cloudId
        ? { ok: true, message: "Career synced" }
        : { ok: false, message: "Cloud unreachable, will retry automatically" };
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
        void persistActiveDataset(res.dataset, get().datasetSource ?? "cache").catch(() => undefined);
        void persistGame(res.game, get().saveId ?? undefined, res.dataset).catch(() => undefined);
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
        void persistActiveDataset(res.dataset, get().datasetSource ?? "cache").catch(() => undefined);
        void persistGame(res.game, get().saveId ?? undefined, res.dataset).catch(() => undefined);
      }
      return { ok: res.ok, message: res.message };
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
          message: `Database reloaded: ${json.dataset.teams.length} clubs, ${json.dataset.players.length} players`,
        };
      } catch (e) {
        set({ cloudOnline: false });
        return { ok: false, message: e instanceof Error ? `Sync failed: ${e.message}` : "Sync failed" };
      }
    },
  };
});
