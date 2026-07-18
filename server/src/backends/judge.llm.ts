import { readFile } from "node:fs/promises";
import type { VisionJudge } from "./judge.js";
import type { Critique, AxisCritique } from "../core/loop.js";
import type { EditedImage, Frame } from "../domain/types.js";
import type { JudgeConfig } from "../appConfig.js";
import type { PhotoPreference } from "../domain/photoPreference.js";
import { preferenceProfile } from "../domain/photoPreference.js";
import { requestKimi } from "./kimi.js";

export const JUDGE_AXES = ["cropFraming", "exposure", "contrast", "color", "whiteBalance", "sharpness"] as const;

export const JUDGE_HINTS = [
  "none",
  "brighten", "darken",
  "tighten", "loosen",
  "shift-left", "shift-right", "shift-up", "shift-down",
  "more-contrast", "less-contrast",
  "more-saturation", "less-saturation",
  "warmer", "cooler",
  "sharpen", "soften",
] as const;

export function buildEditJudgePrompt(preference: PhotoPreference): string {
  const profile = preferenceProfile(preference);
  return `You are a professional photo-edit judge inside an automated critique-and-refine loop.
Apply criteria adapted from PPA merit-image judging and World Press Photo visual quality, story, and authenticity standards.
You receive two images in order: the original source frame, then the edited candidate. Judge only the edited candidate,
but compare it with the source so the edit does not remove important story, context, expression, gesture, or atmosphere.
User preference: ${profile.label}. ${profile.focus}

Score the edited candidate 0-10 on exactly these actionable axes:
- cropFraming: intentional visual hierarchy, balance, edge control, gaze/action room, useful negative space, and retained context
- exposure: subject-appropriate brightness and accidental crushed shadows or blown highlights; preserve intentional mood
- contrast: useful tonal separation without unintended flatness or harsh clipping
- color: coherent, subject-appropriate saturation and skin/color relationships; muted or vivid color may be intentional
- whiteBalance: unwanted color cast only; do not neutralize an intentional warm or cool atmosphere
- sharpness: critical subject detail without halos or brittle oversharpening; meaningful motion blur is allowed

Do not require centered subjects, tight framing, neutral color, high saturation, or maximum sharpness.
For each axis give one short, visible, specific reason and exactly one hint from: ${JUDGE_HINTS.join(", ")}.
Hints direct the next single supported edit; the loop chooses magnitude. Use "none" when no supported edit is clearly beneficial.
A score of 8 or higher means no meaningful correction is needed on that axis.
Respond only with JSON: {"cropFraming":{"score":n,"reason":"...","hint":"..."},"exposure":{...},"contrast":{...},"color":{...},"whiteBalance":{...},"sharpness":{...}}`;
}

/** Kimi vision judge through Moonshot's OpenAI-compatible chat completions API. */
export class LlmVisionJudge implements VisionJudge {
  constructor(
    private readonly resolvePath: (uri: string) => string,
    private readonly cfg: JudgeConfig,
    private readonly preference: PhotoPreference,
  ) {}

  async critique(source: Frame, image: EditedImage): Promise<Critique> {
    const [sourceJpeg, editedJpeg] = await Promise.all([
      readFile(source.uri),
      readFile(this.resolvePath(image.uri)),
    ]);

    return parseCritique(await this.callKimi(sourceJpeg.toString("base64"), editedJpeg.toString("base64"), image));
  }

  private callKimi(sourceB64: string, editedB64: string, image: EditedImage): Promise<string> {
    return requestKimi({
      cfg: this.cfg,
      label: "edit judge",
      body: {
        max_tokens: 700,
        messages: [
          { role: "system", content: buildEditJudgePrompt(this.preference) },
          {
            role: "user",
            content: [
              { type: "text", text: "Original source frame:" },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${sourceB64}` } },
              { type: "text", text: "Edited candidate:" },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${editedB64}` } },
              { type: "text", text: `Applied recipe: ${JSON.stringify(image.recipe)}. Judge the edited candidate.` },
            ],
          },
        ],
      },
    });
  }
}

export function parseCritique(text: string): Critique {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`judge returned no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, AxisCritique>;

  const critique: Critique = {};
  for (const axis of JUDGE_AXES) {
    const a = parsed[axis];
    if (!a || typeof a.score !== "number") throw new Error(`judge returned malformed axis "${axis}"`);
    critique[axis] = {
      score: Math.max(0, Math.min(10, a.score)),
      reason: String(a.reason ?? ""),
      hint: JUDGE_HINTS.includes((a.hint ?? "none") as (typeof JUDGE_HINTS)[number]) ? a.hint : "none",
    };
  }
  return critique;
}
