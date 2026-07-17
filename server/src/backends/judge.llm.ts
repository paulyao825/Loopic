import { readFile } from "node:fs/promises";
import type { VisionJudge } from "./judge.js";
import type { Critique, AxisCritique } from "../core/loop.js";
import type { EditedImage } from "../domain/types.js";
import type { JudgeConfig } from "../appConfig.js";

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

export const JUDGE_SYSTEM_PROMPT = `You are a photo-edit judge inside an automated critique-and-refine loop.
Score the image 0-10 on EXACTLY these axes (concrete flaws only, never vague "beauty"):
- cropFraming: subject centered and filling the frame? (tighten also means zoom in)
- exposure: midtone placement, crushed shadows, blown highlights
- contrast: flat vs harsh tonal range
- color: saturation — washed out vs oversaturated
- whiteBalance: warm/cool color cast
- sharpness: apparent detail (over-tight crops look soft when upscaled)
For each axis give a one-line reason and ONE hint from: ${JUDGE_HINTS.join(", ")}.
Hints are directions for the NEXT single edit step (e.g. "shift-right" moves the crop window right). The loop picks magnitudes, not you. Use "none" when the axis needs nothing.
Respond ONLY with JSON: {"cropFraming":{"score":n,"reason":"...","hint":"..."},"exposure":{...},"contrast":{...},"color":{...},"whiteBalance":{...},"sharpness":{...}}`;

/**
 * LLM vision judge, provider-agnostic. OpenAI, Gemini and OpenRouter are
 * served through the OpenAI-compatible chat completions API; Anthropic
 * through its native messages API. Configure in loopic.config.json.
 */
export class LlmVisionJudge implements VisionJudge {
  constructor(
    private readonly resolvePath: (uri: string) => string,
    private readonly cfg: JudgeConfig,
  ) {}

  async critique(image: EditedImage): Promise<Critique> {
    const jpeg = await readFile(this.resolvePath(image.uri));
    const b64 = jpeg.toString("base64");
    const userText = `Applied recipe: ${JSON.stringify(image.recipe)}. Judge the image.`;

    const text =
      this.cfg.provider === "anthropic"
        ? await this.callAnthropic(b64, userText)
        : await this.callOpenAiCompatible(b64, userText);

    return parseCritique(text);
  }

  private async callOpenAiCompatible(b64: string, userText: string): Promise<string> {
    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: this.cfg.model,
        max_tokens: 700,
        temperature: 0,
        messages: [
          { role: "system", content: JUDGE_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${this.cfg.provider} judge failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return body.choices[0]?.message.content ?? "";
  }

  private async callAnthropic(b64: string, userText: string): Promise<string> {
    const res = await fetch(`${this.cfg.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.cfg.apiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.cfg.model,
        max_tokens: 700,
        system: JUDGE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`anthropic judge failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    return body.content.find((c) => c.type === "text")?.text ?? "";
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
