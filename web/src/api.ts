import type { RunEvent } from "./types";

/**
 * API base URL. Same-origin by default (dev proxy / single-process deploy).
 * For a static deploy (e.g. Vercel) point it at the backend with the
 * VITE_API_BASE build env or at runtime with ?api=https://backend.example.
 */
const API_BASE = (
  new URLSearchParams(window.location.search).get("api") ??
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  ""
)
  .trim()
  .replace(/\/+$/, "");

const api = (p: string) => `${API_BASE}${p}`;

/** Media URLs in events are server-relative ("/media/..") — make them absolute. */
function absolutizeMedia<T>(value: T): T {
  if (!API_BASE) return value;
  if (typeof value === "string") {
    return (value.startsWith("/media/") ? `${API_BASE}${value}` : value) as T;
  }
  if (Array.isArray(value)) return value.map(absolutizeMedia) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, absolutizeMedia(v)])) as T;
  }
  return value;
}

export async function uploadVideo(file: File): Promise<string> {
  const form = new FormData();
  form.append("video", file);
  const res = await fetch(api("/api/upload"), { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload failed: ${await res.text()}`);
  const { videoId } = (await res.json()) as { videoId: string };
  return videoId;
}

export async function requestSampleVideo(): Promise<string> {
  const res = await fetch(api("/api/sample"), { method: "POST" });
  if (!res.ok) throw new Error(`sample generation failed: ${await res.text()}`);
  const { videoId } = (await res.json()) as { videoId: string };
  return videoId;
}

export async function startRun(opts: {
  videoId: string;
  n: number;
  editorBackend: "local" | "zero";
  flourish: boolean;
}): Promise<string> {
  const res = await fetch(api("/api/run"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`run failed to start: ${await res.text()}`);
  const { runId } = (await res.json()) as { runId: string };
  return runId;
}

export function subscribeToRun(runId: string, onEvent: (e: RunEvent) => void, onError?: (message: string) => void): () => void {
  const source = new EventSource(api(`/api/runs/${runId}/events`));
  source.onmessage = (msg) => {
    const event = absolutizeMedia(JSON.parse(msg.data) as RunEvent);
    onEvent(event);
    if (event.type === "run:done" || event.type === "run:error") source.close();
  };
  source.onerror = () => {
    onError?.("Lost connection to the Loopic run stream. Start a new run and try again.");
    source.close();
  };
  return () => source.close();
}
