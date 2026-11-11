"use client";

/**
 * Dexie (IndexedDB) — offline-first save engine.
 * Stores the active master dataset and all local career saves.
 * Never import this from server code; it throws outside the browser.
 */
import Dexie, { type EntityTable } from "dexie";
import type { Dataset, GameState, SaveRecord } from "./types";

export interface DatasetRow {
  key: "active";
  dataset: Dataset;
  importedAt: number;
  source: string; // "builtin" | "excel" | "cloud"
}

class QuattrickDB extends Dexie {
  datasets!: EntityTable<DatasetRow, "key">;
  saves!: EntityTable<SaveRecord, "id">;

  constructor() {
    super("quattrick-fm");
    this.version(1).stores({
      datasets: "key",
      saves: "id, updatedAt",
    });
  }
}

let instance: QuattrickDB | null = null;

export function getGameDb(): QuattrickDB {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable outside the browser");
  }
  if (!instance) instance = new QuattrickDB();
  return instance;
}

/* ---------- dataset helpers ---------- */

export async function persistActiveDataset(dataset: Dataset, source: string): Promise<void> {
  const db = getGameDb();
  await db.datasets.put({ key: "active", dataset, importedAt: Date.now(), source });
}

export async function loadActiveDataset(): Promise<Dataset | null> {
  const db = getGameDb();
  const row = await db.datasets.get("active");
  return row?.dataset ?? null;
}

export async function getDatasetSource(): Promise<string | null> {
  const db = getGameDb();
  const row = await db.datasets.get("active");
  return row?.source ?? null;
}

/* ---------- save helpers ---------- */

export function makeSaveRecord(state: GameState): SaveRecord {
  const clubName = `Club ${state.clubId}`;
  return {
    id: state.version ? `${state.clubId}-${state.season}-${state.managerName.replace(/\s+/g, "_").toLowerCase()}` : crypto.randomUUID(),
    name: `${state.managerName} — Season ${state.season}`,
    clubName,
    season: state.season,
    currentDate: state.currentDate,
    updatedAt: Date.now(),
    state,
  };
}

export async function putSave(state: GameState, clubName: string, saveId?: string): Promise<SaveRecord> {
  const db = getGameDb();
  const record: SaveRecord = {
    id: saveId ?? crypto.randomUUID(),
    name: `${state.managerName} — ${clubName}`,
    clubName,
    season: state.season,
    currentDate: state.currentDate,
    updatedAt: Date.now(),
    state,
  };
  await db.saves.put(record);
  return record;
}

export async function listSaves(): Promise<SaveRecord[]> {
  const db = getGameDb();
  return db.saves.orderBy("updatedAt").reverse().toArray();
}

export async function getSave(id: string): Promise<SaveRecord | undefined> {
  const db = getGameDb();
  return db.saves.get(id);
}

export async function deleteSave(id: string): Promise<void> {
  const db = getGameDb();
  await db.saves.delete(id);
}
