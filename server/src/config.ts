export type EditorBackend = "local" | "zero";

export interface LoopicConfig {
  /** Which editor backend Loop 2's act() drives. */
  editorBackend: EditorBackend;
  /** Run the final "pro enhancement" flourish on the winning frame via Zero. */
  finalFlourish: boolean;
  /** Every external system is mocked until explicitly wired (mock-first). */
  useMocks: boolean;
  seed: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): LoopicConfig {
  const backend = env.EDITOR_BACKEND === "zero" ? "zero" : "local";
  return {
    editorBackend: backend,
    finalFlourish: env.FINAL_FLOURISH !== "0",
    useMocks: env.USE_MOCKS !== "0", // no real SDK is wired yet; keep true
    seed: env.SEED ? Number(env.SEED) : 1337,
  };
}
