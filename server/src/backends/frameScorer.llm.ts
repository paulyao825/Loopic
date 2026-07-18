import { readFile } from "node:fs/promises";
import type { JudgeConfig } from "../appConfig.js";
import type { Frame, FrameQuality } from "../domain/types.js";
import type { PhotoPreference } from "../domain/photoPreference.js";
import { preferenceProfile } from "../domain/photoPreference.js";
import { requestKimi } from "./kimi.js";
import type { FrameScorer } from "./frameScorer.js";

const BATCH_SIZE = 6;

interface ModelFrameJudgment {
  id: string;
  impact: number;
  story: number;
  composition: number;
  technical: number;
  reason?: string;
}

interface ModelFrameScore extends ModelFrameJudgment {
  aesthetic: number;
}

export function buildFrameJudgePrompt(preference: PhotoPreference): string {
  const profile = preferenceProfile(preference);
  const w = profile.weights;
  return `You are a professional photo editor selecting real photographs hidden inside one video sequence.
Apply criteria adapted from PPA merit-image judging and World Press Photo visual quality, story, and authenticity standards.
Evaluate every supplied frame relative to the other frames in this batch, using these professional dimensions:
- impact: immediate emotional or visual force; for people and action, reward the decisive authentic instant
- story: a clear subject, meaningful context, expression, gesture, relationship, or environmental narrative
- composition: intentional visual hierarchy, balance, depth, geometry, edge control, gaze/action room, and useful negative space
- technical: subject-appropriate focus, exposure, tonal separation, color, and freedom from distracting artifacts

User preference: ${profile.label}. ${profile.focus}
Final weighting: impact ${w.impact}, story ${w.story}, composition ${w.composition}, technical ${w.technical}.

Calibration: 9 = exceptional or award-worthy, 7 = a strong keeper, 5 = ordinary but usable,
3 = an obvious missed moment or major flaw, 1 = unusable. Use the full scale and keep scores comparable across batches.
Do not require centered subjects, tight framing, neutral white balance, high saturation, or maximum sharpness.
Reward intentional symmetry, rule of thirds, leading lines, negative space, atmosphere, and meaningful motion blur when appropriate.
Judge the photograph that exists; do not imagine generated replacements. Each id must appear exactly once.
Respond only with JSON: {"frames":[{"id":"frame_001","impact":8.2,"story":7.8,"composition":8.4,"technical":7.2,"reason":"short specific reason"}]}`;
}

/** Adds multimodal aesthetic judgment to the fast local pixel scorer. */
export class LlmFrameScorer implements FrameScorer {
  private readonly scores = new Map<string, number>();
  private failed = false;

  constructor(
    private readonly local: FrameScorer,
    private readonly cfg: JudgeConfig,
    private readonly preference: PhotoPreference,
    private readonly onFallback: (err: unknown) => void,
  ) {}

  async prepare(frames: Frame[]): Promise<void> {
    if (this.failed) return;
    try {
      for (let i = 0; i < frames.length; i += BATCH_SIZE) {
        const batch = frames.slice(i, i + BATCH_SIZE);
        const modelScores = await this.scoreBatch(batch);
        for (const item of modelScores) this.scores.set(item.id, clamp01(item.aesthetic / 10));
      }
    } catch (err) {
      this.failed = true;
      this.scores.clear();
      this.onFallback(err);
    }
  }

  async score(frame: Frame): Promise<FrameQuality> {
    const local = await this.local.score(frame);
    const aesthetic = this.scores.get(frame.id);
    return aesthetic === undefined ? local : { ...local, aesthetic };
  }

  similarity(a: Frame, b: Frame): Promise<number> {
    return this.local.similarity(a, b);
  }

  private async scoreBatch(frames: Frame[]): Promise<ModelFrameScore[]> {
    const content: Array<Record<string, unknown>> = [
      { type: "text", text: `Score these ${frames.length} frames in the same order. Compare them against each other.` },
    ];
    for (const frame of frames) {
      const jpeg = await readFile(frame.uri);
      content.push({ type: "text", text: `${frame.id} at ${frame.t.toFixed(2)} seconds` });
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` },
      });
    }

    const text = await requestKimi({
      cfg: this.cfg,
      label: "frame scorer",
      body: {
        max_tokens: 1_200,
        messages: [
          { role: "system", content: buildFrameJudgePrompt(this.preference) },
          { role: "user", content },
        ],
      },
    });
    return parseFrameScores(text, frames.map((f) => f.id), this.preference);
  }
}

export function parseFrameScores(
  text: string,
  expectedIds: string[],
  preference: PhotoPreference = "balanced",
): ModelFrameScore[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`frame scorer returned no JSON: ${text.slice(0, 160)}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as { frames?: ModelFrameJudgment[] };
  if (!Array.isArray(parsed.frames)) throw new Error("frame scorer returned no frames array");

  const byId = new Map(parsed.frames.map((item) => [item.id, item]));
  if (byId.size !== parsed.frames.length) throw new Error("frame scorer returned duplicate frame ids");
  if (byId.size !== expectedIds.length || [...byId.keys()].some((id) => !expectedIds.includes(id))) {
    throw new Error("frame scorer returned unexpected frame ids");
  }
  const weights = preferenceProfile(preference).weights;
  return expectedIds.map((id) => {
    const item = byId.get(id);
    if (
      !item ||
      !Number.isFinite(item.impact) ||
      !Number.isFinite(item.story) ||
      !Number.isFinite(item.composition) ||
      !Number.isFinite(item.technical)
    ) {
      throw new Error(`frame scorer omitted or malformed ${id}`);
    }
    const impact = clamp10(item.impact);
    const story = clamp10(item.story);
    const composition = clamp10(item.composition);
    const technical = clamp10(item.technical);
    const aesthetic = r1(
      impact * weights.impact +
      story * weights.story +
      composition * weights.composition +
      technical * weights.technical,
    );
    return { id, impact, story, composition, technical, aesthetic, reason: String(item.reason ?? "") };
  });
}

function clamp10(value: number): number {
  return Math.max(0, Math.min(10, value));
}

function r1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
