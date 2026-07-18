import assert from "node:assert/strict";
import test from "node:test";
import { frameQualityScore } from "../domain/types.js";
import { buildFrameJudgePrompt, parseFrameScores } from "./frameScorer.llm.js";

test("parseFrameScores preserves order, clamps axes, and applies preference weights", () => {
  const scores = parseFrameScores(
    '```json\n{"frames":[{"id":"frame_002","impact":12,"story":12,"composition":12,"technical":12},{"id":"frame_001","impact":8,"story":6,"composition":4,"technical":2}]}\n```',
    ["frame_001", "frame_002"],
  );

  assert.deepEqual(scores.map(({ id, aesthetic }) => ({ id, aesthetic })), [
    { id: "frame_001", aesthetic: 5.3 },
    { id: "frame_002", aesthetic: 10 },
  ]);

  const competition = parseFrameScores(
    '{"frames":[{"id":"frame_001","impact":8,"story":6,"composition":4,"technical":2}]}',
    ["frame_001"],
    "competition",
  );
  assert.equal(competition[0]?.aesthetic, 4.9);
});

test("frame judge prompt includes the selected profile and professional calibration", () => {
  const prompt = buildFrameJudgePrompt("people-emotion");
  assert.match(prompt, /People & emotion/);
  assert.match(prompt, /9 = exceptional or award-worthy/);
  assert.match(prompt, /Do not require centered subjects/);
});

test("parseFrameScores rejects duplicate or incomplete frames", () => {
  assert.throws(
    () => parseFrameScores('{"frames":[{"id":"frame_001","impact":8,"story":7,"composition":6,"technical":5},{"id":"frame_001","impact":7,"story":7,"composition":7,"technical":7}]}', ["frame_001"]),
    /duplicate frame ids/,
  );
  assert.throws(
    () => parseFrameScores('{"frames":[{"id":"frame_001","impact":8}]}', ["frame_001"]),
    /malformed frame_001/,
  );
});

test("vision aesthetic score is the largest frame-selection signal", () => {
  const lowAesthetic = frameQualityScore({ sharpness: 1, exposure: 1, interest: 1, aesthetic: 0 });
  const highAesthetic = frameQualityScore({ sharpness: 0, exposure: 0, interest: 0, aesthetic: 1 });

  assert.equal(lowAesthetic, 4.5);
  assert.equal(highAesthetic, 5.5);
});
