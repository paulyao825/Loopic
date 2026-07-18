import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { JudgeConfig } from "../appConfig.js";
import type { EditedImage, Frame } from "../domain/types.js";
import { buildEditJudgePrompt, LlmVisionJudge } from "./judge.llm.js";

const critiqueJson = JSON.stringify({
  cropFraming: { score: 8, reason: "context retained", hint: "none" },
  exposure: { score: 8, reason: "balanced", hint: "none" },
  contrast: { score: 8, reason: "clear separation", hint: "none" },
  color: { score: 8, reason: "coherent", hint: "none" },
  whiteBalance: { score: 8, reason: "intentional warmth", hint: "none" },
  sharpness: { score: 8, reason: "critical detail clear", hint: "none" },
});

test("edit judge prompt preserves intentional photographic choices", () => {
  const prompt = buildEditJudgePrompt("scenic-composed");
  assert.match(prompt, /Scenic & composed/);
  assert.match(prompt, /useful negative space/);
  assert.match(prompt, /do not neutralize an intentional warm or cool atmosphere/i);
});

test("LlmVisionJudge sends the original and edited image to Kimi", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "precious-frame-judge-"));
  const sourcePath = path.join(dir, "source.jpg");
  const editedPath = path.join(dir, "edited.jpg");
  await Promise.all([writeFile(sourcePath, "source"), writeFile(editedPath, "edited")]);

  const cfg: JudgeConfig = {
    provider: "kimi",
    model: "kimi-k2.6",
    apiKey: "test-key",
    baseUrl: "https://api.moonshot.cn/v1",
  };
  const source: Frame = { id: "frame_001", t: 0, uri: sourcePath };
  const edited: EditedImage = {
    frameId: source.id,
    uri: editedPath,
    backend: "sharp",
    recipe: { crop: { x: 0, y: 0, w: 1, h: 1 }, exposureEv: 0, contrast: 1, saturation: 1, temperature: 0, sharpen: 0 },
  };
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: critiqueJson } }] }), { status: 200 });
  };

  try {
    const judge = new LlmVisionJudge((uri) => uri, cfg, "balanced");
    const critique = await judge.critique(source, edited);
    assert.equal(critique.cropFraming?.score, 8);
    const messages = requestBody?.messages as Array<{ content?: unknown }>;
    const userContent = messages[1]?.content as Array<{ type?: string }>;
    assert.equal(userContent.filter((part) => part.type === "image_url").length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});
