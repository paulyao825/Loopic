import assert from "node:assert/strict";
import test from "node:test";
import type { JudgeConfig } from "../appConfig.js";
import { requestKimi } from "./kimi.js";

const cfg: JudgeConfig = {
  provider: "kimi",
  model: "kimi-k2.6",
  apiKey: "test-key",
  baseUrl: "https://api.moonshot.cn/v1",
};

test("requestKimi adds K2.6 non-thinking JSON settings without temperature", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const content = await requestKimi({
    cfg,
    label: "test",
    body: { messages: [{ role: "user", content: "test" }] },
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(content, '{"ok":true}');
  assert.equal(requestBody?.model, "kimi-k2.6");
  assert.deepEqual(requestBody?.thinking, { type: "disabled" });
  assert.deepEqual(requestBody?.response_format, { type: "json_object" });
  assert.equal("temperature" in (requestBody ?? {}), false);
});

test("requestKimi retries 429 and 5xx twice before succeeding", async () => {
  const statuses = [429, 503, 200];
  const delays: number[] = [];
  let calls = 0;
  const content = await requestKimi({
    cfg,
    label: "retry test",
    body: {},
    fetchImpl: async () => {
      const status = statuses[calls++] ?? 500;
      return status === 200
        ? new Response(JSON.stringify({ choices: [{ message: { content: "done" } }] }), { status })
        : new Response("busy", { status });
    },
    sleep: async (ms) => {
      delays.push(ms);
    },
  });

  assert.equal(content, "done");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [250, 500]);
});

test("requestKimi does not retry client errors", async () => {
  let calls = 0;
  await assert.rejects(
    requestKimi({
      cfg,
      label: "auth test",
      body: {},
      fetchImpl: async () => {
        calls++;
        return new Response("unauthorized", { status: 401 });
      },
      sleep: async () => undefined,
    }),
    /Kimi auth test failed: 401/,
  );
  assert.equal(calls, 1);
});
