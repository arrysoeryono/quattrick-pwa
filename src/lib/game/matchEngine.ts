"use client";

/**
 * Client-side handle to the match engine Web Worker.
 * Spawned lazily in the browser only (never during SSR).
 */
import type { HalftimePayload, MatchResult, MatchTeamConfig, Mentality, TacticSliders } from "./types";

export interface TickPayload {
  minute: number;
  half: 1 | 2 | "FT";
  snapshot: {
    homeGoals: number;
    awayGoals: number;
    events: { minute: number; type: string; teamSide: "home" | "away" | "neutral"; text: string }[];
    stats: {
      possession: [number, number];
      shots: [number, number];
      onTarget: [number, number];
      xg: [number, number];
    };
    homeName: string;
    awayName: string;
    momentum?: number;
    shoutsLeft?: number;
  };
}

export type ShoutId = "go-all-out" | "park-the-bus" | "press-hard" | "time-waste";

export interface MatchRunnerCallbacks {
  onTick?: (payload: TickPayload) => void;
  onHalftime?: (payload: HalftimePayload) => void;
  onFulltime?: (result: MatchResult) => void;
  onReady?: () => void;
}

export class MatchRunner {
  private worker: Worker | null = null;
  private callbacks: MatchRunnerCallbacks = {};

  private ensureWorker(): Worker {
    if (typeof window === "undefined") throw new Error("MatchRunner requires a browser environment");
    if (!this.worker) {
      this.worker = new Worker(new URL("./matchEngine.worker.ts", import.meta.url));
      this.worker.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === "tick") this.callbacks.onTick?.(msg as TickPayload & { type: "tick" });
        else if (msg.type === "halftime") this.callbacks.onHalftime?.((msg as { payload: HalftimePayload }).payload);
        else if (msg.type === "fulltime") {
          this.callbacks.onFulltime?.(msg.result as MatchResult);
          this.dispose();
        } else if (msg.type === "ready") this.callbacks.onReady?.();
      };
    }
    return this.worker;
  }

  start(fixtureId: number, home: MatchTeamConfig, away: MatchTeamConfig, speed = 1, userTeamId?: number): void {
    const w = this.ensureWorker();
    w.postMessage({ type: "start", fixtureId, home, away, speed, userTeamId });
  }

  shout(id: ShoutId): void {
    this.worker?.postMessage({ type: "shout", id });
  }

  /** v4.8 — half-time substitution (max 5 per match). */
  sub(outId: number, inId: number): void {
    this.worker?.postMessage({ type: "sub", outId, inId });
  }

  /** v4.8 — update the user's mentality / sliders for the rest of the match. */
  setTactics(mentality?: Mentality, sliders?: Partial<TacticSliders>): void {
    this.worker?.postMessage({ type: "tactics", mentality, sliders });
  }

  setSpeed(speed: number): void {
    this.worker?.postMessage({ type: "speed", speed });
  }

  pause(): void {
    this.worker?.postMessage({ type: "pause" });
  }

  resume(): void {
    this.worker?.postMessage({ type: "resume" });
  }

  instant(): void {
    this.worker?.postMessage({ type: "instant" });
  }

  setCallbacks(cb: MatchRunnerCallbacks): void {
    this.callbacks = cb;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
