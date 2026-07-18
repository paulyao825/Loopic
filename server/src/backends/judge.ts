import type { Critique } from "../core/loop.js";
import type { EditedImage, Frame } from "../domain/types.js";

/**
 * Vision-model judge for Loop 2. Scores on CONCRETE axes only —
 * structured output, never vague beauty. Implementations: pixel
 * local pixel heuristics or the configured Kimi vision model.
 */
export interface VisionJudge {
  critique(source: Frame, image: EditedImage): Promise<Critique>;
}

/**
 * Wraps an LLM judge with the heuristic judge as a live fallback: the
 * first provider failure (bad key, quota, network) flips the run over to
 * heuristics permanently instead of killing the demo.
 */
export class ResilientJudge implements VisionJudge {
  private failedOver = false;

  constructor(
    private readonly primary: VisionJudge,
    private readonly fallback: VisionJudge,
    private readonly onFallback: (err: unknown) => void,
  ) {}

  async critique(source: Frame, image: EditedImage): Promise<Critique> {
    if (!this.failedOver) {
      try {
        return await this.primary.critique(source, image);
      } catch (err) {
        this.failedOver = true;
        this.onFallback(err);
      }
    }
    return this.fallback.critique(source, image);
  }
}
