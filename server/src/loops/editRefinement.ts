import type { Critique, LoopSpec } from "../core/loop.js";
import { meanScore } from "../core/loop.js";
import type { Editor } from "../backends/editor.js";
import { recipeSlug } from "../backends/editor.js";
import type { VisionJudge } from "../backends/judge.js";
import type { EditedImage, Frame, Recipe } from "../domain/types.js";
import { clamp, defaultRecipe, RECIPE_BOUNDS } from "../domain/types.js";

/**
 * Loop 2 — Edit refinement (the demo centerpiece).
 * act:     Editor.edit(frame, recipe) — backend-agnostic
 * observe: vision judge critiques the edited output
 * score:   per-axis (cropFraming / exposure / contrast / color /
 *          whiteBalance / sharpness) + reasons
 * correct: read the LOWEST axis, adjust ONLY that recipe parameter
 */

export interface RefineState {
  recipe: Recipe;
  /**
   * Per-axis correction memory. If the judge repeats the same hint we
   * undershot — keep the step. If the hint flips direction we overshot —
   * halve it. Binary-search-style settling.
   */
  corrections: Record<string, { lastHint: string; stepScale: number }>;
  /** What the previous round scored and which correction produced it —
   *  lets the agent notice a correction that backfired and revert it. */
  last?: { recipe: Recipe; score: number; axis: string; hint: string };
}

export function initialRefineState(): RefineState {
  return { recipe: defaultRecipe(), corrections: {} };
}

const BASE_STEP = {
  shift: 0.1,
  zoom: 0.82,
  ev: 0.6,
  contrast: 0.18,
  saturation: 0.2,
  temperature: 0.3,
  sharpen: 0.35,
};

const OPPOSITE: Record<string, string> = {
  brighten: "darken",
  darken: "brighten",
  tighten: "loosen",
  loosen: "tighten",
  "shift-left": "shift-right",
  "shift-right": "shift-left",
  "shift-up": "shift-down",
  "shift-down": "shift-up",
  "more-contrast": "less-contrast",
  "less-contrast": "more-contrast",
  "more-saturation": "less-saturation",
  "less-saturation": "more-saturation",
  warmer: "cooler",
  cooler: "warmer",
  sharpen: "soften",
  soften: "sharpen",
};

export function makeEditRefinementLoop(
  frame: Frame,
  editor: Editor,
  judge: VisionJudge,
  opts: { bar?: number; maxRounds?: number } = {},
): LoopSpec<RefineState, EditedImage, Critique> {
  return {
    name: `edit-refine:${frame.id}`,
    bar: opts.bar ?? 8.5,
    maxRounds: opts.maxRounds ?? 10,
    candidateKey: (img) => `${img.frameId}:${recipeSlug(img.recipe)}`,

    async act(state) {
      return editor.edit(frame, state.recipe);
    },

    async observe(candidate) {
      return judge.critique(frame, candidate);
    },

    async score(_candidate, critique) {
      return { score: r1(overallScore(critique)), critique };
    },

    async correct(state, _candidate, critique) {
      const currentScore = overallScore(critique);

      // Backfire guard: if the last correction dropped the overall score
      // hard, revert it and halve the step before trying again. Small
      // dips are tolerated — fixing one axis often costs another a bit
      // before a follow-up correction lands.
      const BACKFIRE = 0.5;
      if (state.last && currentScore < state.last.score - BACKFIRE) {
        const { axis, hint } = state.last;
        const prev = state.corrections[axis];
        return {
          state: {
            recipe: state.last.recipe,
            corrections: {
              ...state.corrections,
              [axis]: { lastHint: hint, stepScale: (prev?.stepScale ?? 1) * 0.5 },
            },
            last: undefined,
          },
          note: `${axis} → ${hint} backfired (${state.last.score.toFixed(1)} → ${currentScore.toFixed(1)}) — reverting, halving step`,
        };
      }

      // Lowest-scoring axis with an actionable hint. An axis can bottom
      // out for reasons no recipe change fixes (e.g. motion blur baked
      // into the source) — skip those rather than spin.
      const actionable = Object.entries(critique)
        .filter(([, c]) => c.hint && c.hint !== "none")
        .sort((a, b) => a[1].score - b[1].score);

      for (const [axis, { score, hint }] of actionable) {
        // A shift on a full-frame crop is clamped to a no-op; tightening
        // first creates room to pan.
        const tries = hint!.startsWith("shift-") ? [hint!, "tighten"] : [hint!];
        for (const h of tries) {
          const prev = state.corrections[axis];
          const overshot = prev !== undefined && OPPOSITE[prev.lastHint] === h;
          const stepScale = prev === undefined ? 1 : overshot ? prev.stepScale * 0.5 : prev.stepScale;
          const recipe = applyHint(state.recipe, h, stepScale);
          if (recipeSlug(recipe) === recipeSlug(state.recipe)) continue; // clamped no-op
          const extras = [
            overshot ? "overshot, halving step" : "",
            h !== hint ? `${hint} clamped at frame edge, tightening to make room` : "",
          ]
            .filter(Boolean)
            .join("; ");
          return {
            state: {
              recipe,
              corrections: { ...state.corrections, [axis]: { lastHint: h, stepScale } },
              last: { recipe: state.recipe, score: currentScore, axis, hint: h },
            },
            note: `${axis} lowest (${score}) → ${h}${extras ? ` (${extras})` : ""} (${describeDelta(state.recipe, recipe)})`,
          };
        }
      }
      return {
        state,
        note: "no actionable correction — remaining flaws are in the source frame",
        stop: true,
      };
    },
  };
}

/** Apply exactly one bounded adjustment to the recipe. */
function applyHint(recipe: Recipe, hint: string, stepScale: number): Recipe {
  const B = RECIPE_BOUNDS;
  const c = { ...recipe.crop };
  const out: Recipe = { ...recipe, crop: c };
  const shift = BASE_STEP.shift * stepScale;

  switch (hint) {
    case "brighten":
      out.exposureEv = clamp(out.exposureEv + BASE_STEP.ev * stepScale, B.exposureEv[0], B.exposureEv[1]);
      break;
    case "darken":
      out.exposureEv = clamp(out.exposureEv - BASE_STEP.ev * stepScale, B.exposureEv[0], B.exposureEv[1]);
      break;
    case "more-contrast":
      out.contrast = clamp(out.contrast + BASE_STEP.contrast * stepScale, B.contrast[0], B.contrast[1]);
      break;
    case "less-contrast":
      out.contrast = clamp(out.contrast - BASE_STEP.contrast * stepScale, B.contrast[0], B.contrast[1]);
      break;
    case "more-saturation":
      out.saturation = clamp(out.saturation + BASE_STEP.saturation * stepScale, B.saturation[0], B.saturation[1]);
      break;
    case "less-saturation":
      out.saturation = clamp(out.saturation - BASE_STEP.saturation * stepScale, B.saturation[0], B.saturation[1]);
      break;
    case "warmer":
      out.temperature = clamp(out.temperature + BASE_STEP.temperature * stepScale, B.temperature[0], B.temperature[1]);
      break;
    case "cooler":
      out.temperature = clamp(out.temperature - BASE_STEP.temperature * stepScale, B.temperature[0], B.temperature[1]);
      break;
    case "sharpen":
      out.sharpen = clamp(out.sharpen + BASE_STEP.sharpen * stepScale, B.sharpen[0], B.sharpen[1]);
      break;
    case "soften":
      out.sharpen = clamp(out.sharpen - BASE_STEP.sharpen * stepScale, B.sharpen[0], B.sharpen[1]);
      break;
    case "shift-left":
      c.x = clamp(c.x - shift, 0, 1 - c.w);
      break;
    case "shift-right":
      c.x = clamp(c.x + shift, 0, 1 - c.w);
      break;
    case "shift-up":
      c.y = clamp(c.y - shift, 0, 1 - c.h);
      break;
    case "shift-down":
      c.y = clamp(c.y + shift, 0, 1 - c.h);
      break;
    case "tighten":
    case "loosen": {
      const factor = hint === "tighten" ? 1 - (1 - BASE_STEP.zoom) * stepScale : 1 + (1 - BASE_STEP.zoom) * stepScale;
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      c.w = clamp(c.w * factor, B.minCropSize, 1);
      c.h = clamp(c.h * factor, B.minCropSize, 1);
      c.x = clamp(cx - c.w / 2, 0, 1 - c.w);
      c.y = clamp(cy - c.h / 2, 0, 1 - c.h);
      break;
    }
    default:
      throw new Error(`unknown correction hint: ${hint}`);
  }

  out.crop = { x: r2(c.x), y: r2(c.y), w: r2(c.w), h: r2(c.h) };
  out.exposureEv = r2(out.exposureEv);
  out.contrast = r2(out.contrast);
  out.saturation = r2(out.saturation);
  out.temperature = r2(out.temperature);
  out.sharpen = r2(out.sharpen);
  return out;
}

/**
 * Overall = 60% mean + 40% worst axis. A plain mean over six axes lets
 * one terrible axis hide behind five good ones; weighting the minimum
 * keeps the loop honest — it cannot converge while any axis is bad.
 */
function overallScore(critique: Critique): number {
  const scores = Object.values(critique).map((a) => a.score);
  return 0.6 * meanScore(critique) + 0.4 * Math.min(...scores);
}

const SCALAR_LABEL: Array<[keyof Recipe & string, string]> = [
  ["exposureEv", "EV"],
  ["contrast", "contrast"],
  ["saturation", "saturation"],
  ["temperature", "temp"],
  ["sharpen", "sharpen"],
];

function describeDelta(before: Recipe, after: Recipe): string {
  for (const [key, label] of SCALAR_LABEL) {
    const b = before[key] as number;
    const a = after[key] as number;
    if (b !== a) return `${label} ${b.toFixed(2)} → ${a.toFixed(2)}`;
  }
  const b = before.crop;
  const a = after.crop;
  return `crop [${b.x},${b.y},${b.w}x${b.h}] → [${a.x},${a.y},${a.w}x${a.h}]`;
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
