import type { Critique } from "../core/loop.js";
import type { Recipe } from "../domain/types.js";
import type { PhotoPreference } from "../domain/photoPreference.js";

export interface FrameInfo {
  id: string;
  t: number;
  url: string;
}

export interface RoundInfo {
  round: number;
  score: number;
  critique: Critique;
  correction?: string;
  cached: boolean;
  durationMs: number;
}

export type RunEvent =
  | {
      type: "run:init";
      runId: string;
      n: number;
      preference: PhotoPreference;
      preferenceLabel: string;
      selector: string;
      judge: string;
      judgeNote?: string;
      bar: number;
    }
  | { type: "extract:start" }
  | { type: "extract:done"; frames: FrameInfo[] }
  | { type: "judge:fallback"; message: string }
  | { type: "loop1:round"; info: RoundInfo; selectedIds: string[] }
  | { type: "loop1:done"; selectedIds: string[]; converged: boolean; bestScore: number }
  | { type: "loop2:start"; frameId: string }
  | { type: "loop2:round"; frameId: string; info: RoundInfo; imageUrl: string; recipe: Recipe }
  | { type: "loop2:done"; frameId: string; converged: boolean; bestScore: number; bestUrl: string; rounds: number }
  | {
      type: "run:done";
      results: Array<{ frameId: string; score: number; url: string; winner: boolean }>;
    }
  | { type: "run:error"; message: string };
