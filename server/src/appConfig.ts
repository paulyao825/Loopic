import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export type JudgeProvider = "kimi" | "heuristic";

export interface JudgeConfig {
  provider: JudgeProvider;
  model: string;
  apiKey?: string;
  baseUrl: string;
  note?: string;
}

export interface AppConfig {
  judge: JudgeConfig;
  loop: { bar: number; maxRounds: number };
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function loadDotEnv(): void {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match?.[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]!.replace(/^["']|["']$/g, "");
    }
  }
}

export function loadAppConfig(): AppConfig {
  loadDotEnv();

  let raw: Record<string, unknown> = {};
  const file = path.join(ROOT, "precious-frame.config.json");
  try {
    if (existsSync(file)) raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.warn(`precious-frame.config.json unreadable (${err}); using defaults`);
  }

  const judgeRaw = (raw.judge ?? {}) as Record<string, string>;
  const loopRaw = (raw.loop ?? {}) as Record<string, number>;
  const requestedProvider = process.env.VISION_PROVIDER ?? judgeRaw.provider ?? "kimi";
  let judge: JudgeConfig = { provider: "heuristic", model: "pixel-stats", baseUrl: "" };

  if (requestedProvider === "kimi") {
    const apiKey = process.env.MOONSHOT_API_KEY;
    if (apiKey) {
      judge = {
        provider: "kimi",
        model: process.env.VISION_MODEL ?? judgeRaw.model ?? "kimi-k2.6",
        apiKey,
        baseUrl: (
          process.env.VISION_BASE_URL ??
          judgeRaw.baseUrl ??
          "https://api.moonshot.cn/v1"
        ).replace(/\/+$/, ""),
      };
    } else {
      judge.note = "MOONSHOT_API_KEY is not set - using local pixel scoring";
    }
  } else if (requestedProvider !== "heuristic") {
    judge.note = `unknown vision provider "${requestedProvider}" - using local pixel scoring`;
  }

  return {
    judge,
    loop: {
      bar: boundedNumber(loopRaw.bar, 7.5, 0, 10),
      maxRounds: Math.round(boundedNumber(loopRaw.maxRounds, 8, 1, 20)),
    },
  };
}
