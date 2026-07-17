import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RunEvent, FrameInfo, RoundInfo } from "./events.js";
import type { EditorBackend } from "../config.js";
import { loadAppConfig, type AppConfig } from "../appConfig.js";
import { runLoop, type LoopRound } from "../core/loop.js";
import { extractFrames } from "../media/ffmpeg.js";
import { RealFrameScorer } from "../backends/frameScorer.real.js";
import { SharpLocalEditor, ZeroEditor } from "../backends/editor.sharp.js";
import type { Editor } from "../backends/editor.js";
import { ResilientJudge, type VisionJudge } from "../backends/judge.js";
import { HeuristicVisionJudge } from "../backends/judge.heuristic.js";
import { LlmVisionJudge } from "../backends/judge.llm.js";
import { BedrockVisionJudge } from "../backends/judge.bedrock.js";
import { ZeroClient, type ZeroDiscovery } from "../backends/zero.js";
import { InstrumentedComputeRunner } from "../backends/compute.js";
import { S3Publisher } from "../backends/aws.js";
import { makeFrameSelectionLoop, initialSelectionState } from "../loops/frameSelection.js";
import { makeEditRefinementLoop, initialRefineState } from "../loops/editRefinement.js";
import type { EditedImage, Frame } from "../domain/types.js";

export interface RunRequest {
  videoPath: string;
  n: number;
  editorBackend: EditorBackend;
  flourish: boolean;
}

interface RunRecord {
  events: RunEvent[];
  listeners: Set<(e: RunEvent) => void>;
  done: boolean;
}

export class RunManager {
  private readonly runs = new Map<string, RunRecord>();

  constructor(
    private readonly dataDir: string,
    private readonly urlFor: (absPath: string) => string,
    private readonly resolvePath: (url: string) => string,
  ) {}

  get(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  subscribe(runId: string, listener: (e: RunEvent) => void): () => void {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`unknown run ${runId}`);
    for (const e of run.events) listener(e); // replay, then live
    run.listeners.add(listener);
    return () => run.listeners.delete(listener);
  }

  start(req: RunRequest): string {
    const runId = randomUUID().slice(0, 8);
    const record: RunRecord = { events: [], listeners: new Set(), done: false };
    this.runs.set(runId, record);

    const emit = (e: RunEvent) => {
      record.events.push(e);
      for (const l of record.listeners) l(e);
    };

    this.execute(runId, req, emit)
      .catch((err) => emit({ type: "run:error", message: String(err?.message ?? err) }))
      .finally(() => {
        record.done = true;
      });

    return runId;
  }

  private async execute(runId: string, req: RunRequest, emit: (e: RunEvent) => void): Promise<void> {
    const runDir = path.join(this.dataDir, "runs", runId);
    const compute = new InstrumentedComputeRunner((task) => emit({ type: "compute:task", ...task })); // Akash-aware
    const cfg: AppConfig = loadAppConfig(); // re-read per run: config edits apply live

    const judge = this.buildJudge(cfg, emit);
    const zero = new ZeroClient(cfg.zero);
    const s3 = cfg.aws.s3Bucket ? new S3Publisher(cfg.aws) : undefined;

    const editsDir = path.join(runDir, "edits");
    const editor: Editor =
      req.editorBackend === "zero"
        ? new ZeroEditor(editsDir, this.urlFor, zero, s3)
        : new SharpLocalEditor(editsDir, this.urlFor);

    emit({
      type: "run:init",
      runId,
      n: req.n,
      editorBackend: req.editorBackend,
      flourish: req.flourish,
      judge: cfg.judge.provider === "heuristic" ? "heuristic-pixels" : `${cfg.judge.provider}:${cfg.judge.model}`,
      judgeNote: cfg.judge.note,
      bar: cfg.loop.bar,
      compute: compute.env.host,
      computeNote: compute.env.detail,
      awsNote:
        cfg.judge.provider === "bedrock"
          ? `Bedrock judge in ${cfg.aws.region}${cfg.aws.s3Bucket ? ` + S3 image hosting (${cfg.aws.s3Bucket})` : ""}`
          : cfg.aws.s3Bucket
            ? `S3 image hosting (${cfg.aws.s3Bucket}, ${cfg.aws.region})`
            : undefined,
    });

    // ── Zero.xyz discovery (live catalog search, concurrent with extract)
    const flourishDiscovery: Promise<ZeroDiscovery | undefined> =
      req.flourish && zero.available
        ? zero
            .discover(cfg.zero.flourishQuery)
            .then((d) => {
              emit({
                type: "zero:discovery",
                purpose: "flourish",
                query: d.query,
                capability: d.capability
                  ? { name: d.capability.name, slug: d.capability.slug, pricing: d.capability.pricing, status: d.capability.status }
                  : undefined,
                invocable: d.invocable,
                note: d.note,
              });
              return d;
            })
            .catch(() => undefined)
        : Promise.resolve(undefined);

    // ── Extract ─────────────────────────────────────────────────────
    emit({ type: "extract:start" });
    const extracted = await extractFrames(req.videoPath, path.join(runDir, "frames"));
    const frames: Frame[] = extracted.map((f, i) => ({
      id: `frame_${String(i + 1).padStart(3, "0")}`,
      t: f.t,
      uri: f.path,
    }));
    const frameInfos: FrameInfo[] = frames.map((f) => ({ id: f.id, t: f.t, url: this.urlFor(f.uri) }));
    emit({ type: "extract:done", frames: frameInfos });

    // ── Loop 1: frame selection ─────────────────────────────────────
    const scorer = new RealFrameScorer();
    const selection = await compute.run("frame-selection", () =>
      runLoop(makeFrameSelectionLoop(frames, scorer, { bar: 8.2 }), initialSelectionState(req.n), {
        onRound: (r) =>
          emit({ type: "loop1:round", info: toRoundInfo(r), selectedIds: r.candidate.map((f) => f.id) }),
      }),
    );
    emit({
      type: "loop1:done",
      selectedIds: selection.best.map((f) => f.id),
      converged: selection.converged,
      bestScore: selection.bestScore,
    });

    // ── Loop 2: edit refinement per pick ────────────────────────────
    const results: Array<{ frame: Frame; image: EditedImage; score: number }> = [];
    for (const frame of selection.best) {
      emit({ type: "loop2:start", frameId: frame.id });
      const result = await compute.run(`edit-refine-${frame.id}`, () =>
        runLoop(
          makeEditRefinementLoop(frame, editor, judge, { bar: cfg.loop.bar, maxRounds: cfg.loop.maxRounds }),
          initialRefineState(),
          {
          onRound: (r) =>
            emit({
              type: "loop2:round",
              frameId: frame.id,
              info: toRoundInfo(r),
              imageUrl: r.candidate.uri,
              recipe: r.candidate.recipe,
            }),
        }),
      );
      emit({
        type: "loop2:done",
        frameId: frame.id,
        converged: result.converged,
        bestScore: result.bestScore,
        bestUrl: result.best.uri,
        rounds: result.rounds.length,
      });
      results.push({ frame, image: result.best, score: result.bestScore });
    }

    // ── Final flourish: Zero.xyz pro pass on the winner only ────────
    if (results.length === 0) throw new Error("no frames were selected for editing");
    const winner = results.reduce((a, b) => (b.score > a.score ? b : a));
    let flourishUrl: string | undefined;
    if (req.flourish && results.length > 0) {
      emit({ type: "flourish:start", frameId: winner.frame.id });
      const discovery = await flourishDiscovery;
      const zeroEditor = editor instanceof ZeroEditor ? editor : new ZeroEditor(editsDir, this.urlFor, zero, s3);
      const enhanced = await zeroEditor.finalFlourish(winner.image, this.resolvePath(winner.image.uri), discovery);
      flourishUrl = enhanced.image.uri;
      emit({
        type: "flourish:done",
        frameId: winner.frame.id,
        url: enhanced.image.uri,
        via: enhanced.via,
        note: enhanced.note,
      });
    }

    emit({
      type: "run:done",
      results: results.map((r) => ({
        frameId: r.frame.id,
        score: r.score,
        url: r.image.uri,
        flourishUrl: r.frame.id === winner.frame.id ? flourishUrl : undefined,
        backend: r.image.backend,
        winner: r.frame.id === winner.frame.id,
      })),
    });
  }

  private buildJudge(cfg: AppConfig, emit: (e: RunEvent) => void): VisionJudge {
    const heuristic = new HeuristicVisionJudge(this.resolvePath);
    if (cfg.judge.provider === "heuristic") return heuristic;
    const primary: VisionJudge =
      cfg.judge.provider === "bedrock"
        ? new BedrockVisionJudge(this.resolvePath, cfg.aws.region, cfg.judge.model)
        : new LlmVisionJudge(this.resolvePath, cfg.judge);
    return new ResilientJudge(primary, heuristic, (err) =>
      emit({
        type: "judge:fallback",
        message: `${cfg.judge.provider} judge failed (${String(err).slice(0, 180)}) — continuing with pixel heuristics`,
      }),
    );
  }
}

function toRoundInfo(r: LoopRound<unknown>): RoundInfo {
  return {
    round: r.round,
    score: r.score,
    critique: r.critique,
    correction: r.correction,
    cached: r.scoreCached,
    durationMs: r.durationMs,
  };
}
