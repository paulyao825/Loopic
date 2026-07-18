import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import multer from "multer";
import { RunManager } from "./api/orchestrator.js";
import { isPhotoPreference } from "./domain/photoPreference.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = process.env.VERCEL ? "/tmp/precious-frame-data" : path.resolve(__dirname, "../data");
const DATA_DIR = path.resolve(process.env.PRECIOUS_FRAME_DATA_DIR ?? DEFAULT_DATA_DIR);
const WEB_DIST = path.resolve(__dirname, "../../web/dist");
const PORT = Number(process.env.PORT ?? 4000);

const urlFor = (absPath: string) => "/media/" + path.relative(DATA_DIR, absPath).split(path.sep).join("/");
const resolvePath = (url: string) => path.join(DATA_DIR, url.replace(/^\/media\//, ""));
const INLINE_MEDIA = Boolean(process.env.VERCEL) || process.env.PRECIOUS_FRAME_INLINE_MEDIA === "1";

const runs = new RunManager(DATA_DIR, urlFor, resolvePath);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(DATA_DIR, "uploads");
      mkdir(dir, { recursive: true }).then(
        () => cb(null, dir),
        (error: Error) => cb(error, dir),
      );
    },
    filename: (_req, file, cb) => {
      const originalExt = path.extname(file.originalname).toLowerCase();
      const extension = /^\.[a-z0-9]{1,5}$/.test(originalExt) ? originalExt : ".jpg";
      cb(null, `${randomUUID().slice(0, 8)}${extension}`);
    },
  }),
  limits: { fileSize: 512 * 1024, files: 24, fields: 3 },
});

export const app = express();
app.use(cors());
app.use(express.json());
app.use("/media", express.static(DATA_DIR, { maxAge: "1y", immutable: true }));

app.post("/api/run", upload.array("frames", 24), async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) return res.status(400).json({ error: "no video frames" });

  const rawPreference = req.body?.preference;
  if (rawPreference !== undefined && !isPhotoPreference(rawPreference)) {
    return res.status(400).json({ error: "unknown photo preference" });
  }

  let timestamps: number[] = [];
  try {
    const parsed = JSON.parse(String(req.body?.timestamps ?? "[]"));
    if (Array.isArray(parsed)) timestamps = parsed.map(Number);
  } catch {
    return res.status(400).json({ error: "invalid frame timestamps" });
  }

  const requestedCount = Number(req.body?.n ?? 3);
  const shotCount = Number.isFinite(requestedCount) ? Math.max(1, Math.min(8, Math.round(requestedCount))) : 3;
  const frames = files.map((file, index) => ({
    id: `frame_${String(index + 1).padStart(3, "0")}`,
    t: Number.isFinite(timestamps[index]) ? timestamps[index]! : index,
    uri: file.path,
  }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  await runs.run({ frames, n: shotCount, preference: rawPreference ?? "balanced" }, (event) => {
    const payload = INLINE_MEDIA ? inlineMedia(event) : event;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });
  res.end();
});

function inlineMedia<T>(value: T): T {
  if (typeof value === "string" && value.startsWith("/media/")) {
    const jpeg = readFileSync(resolvePath(value)).toString("base64");
    return `data:image/jpeg;base64,${jpeg}` as T;
  }
  if (Array.isArray(value)) return value.map(inlineMedia) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, inlineMedia(item)])) as T;
  }
  return value;
}

// Serve the built frontend when present (single-process deploy).
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^(?!\/(api|media)\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, "index.html")));
}

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`precious-frame server listening on http://localhost:${PORT}`);
  });
}

export default app;
