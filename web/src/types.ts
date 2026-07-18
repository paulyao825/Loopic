/** Mirrors server/src/api/events.ts wire format. */

export type PhotoPreference =
  | "balanced"
  | "people-emotion"
  | "competition"
  | "action-energy"
  | "scenic-composed";

export interface AxisCritique {
  score: number;
  reason: string;
  hint?: string;
}

export type Critique = Record<string, AxisCritique>;

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

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Recipe {
  crop: CropRect;
  exposureEv: number;
  contrast: number;
  saturation: number;
  temperature: number;
  sharpen: number;
}

export interface ResultInfo {
  frameId: string;
  score: number;
  url: string;
  winner: boolean;
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
  | { type: "run:done"; results: ResultInfo[] }
  | { type: "run:error"; message: string };

export interface Loop1Round {
  info: RoundInfo;
  selectedIds: string[];
}

export interface Loop2Round {
  info: RoundInfo;
  imageUrl: string;
  recipe: Recipe;
}

export interface Loop2State {
  frameId: string;
  rounds: Loop2Round[];
  done?: { converged: boolean; bestScore: number; bestUrl: string; rounds: number };
}

export type Phase = "idle" | "uploading" | "extracting" | "loop1" | "loop2" | "done" | "error";

export interface RunState {
  phase: Phase;
  runId?: string;
  error?: string;
  config?: {
    n: number;
    preference: PhotoPreference;
    preferenceLabel: string;
    selector: string;
    judge: string;
    judgeNote?: string;
    bar: number;
  };
  judgeFallback?: string;
  frames: FrameInfo[];
  loop1Rounds: Loop1Round[];
  loop1Done?: { selectedIds: string[]; converged: boolean; bestScore: number };
  loop2: Record<string, Loop2State>;
  loop2Order: string[];
  results?: ResultInfo[];
}

export const initialRunState: RunState = {
  phase: "idle",
  frames: [],
  loop1Rounds: [],
  loop2: {},
  loop2Order: [],
};

export function reduceEvent(state: RunState, e: RunEvent): RunState {
  switch (e.type) {
    case "run:init":
      return {
        ...initialRunState,
        phase: "extracting",
        runId: e.runId,
        config: {
          n: e.n,
          preference: e.preference,
          preferenceLabel: e.preferenceLabel,
          selector: e.selector,
          judge: e.judge,
          judgeNote: e.judgeNote,
          bar: e.bar,
        },
      };
    case "extract:start":
      return { ...state, phase: "extracting" };
    case "judge:fallback":
      return { ...state, judgeFallback: e.message };
    case "extract:done":
      return { ...state, frames: e.frames, phase: "loop1" };
    case "loop1:round":
      return { ...state, loop1Rounds: [...state.loop1Rounds, { info: e.info, selectedIds: e.selectedIds }] };
    case "loop1:done":
      return {
        ...state,
        phase: "loop2",
        loop1Done: { selectedIds: e.selectedIds, converged: e.converged, bestScore: e.bestScore },
      };
    case "loop2:start":
      return {
        ...state,
        loop2Order: [...state.loop2Order, e.frameId],
        loop2: { ...state.loop2, [e.frameId]: { frameId: e.frameId, rounds: [] } },
      };
    case "loop2:round": {
      const cur = state.loop2[e.frameId] ?? { frameId: e.frameId, rounds: [] };
      return {
        ...state,
        loop2: {
          ...state.loop2,
          [e.frameId]: { ...cur, rounds: [...cur.rounds, { info: e.info, imageUrl: e.imageUrl, recipe: e.recipe }] },
        },
      };
    }
    case "loop2:done": {
      const cur = state.loop2[e.frameId];
      if (!cur) return state;
      return {
        ...state,
        loop2: {
          ...state.loop2,
          [e.frameId]: {
            ...cur,
            done: { converged: e.converged, bestScore: e.bestScore, bestUrl: e.bestUrl, rounds: e.rounds },
          },
        },
      };
    }
    case "run:done":
      return { ...state, phase: "done", results: e.results };
    case "run:error":
      return { ...state, phase: "error", error: e.message };
  }
}
