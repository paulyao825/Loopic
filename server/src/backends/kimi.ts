import type { JudgeConfig } from "../appConfig.js";

type FetchLike = typeof fetch;
type Sleep = (ms: number) => Promise<void>;

export interface KimiRequestOptions {
  cfg: JudgeConfig;
  body: Record<string, unknown>;
  label: string;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
}

interface KimiResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function requestKimi({
  cfg,
  body,
  label,
  fetchImpl = fetch,
  sleep = defaultSleep,
}: KimiRequestOptions): Promise<string> {
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        ...body,
        model: cfg.model,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
      }),
    });

    if (res.ok) {
      const payload = (await res.json()) as KimiResponse;
      return payload.choices?.[0]?.message?.content ?? "";
    }

    const message = (await res.text()).slice(0, 300);
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxRetries) {
      throw new Error(`Kimi ${label} failed: ${res.status} ${message}`);
    }

    await sleep(retryDelayMs(res.headers.get("retry-after"), attempt));
  }

  throw new Error(`Kimi ${label} failed without a response`);
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const seconds = Number(retryAfter);
  if (retryAfter && Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(5_000, seconds * 1_000);
  }
  return 250 * 2 ** attempt;
}
