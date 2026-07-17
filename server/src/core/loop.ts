/**
 * The single Loop abstraction that is the spine of Loopic.
 *
 * A Loop iterates:  act -> observe -> score -> correct
 * until the score clears the bar or the round cap is hit.
 *
 * Both loop instances (frame selection, edit refinement) are just
 * LoopSpecs plugged into runLoop(). The UI consumes LoopRound logs.
 */

/** Per-axis critique. Scores are 0..10. `hint` is an optional structured
 *  correction direction (e.g. "brighten", "shift-left") — never a magnitude. */
export interface AxisCritique {
  score: number;
  reason: string;
  hint?: string;
}

export type Critique = Record<string, AxisCritique>;

export interface ScoreResult {
  /** Overall score 0..10 (mean of axes unless the spec says otherwise). */
  score: number;
  critique: Critique;
}

export interface LoopSpec<S, C, O> {
  name: string;
  /** Overall score needed to stop early. */
  bar: number;
  maxRounds: number;
  /** Stable key for a candidate — used to cache scores (reward in seconds). */
  candidateKey(candidate: C): string;
  /** Produce a candidate from the current state. */
  act(state: S, round: number): Promise<C>;
  /** Gather signal about the candidate (vision judge, set stats, ...). */
  observe(candidate: C): Promise<O>;
  /** Turn candidate + observation into a score and per-axis critique. */
  score(candidate: C, observation: O): Promise<ScoreResult>;
  /**
   * Adjust state based on the critique. Must target the lowest-scoring
   * axis only. Returns the new state and a human-readable note of what
   * changed (shown live in the UI). Set `stop` when no correction can
   * improve the candidate (e.g. flaws baked into the source frame).
   */
  correct(state: S, candidate: C, critique: Critique): Promise<{ state: S; note: string; stop?: boolean }>;
}

/** One fully-logged round — hard rule: log every round for the UI. */
export interface LoopRound<C> {
  round: number;
  candidate: C;
  candidateKey: string;
  score: number;
  critique: Critique;
  /** What correct() decided to change going into the next round (if any). */
  correction?: string;
  scoreCached: boolean;
  durationMs: number;
}

export interface LoopResult<S, C> {
  loopName: string;
  best: C;
  bestScore: number;
  bestCritique: Critique;
  rounds: LoopRound<C>[];
  converged: boolean;
  finalState: S;
}

export interface LoopHooks<C> {
  onRound?(round: LoopRound<C>): void;
}

export function lowestAxis(critique: Critique): [string, AxisCritique] {
  const entries = Object.entries(critique);
  if (entries.length === 0) throw new Error("empty critique");
  return entries.reduce((min, e) => (e[1].score < min[1].score ? e : min));
}

export function meanScore(critique: Critique): number {
  const scores = Object.values(critique).map((a) => a.score);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export async function runLoop<S, C, O>(
  spec: LoopSpec<S, C, O>,
  initialState: S,
  hooks?: LoopHooks<C>,
): Promise<LoopResult<S, C>> {
  const scoreCache = new Map<string, ScoreResult>();
  const rounds: LoopRound<C>[] = [];

  let state = initialState;
  let best: C | undefined;
  let bestScore = -Infinity;
  let bestCritique: Critique = {};
  let converged = false;

  for (let round = 1; round <= spec.maxRounds; round++) {
    const started = Date.now();
    const candidate = await spec.act(state, round);
    const key = spec.candidateKey(candidate);

    let result = scoreCache.get(key);
    const cached = result !== undefined;
    if (!result) {
      const observation = await spec.observe(candidate);
      result = await spec.score(candidate, observation);
      scoreCache.set(key, result);
    }

    const log: LoopRound<C> = {
      round,
      candidate,
      candidateKey: key,
      score: result.score,
      critique: result.critique,
      scoreCached: cached,
      durationMs: Date.now() - started,
    };

    if (result.score > bestScore) {
      best = candidate;
      bestScore = result.score;
      bestCritique = result.critique;
    }

    if (result.score >= spec.bar) {
      converged = true;
      rounds.push(log);
      hooks?.onRound?.(log);
      break;
    }

    let stop = false;
    if (round < spec.maxRounds) {
      const corrected = await spec.correct(state, candidate, result.critique);
      state = corrected.state;
      log.correction = corrected.note;
      stop = corrected.stop ?? false;
    }

    rounds.push(log);
    hooks?.onRound?.(log);
    if (stop) break;
  }

  if (best === undefined) throw new Error(`${spec.name}: no rounds ran`);

  return {
    loopName: spec.name,
    best,
    bestScore,
    bestCritique,
    rounds,
    converged,
    finalState: state,
  };
}
