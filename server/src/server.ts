import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import multer from "multer";
import { RunManager } from "./api/orchestrator.js";
import { generateSampleVideo } from "./media/ffmpeg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = process.env.VERCEL ? "/tmp/loopic-data" : path.resolve(__dirname, "../data");
const DATA_DIR = path.resolve(process.env.LOOPIC_DATA_DIR ?? DEFAULT_DATA_DIR);
const WEB_DIST = path.resolve(__dirname, "../../web/dist");
const PORT = Number(process.env.PORT ?? 4000);

const urlFor = (absPath: string) => "/media/" + path.relative(DATA_DIR, absPath).split(path.sep).join("/");
const resolvePath = (url: string) => path.join(DATA_DIR, url.replace(/^\/media\//, ""));
const safeVideoPath = (videoId: unknown): string | undefined => {
  if (typeof videoId !== "string" || !/^[\w.-]+$/.test(videoId)) return undefined;
  return path.join(DATA_DIR, "uploads", videoId);
};

const runs = new RunManager(DATA_DIR, urlFor, resolvePath);

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      const dir = path.join(DATA_DIR, "uploads");
      await mkdir(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${randomUUID().slice(0, 8)}${path.extname(file.originalname) || ".mp4"}`),
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
});

export const app = express();
app.use(cors());
app.use(express.json());
app.use("/media", express.static(DATA_DIR, { maxAge: "1y", immutable: true }));

app.post("/api/upload", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no video file" });
  res.json({ videoId: req.file.filename });
});

app.post("/api/sample", async (_req, res) => {
  try {
    const videoId = "sample.mp4";
    const out = path.join(DATA_DIR, "uploads", videoId);
    if (!existsSync(out)) await generateSampleVideo(out);
    res.json({ videoId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/run", (req, res) => {
  const { videoId, n = 3, editorBackend = "local", flourish = true } = req.body ?? {};
  const videoPath = safeVideoPath(videoId);
  if (!videoPath || !existsSync(videoPath)) return res.status(400).json({ error: "unknown videoId" });
  const runId = runs.start({
    videoPath,
    n: Math.max(1, Math.min(8, Number(n))),
    editorBackend: editorBackend === "zero" ? "zero" : "local",
    flourish: Boolean(flourish),
  });
  res.json({ runId });
});

app.get("/api/runs/:id/events", (req, res) => {
  const runId = req.params.id;
  if (!runs.get(runId)) return res.status(404).json({ error: "unknown run" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const unsubscribe = runs.subscribe(runId, (e) => {
    res.write(`data: ${JSON.stringify(e)}\n\n`);
    if (e.type === "run:done" || e.type === "run:error") res.end();
  });
  req.on("close", unsubscribe);
});

// Serve the built frontend when present (single-process deploy).
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^(?!\/(api|media)\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, "index.html")));
}

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`loopic server listening on http://localhost:${PORT}`);
  });
}

export default app;
