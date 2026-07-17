/**
 * Compute layer — Akash integration.
 *
 * Loopic's loops are latency-critical (the reward must return in seconds),
 * so the right way to use decentralized compute is to run the WHOLE agent as
 * an Akash deployment (see deploy/akash.sdl.yaml + Dockerfile), not to ship
 * individual tasks over the wire mid-loop.
 *
 * This runner therefore does two things:
 *  - detects whether the process is running inside an Akash provider (the
 *    provider injects AKASH_* env vars into every deployment container)
 *  - times every named task so the UI can show where compute went.
 */

export interface ComputeTask {
  name: string;
  ms: number;
}

export interface ComputeEnvironment {
  /** "akash" when deployed on an Akash provider, else "local". */
  host: "akash" | "local";
  detail: string;
}

export function detectComputeEnvironment(): ComputeEnvironment {
  // Akash providers inject these into deployment containers.
  const hostname = process.env.AKASH_CLUSTER_PUBLIC_HOSTNAME;
  const owner = process.env.AKASH_OWNER;
  if (hostname || owner) {
    return {
      host: "akash",
      detail: `Akash deployment${hostname ? ` on ${hostname}` : ""}${owner ? ` (owner ${owner.slice(0, 12)}…)` : ""}`,
    };
  }
  return {
    host: "local",
    detail: "local process — deployable to Akash via deploy/akash.sdl.yaml",
  };
}

export interface ComputeRunner {
  readonly env: ComputeEnvironment;
  run<T>(taskName: string, fn: () => Promise<T>): Promise<T>;
}

/** Runs tasks in-process and reports environment + per-task wall time. */
export class InstrumentedComputeRunner implements ComputeRunner {
  readonly env = detectComputeEnvironment();

  constructor(private readonly onTask?: (task: ComputeTask) => void) {}

  async run<T>(taskName: string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      this.onTask?.({ name: taskName, ms: Date.now() - t0 });
    }
  }
}
