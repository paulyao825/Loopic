import type { PhotoPreference, RunEvent } from "./types";

const API_BASE = (
  new URLSearchParams(window.location.search).get("api") ??
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  ""
)
  .trim()
  .replace(/\/+$/, "");

const api = (path: string) => `${API_BASE}${path}`;
const MAX_FRAMES = 24;
const MAX_FRAME_BYTES = 120 * 1024;

/**
 * Runs extraction in the browser, then keeps processing and progress events in
 * one request. This is required on serverless hosts where memory and /tmp are
 * not shared across separate upload, start, and EventSource requests.
 */
export function runVideo(
  file: File,
  n: number,
  preference: PhotoPreference,
  onEvent: (event: RunEvent) => void,
  onError?: (message: string) => void,
): () => void {
  const controller = new AbortController();
  void streamRun(file, n, preference, onEvent, controller.signal).catch((error) => {
    if (!controller.signal.aborted) onError?.(error instanceof Error ? error.message : String(error));
  });
  return () => controller.abort();
}

async function streamRun(
  file: File,
  n: number,
  preference: PhotoPreference,
  onEvent: (event: RunEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const extracted = await extractCandidateFrames(file, signal);
  const form = new FormData();
  form.append("n", String(n));
  form.append("preference", preference);
  form.append("timestamps", JSON.stringify(extracted.map((frame) => frame.t)));
  extracted.forEach((frame, index) => {
    form.append("frames", frame.blob, `frame_${String(index + 1).padStart(3, "0")}.jpg`);
  });

  const response = await fetch(api("/api/run"), { method: "POST", body: form, signal });
  if (!response.ok) throw new Error(`run failed to start: ${await response.text()}`);
  if (!response.body) throw new Error("run stream is unavailable");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (line.startsWith("data: ")) onEvent(absolutizeMedia(JSON.parse(line.slice(6)) as RunEvent));
      newline = buffer.indexOf("\n");
    }

    if (done) break;
  }
}

function absolutizeMedia<T>(value: T): T {
  if (!API_BASE) return value;
  if (typeof value === "string") {
    return (value.startsWith("/media/") ? `${API_BASE}${value}` : value) as T;
  }
  if (Array.isArray(value)) return value.map(absolutizeMedia) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, absolutizeMedia(item)])) as T;
  }
  return value;
}

async function extractCandidateFrames(
  file: File,
  signal: AbortSignal,
): Promise<Array<{ blob: Blob; t: number }>> {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await waitForVideo(video, "loadedmetadata", signal);
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new Error("The selected video has no readable frames.");
    }

    const count = Math.min(MAX_FRAMES, Math.max(1, Math.ceil(video.duration * 4)));
    const width = Math.min(640, video.videoWidth);
    const height = Math.max(2, Math.round((video.videoHeight / video.videoWidth) * width / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: false });
    if (!context) throw new Error("This browser cannot extract video frames.");

    const frames: Array<{ blob: Blob; t: number }> = [];
    for (let index = 0; index < count; index++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const t = Math.min(video.duration - 0.001, ((index + 0.5) / count) * video.duration);
      await seekVideo(video, t, signal);
      context.drawImage(video, 0, 0, width, height);
      frames.push({ blob: await boundedJpeg(canvas), t: Math.round(t * 100) / 100 });
    }
    return frames;
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  }
}

function waitForVideo(video: HTMLVideoElement, eventName: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, onReady);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("The selected video format could not be read by this browser."));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, time: number, signal: AbortSignal): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.005 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const ready = waitForVideo(video, "seeked", signal);
  video.currentTime = time;
  await ready;
}

async function boundedJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  let quality = 0.78;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob.size > MAX_FRAME_BYTES && quality > 0.46) {
    quality -= 0.08;
    blob = await canvasToJpeg(canvas, quality);
  }
  return blob;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode a video frame."))), "image/jpeg", quality);
  });
}
