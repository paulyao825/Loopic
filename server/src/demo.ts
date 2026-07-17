/**
 * Step-1 demo: full Loopic pipeline on mocks.
 *   Loop 1 re-ranks frames until the set is strong AND varied.
 *   Loop 2 refines each pick (crop + exposure) until the judge is happy.
 *   Winning frame gets the Zero.xyz final flourish (mock).
 *
 *   npm run demo            # local editor in the loop (default)
 *   EDITOR_BACKEND=zero npm run demo
 */
import { loadConfig } from "./config.js";
import { runLoop, type Critique, type LoopRound } from "./core/loop.js";
import { MockWorld } from "./mock/world.js";
import { MockFrameExtractor } from "./backends/extractor.js";
import { MockFrameScorer } from "./backends/frameScorer.js";
import { createEditor, MockZeroEditor } from "./backends/editor.js";
import { MockVisionJudge } from "./backends/judge.js";
import { MockDataStore } from "./backends/stubs.js";
import { InstrumentedComputeRunner } from "./backends/compute.js";
import { makeFrameSelectionLoop, initialSelectionState } from "./loops/frameSelection.js";
import { makeEditRefinementLoop, initialRefineState } from "./loops/editRefinement.js";
import type { EditedImage, Frame } from "./domain/types.js";

const N = Number(process.env.N ?? 3);

function bar(score: number): string {
  const filled = Math.round(score);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function fmtCritique(c: Critique): string {
  return Object.entries(c)
    .map(([axis, a]) => `${axis} ${a.score.toFixed(1)} "${a.reason}"`)
    .join("  ·  ");
}

function printRound(r: LoopRound<unknown>): void {
  const cached = r.scoreCached ? " (cached)" : "";
  console.log(`  round ${r.round}  ${bar(r.score)}  ${r.score.toFixed(1)}${cached}`);
  console.log(`          ${fmtCritique(r.critique)}`);
  if (r.correction) console.log(`          ↳ correct: ${r.correction}`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const world = MockWorld.generate(config.seed);

  // Every external system behind an interface, mocks active (mock-first).
  const extractor = new MockFrameExtractor(world);
  const scorer = new MockFrameScorer(world);
  const editor = createEditor(config.editorBackend);
  const judge = new MockVisionJudge(world);
  const compute = new InstrumentedComputeRunner(); // Akash-aware compute layer
  const store = new MockDataStore(); //       Nexla slot

  console.log("═".repeat(72));
  console.log(`LOOPIC / mock demo / editor backend: ${config.editorBackend.toUpperCase()} (mock)`);
  console.log("═".repeat(72));

  const frames = await extractor.extract("mock://upload/video.mp4");
  console.log(`\nExtracted ${frames.length} frames. Selecting best N=${N}…\n`);

  // ── Loop 1: frame selection ─────────────────────────────────────────
  console.log(`LOOP 1 · frame-selection  (bar 8.5)`);
  const selection = await compute.run("frame-selection", () =>
    runLoop(makeFrameSelectionLoop(frames, scorer), initialSelectionState(N), {
      onRound: (r) => {
        printRound(r);
        void store.put("loop1-rounds", `round-${r.round}`, r);
      },
    }),
  );
  console.log(
    `  ${selection.converged ? "✓ converged" : "✗ round cap hit"} at ${selection.bestScore.toFixed(1)} — picked: ${selection.best
      .map((f) => f.id)
      .join(", ")}\n`,
  );

  // ── Loop 2: edit refinement per selected frame ──────────────────────
  const finished: Array<{ frame: Frame; image: EditedImage; score: number }> = [];
  for (const frame of selection.best) {
    console.log(`LOOP 2 · edit-refine · ${frame.id} · backend=${editor.backend} (bar 8.5)`);
    const t0 = Date.now();
    const result = await compute.run(`edit-refine-${frame.id}`, () =>
      runLoop(makeEditRefinementLoop(frame, editor, judge), initialRefineState(), {
        onRound: (r) => {
          printRound(r);
          void store.put(`loop2-rounds-${frame.id}`, `round-${r.round}`, r);
        },
      }),
    );
    const first = result.rounds[0]!;
    console.log(
      `  ${result.converged ? "✓ converged" : "✗ round cap hit"}: ${first.score.toFixed(1)} → ${result.bestScore.toFixed(1)} in ${result.rounds.length} rounds (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`,
    );
    finished.push({ frame, image: result.best, score: result.bestScore });
  }

  // ── Final flourish: Zero.xyz pro pass on the winning frame only ─────
  const winner = finished.reduce((a, b) => (b.score > a.score ? b : a));
  if (config.finalFlourish) {
    const zero = new MockZeroEditor();
    const enhanced = await zero.finalFlourish(winner.image);
    console.log(`FINAL FLOURISH · Zero.xyz (mock) on winner ${winner.frame.id}`);
    console.log(`  ${winner.image.uri}`);
    console.log(`  → ${enhanced.uri}\n`);
  }

  console.log("═".repeat(72));
  console.log("FINISHED SET");
  for (const f of finished) {
    const w = f.frame.id === winner.frame.id ? "  ★ winner" : "";
    console.log(
      `  ${f.frame.id}  score ${f.score.toFixed(1)}  ev ${f.image.recipe.exposureEv >= 0 ? "+" : ""}${f.image.recipe.exposureEv}  crop ${f.image.recipe.crop.w}x${f.image.recipe.crop.h}@(${f.image.recipe.crop.x},${f.image.recipe.crop.y})  [${f.image.backend}]${w}`,
    );
  }
  const loggedRounds = (await store.list("loop1-rounds")).length;
  console.log(`\nRound logs persisted to data layer (mock Nexla): loop1=${loggedRounds} rounds + per-frame loop2 logs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
