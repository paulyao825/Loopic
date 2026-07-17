import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasAwsCredentials } from "./backends/aws.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

export type JudgeProvider = "heuristic" | "openai" | "gemini" | "anthropic" | "openrouter" | "bedrock";

export interface JudgeConfig {
  provider: JudgeProvider;
  model: string;
  apiKey?: string;
  baseUrl: string;
  /** Why we ended up on this provider (shown in the UI judge chip). */
  note?: string;
}

export interface ZeroConfig {
  enabled: boolean;
  maxPayUsdc: number;
  flourishQuery: string;
  editQuery: string;
}

export interface AwsAppConfig {
  region: string;
  /** Optional bucket for hosting intermediate images (presigned GETs). */
  s3Bucket: string;
}

export interface AppConfig {
  judge: JudgeConfig;
  loop: { bar: number; maxRounds: number };
  zero: ZeroConfig;
  aws: AwsAppConfig;
}

const PROVIDER_DEFAULTS: Record<Exclude<JudgeProvider, "heuristic" | "bedrock">, { model: string; keyEnv: string; baseUrl: string }> = {
  openai: {
    model: "gpt-4o-mini",
    keyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
  },
  gemini: {
    model: "gemini-2.5-flash",
    keyEnv: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  anthropic: {
    model: "claude-sonnet-4-5",
    keyEnv: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com/v1",
  },
  openrouter: {
    model: "google/gemini-2.5-flash",
    keyEnv: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
  },
};

/** Minimal .env loader — no dependency, values never override real env. */
function loadDotEnv(): void {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, "");
    }
  }
}

/**
 * Load loopic.config.json fresh (called per run so edits apply without a
 * restart). Any misconfiguration degrades to the heuristic judge with a
 * note — a demo must never die on a config typo.
 */
export function loadAppConfig(): AppConfig {
  loadDotEnv();

  let raw: Record<string, unknown> = {};
  const file = path.join(ROOT, "loopic.config.json");
  try {
    if (existsSync(file)) raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.warn(`loopic.config.json unreadable (${err}); using defaults`);
  }

  const judgeRaw = (raw.judge ?? {}) as Record<string, string>;
  const loopRaw = (raw.loop ?? {}) as Record<string, number>;
  const zeroRaw = (raw.zero ?? {}) as Record<string, unknown>;

  const awsRaw = (raw.aws ?? {}) as Record<string, string>;
  const aws: AwsAppConfig = {
    region: process.env.AWS_REGION ?? awsRaw.region ?? "us-east-1",
    s3Bucket: process.env.LOOPIC_S3_BUCKET ?? awsRaw.s3Bucket ?? "",
  };

  const provider = (process.env.JUDGE_PROVIDER ?? judgeRaw.provider ?? "heuristic") as JudgeProvider;
  let judge: JudgeConfig = { provider: "heuristic", model: "pixel-stats", baseUrl: "" };

  if (provider === "bedrock") {
    // Bedrock signs with AWS credentials (default chain), not an API key.
    if (hasAwsCredentials()) {
      judge = {
        provider,
        model: process.env.JUDGE_MODEL || judgeRaw.model || "amazon.nova-lite-v1:0",
        baseUrl: aws.region,
      };
    } else {
      judge.note = "bedrock selected but no AWS credentials found (env or ~/.aws) — using heuristic";
    }
  } else if (provider !== "heuristic") {
    const defaults = PROVIDER_DEFAULTS[provider as Exclude<JudgeProvider, "heuristic" | "bedrock">];
    if (!defaults) {
      judge.note = `unknown judge provider "${provider}" — using heuristic`;
    } else {
      const keyEnv = judgeRaw.apiKeyEnv || defaults.keyEnv;
      const apiKey = process.env[keyEnv];
      if (!apiKey) {
        judge.note = `${provider} selected but ${keyEnv} is not set — using heuristic`;
      } else {
        judge = {
          provider,
          model: process.env.JUDGE_MODEL ?? judgeRaw.model ?? defaults.model,
          apiKey,
          baseUrl: judgeRaw.baseUrl || defaults.baseUrl,
        };
        if (!judge.model) judge.model = defaults.model;
      }
    }
  }

  return {
    judge,
    loop: {
      bar: Number(loopRaw.bar ?? 8.0),
      maxRounds: Number(loopRaw.maxRounds ?? 8),
    },
    zero: {
      enabled: zeroRaw.enabled !== false,
      maxPayUsdc: Number(zeroRaw.maxPayUsdc ?? 0),
      flourishQuery: String(zeroRaw.flourishQuery ?? "image upscale enhance super-resolution photo"),
      editQuery: String(zeroRaw.editQuery ?? "photo image editing crop resize exposure"),
    },
    aws,
  };
}
