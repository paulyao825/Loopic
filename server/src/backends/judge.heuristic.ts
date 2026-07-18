import type { VisionJudge } from "./judge.js";
import type { Critique } from "../core/loop.js";
import type { EditedImage, Frame } from "../domain/types.js";
import { clamp } from "../domain/types.js";
import { analyzeImage, sharpnessScore } from "../media/analysis.js";

/**
 * Real vision judge that needs no API key: scores the actual pixels of
 * the edited image on concrete axes. The Kimi judge replaces it when
 * MOONSHOT_API_KEY is configured. The hint vocabulary is identical either way.
 */
export class HeuristicVisionJudge implements VisionJudge {
  constructor(private readonly resolvePath: (uri: string) => string) {}

  async critique(_source: Frame, image: EditedImage): Promise<Critique> {
    const s = await analyzeImage(this.resolvePath(image.uri));
    const { recipe } = image;
    const cropArea = recipe.crop.w * recipe.crop.h;

    // --- cropFraming: is the visual energy centered and filling the frame?
    const dx = s.centroidX - 0.5;
    const dy = s.centroidY - 0.5;
    const offset = Math.hypot(dx, dy);
    const concDeficit = Math.max(0, 0.55 - s.centerConcentration);
    const cropScore = clamp(10 - offset * 20 - concDeficit * 11, 0, 10);
    let cropHint = "none";
    let cropReason = "subject energy well centered and fills the frame";
    if (concDeficit * 11 > offset * 20 && cropArea > 0.38) {
      cropHint = "tighten";
      cropReason = "framing is loose — subject energy spread thin across the frame";
    } else if (offset > 0.045) {
      cropHint = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "shift-right" : "shift-left") : dy > 0 ? "shift-down" : "shift-up";
      cropReason = `subject energy sits ${dx > 0 ? "right" : "left"}${Math.abs(dy) > 0.03 ? (dy > 0 ? " and low" : " and high") : ""} of center`;
    } else if (concDeficit > 0.04 && cropArea > 0.38) {
      cropHint = "tighten";
      cropReason = "composition nearly there, subject still reads small";
    }

    // --- exposure: midtone placement + clipping.
    const lumaErr = s.meanLuma - 0.5;
    const expScore = clamp(10 - Math.abs(lumaErr) * 28 - s.clippedHighlights * 45 - s.clippedShadows * 45, 0, 10);
    let expHint = "none";
    let expReason = `midtones balanced (mean luma ${s.meanLuma.toFixed(2)})`;
    if (s.clippedHighlights > 0.06 || lumaErr > 0.05) {
      expHint = "darken";
      expReason =
        s.clippedHighlights > 0.06
          ? `${(s.clippedHighlights * 100).toFixed(0)}% of pixels blown to white`
          : `image runs bright (mean luma ${s.meanLuma.toFixed(2)})`;
    } else if (s.clippedShadows > 0.1 || lumaErr < -0.05) {
      expHint = "brighten";
      expReason =
        s.clippedShadows > 0.1
          ? `${(s.clippedShadows * 100).toFixed(0)}% of pixels crushed to black`
          : `image runs dark (mean luma ${s.meanLuma.toFixed(2)})`;
    }

    // --- contrast: luma spread. Flat -> punchy; harsh -> ease off.
    const conScore = clamp(10 - Math.max(0, 0.14 - s.lumaStd) * 60 - Math.max(0, s.lumaStd - 0.3) * 45, 0, 10);
    let conHint = "none";
    let conReason = `tonal range healthy (σ ${s.lumaStd.toFixed(2)})`;
    if (s.lumaStd < 0.12) {
      conHint = "more-contrast";
      conReason = `image is flat (luma σ ${s.lumaStd.toFixed(2)})`;
    } else if (s.lumaStd > 0.32) {
      conHint = "less-contrast";
      conReason = `tones are harsh (luma σ ${s.lumaStd.toFixed(2)})`;
    }

    // --- color: saturation via mean chroma.
    const colScore = clamp(10 - Math.max(0, 0.09 - s.meanChroma) * 75 - Math.max(0, s.meanChroma - 0.45) * 35, 0, 10);
    let colHint = "none";
    let colReason = `color presence natural (chroma ${s.meanChroma.toFixed(2)})`;
    if (s.meanChroma < 0.07) {
      colHint = "more-saturation";
      colReason = `colors are washed out (chroma ${s.meanChroma.toFixed(2)})`;
    } else if (s.meanChroma > 0.5) {
      colHint = "less-saturation";
      colReason = `colors oversaturated (chroma ${s.meanChroma.toFixed(2)})`;
    }

    // --- whiteBalance: red/blue cast.
    const wbScore = clamp(10 - Math.max(0, Math.abs(s.warmth) - 0.05) * 40, 0, 10);
    let wbHint = "none";
    let wbReason = "neutral color temperature";
    if (s.warmth > 0.1) {
      wbHint = "cooler";
      wbReason = `warm cast (r−b ${s.warmth.toFixed(2)})`;
    } else if (s.warmth < -0.1) {
      wbHint = "warmer";
      wbReason = `cool cast (r−b ${s.warmth.toFixed(2)})`;
    }

    // --- sharpness: laplacian variance; tight crops upscale and soften.
    const shScore = clamp(sharpnessScore(s.laplacianVariance), 0, 10);
    let shHint = "none";
    let shReason = shScore > 7 ? "crisp detail" : "source frame carries some softness";
    if (cropArea < 0.3 && shScore < 7) {
      shHint = "loosen";
      shReason = "crop so tight the upscale looks soft";
    } else if (shScore < 7 && recipe.sharpen < 1) {
      shHint = "sharpen";
      shReason = "detail reads soft — output sharpening can recover some";
    }

    return {
      cropFraming: { score: r1(cropScore), reason: cropReason, hint: cropHint },
      exposure: { score: r1(expScore), reason: expReason, hint: expHint },
      contrast: { score: r1(conScore), reason: conReason, hint: conHint },
      color: { score: r1(colScore), reason: colReason, hint: colHint },
      whiteBalance: { score: r1(wbScore), reason: wbReason, hint: wbHint },
      sharpness: { score: r1(shScore), reason: shReason, hint: shHint },
    };
  }
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}
