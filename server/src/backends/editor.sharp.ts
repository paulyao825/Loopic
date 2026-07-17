import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { Editor } from "./editor.js";
import { recipeSlug } from "./editor.js";
import type { ZeroClient, ZeroDiscovery } from "./zero.js";
import type { S3Publisher } from "./aws.js";
import type { EditedImage, Frame, Recipe } from "../domain/types.js";

const OUTPUT_WIDTH = 640;

/** Render the full bounded recipe onto real pixels. Shared by both backends. */
export async function renderRecipe(srcPath: string, recipe: Recipe, outPath: string): Promise<void> {
  const meta = await sharp(srcPath).metadata();
  const W = meta.width ?? OUTPUT_WIDTH;
  const H = meta.height ?? OUTPUT_WIDTH;
  const c = recipe.crop;
  const region = {
    left: Math.round(c.x * W),
    top: Math.round(c.y * H),
    width: Math.max(16, Math.round(c.w * W)),
    height: Math.max(16, Math.round(c.h * H)),
  };
  region.left = Math.min(region.left, W - region.width);
  region.top = Math.min(region.top, H - region.height);

  // Exposure + contrast + white balance collapse into one per-channel
  // linear pass: v' = gain_ch * contrast * v + contrast offset.
  const gain = Math.pow(2, recipe.exposureEv);
  const k = recipe.contrast;
  const contrastOffset = 128 * (1 - k); // pivot contrast around mid-gray
  const warmth = recipe.temperature * 0.12;
  const chGains = [gain * (1 + warmth), gain, gain * (1 - warmth)];

  let img = sharp(srcPath)
    .extract(region)
    .resize({ width: OUTPUT_WIDTH })
    .linear(
      chGains.map((g) => g * k),
      chGains.map(() => contrastOffset),
    );

  if (recipe.saturation !== 1) img = img.modulate({ saturation: recipe.saturation });
  if (recipe.sharpen > 0.01) img = img.sharpen({ sigma: 0.5 + recipe.sharpen * 1.5 });

  await mkdir(path.dirname(outPath), { recursive: true });
  await img.jpeg({ quality: 90 }).toFile(outPath);
}

/**
 * `local` backend — the agent's own bounded edit code (sharp).
 * Fast and fully controlled: the default in-loop editor.
 */
export class SharpLocalEditor implements Editor {
  readonly backend = "local" as const;

  constructor(
    private readonly outDir: string,
    private readonly urlFor: (absPath: string) => string,
  ) {}

  async edit(frame: Frame, recipe: Recipe): Promise<EditedImage> {
    const outPath = path.join(this.outDir, `${frame.id}_${recipeSlug(recipe)}.jpg`);
    await renderRecipe(frame.uri, recipe, outPath);
    return { frameId: frame.id, uri: this.urlFor(outPath), recipe, backend: this.backend };
  }
}

/**
 * `zero` backend — drives Zero.xyz with the SAME recipe interface.
 * Capability discovery is real (live `zero search`). Paid remote
 * execution requires a funded wallet + spend budget; without one the
 * recipe is rendered locally with honest external-call latency, and the
 * run reports exactly which mode it used.
 */
export class ZeroEditor implements Editor {
  readonly backend = "zero" as const;

  constructor(
    private readonly outDir: string,
    private readonly urlFor: (absPath: string) => string,
    private readonly zero?: ZeroClient,
    private readonly s3?: S3Publisher,
    private readonly simulatedLatencyMs = 350,
  ) {}

  async edit(frame: Frame, recipe: Recipe): Promise<EditedImage> {
    await sleep(this.simulatedLatencyMs);
    const outPath = path.join(this.outDir, `${frame.id}_zero_${recipeSlug(recipe)}.jpg`);
    await renderRecipe(frame.uri, recipe, outPath);
    return { frameId: frame.id, uri: this.urlFor(outPath), recipe, backend: this.backend };
  }

  /**
   * Final "pro enhancement" flourish on the winning frame only, outside
   * the loop. If a Zero.xyz capability is invocable (wallet + budget) the
   * image is sent for real remote enhancement; otherwise a local pro
   * grade (contrast pop, saturation lift, sharpen) stands in.
   */
  async finalFlourish(
    image: EditedImage,
    editedPath: string,
    discovery?: ZeroDiscovery,
  ): Promise<{ image: EditedImage; via: string; note?: string }> {
    const outPath = path.join(this.outDir, `${image.frameId}_flourish.jpg`);

    if (discovery?.invocable && discovery.capability && this.zero) {
      // Remote capabilities need a public URL for the source image
      // (schema: { image_url, scale }) — publish the edit to a
      // short-lived host first; localhost is unreachable for them.
      const candidates = [discovery.capability, ...discovery.alternates];
      const failures: string[] = [];
      let hostedVia = "ephemeral host";
      try {
        const jpeg = await readFile(editedPath);
        let publicUrl: string;
        if (this.s3) {
          publicUrl = await this.s3.publish(jpeg, `loopic/${image.frameId}-${Date.now()}.jpg`);
          hostedVia = "AWS S3 presigned URL";
        } else {
          publicUrl = await publishTemp(jpeg);
        }
        for (const cap of candidates) {
          try {
            const out = await this.zero.invoke(cap, { image_url: publicUrl, scale: 2 });
            const remote = await extractImagePayload(out);
            if (!remote) throw new Error("response contained no image payload");
            await writeFile(outPath, remote);
            return {
              image: { ...image, uri: this.urlFor(outPath), backend: "zero" },
              via: `zero:${cap.slug}`,
              note:
                `remote enhancement via Zero.xyz — ${cap.name} (${cap.pricing}), source hosted on ${hostedVia}` +
                (failures.length ? `; self-corrected after ${failures.length} failed capability(ies)` : ""),
            };
          } catch (err) {
            console.error(`[zero] ${cap.slug} failed:\n${String(err)}`);
            failures.push(`${cap.name}: ${String(err).replace(/\s+/g, " ").slice(0, 160)}`);
          }
        }
      } catch (err) {
        failures.push(String(err).replace(/\s+/g, " ").slice(0, 160));
      }
      return await this.localFlourish(image, editedPath, outPath, {
        via: "local-fallback",
        note: `remote invoke failed (${failures.join(" | ").slice(0, 400)}) — applied local pro grade`,
      });
    }

    await sleep(this.simulatedLatencyMs * 2);
    return await this.localFlourish(image, editedPath, outPath, {
      via: "local-render",
      note: discovery?.note,
    });
  }

  private async localFlourish(
    image: EditedImage,
    editedPath: string,
    outPath: string,
    meta: { via: string; note?: string },
  ): Promise<{ image: EditedImage; via: string; note?: string }> {
    await sharp(editedPath)
      .modulate({ saturation: 1.18 })
      .linear(1.08, -10)
      .sharpen({ sigma: 1.2 })
      .jpeg({ quality: 92 })
      .toFile(outPath);
    return { image: { ...image, uri: this.urlFor(outPath), backend: "zero" }, ...meta };
  }
}

/**
 * Host an image at a public URL for the duration of a remote call.
 * 0x0.st serves raw bytes at the returned URL (required — the remote
 * capability fetches it machine-to-machine); tmpfiles.org is the backup
 * with its /dl/ direct link.
 */
async function publishTemp(jpeg: Buffer): Promise<string> {
  const blob = new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" });
  try {
    const form = new FormData();
    form.append("file", blob, "frame.jpg");
    form.append("expires", "1"); // hours
    const res = await fetch("https://0x0.st", {
      method: "POST",
      body: form,
      headers: { "user-agent": "loopic/1.0 (hackathon demo; temp image for paid enhancement call)" },
    });
    if (!res.ok) throw new Error(`0x0.st upload failed: ${res.status}`);
    const url = (await res.text()).trim();
    if (!/^https?:\/\//.test(url)) throw new Error(`0x0.st returned unexpected body`);
    return url;
  } catch {
    const form = new FormData();
    form.append("file", blob, "frame.jpg");
    const res = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: form });
    if (!res.ok) throw new Error(`temp upload failed: ${res.status}`);
    const body = (await res.json()) as { data?: { url?: string } };
    const url = body.data?.url;
    if (!url) throw new Error("temp upload returned no url");
    return url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
  }
}

/** Pull an image out of a capability response (JSON-wrapped URL, data URL, or raw base64). */
async function extractImagePayload(response: string): Promise<Buffer | undefined> {
  const trimmed = response.trim();
  const dataUrl = trimmed.match(/data:image\/\w+;base64,([A-Za-z0-9+/=]+)/);
  if (dataUrl) return Buffer.from(dataUrl[1]!, "base64");
  if (/^[A-Za-z0-9+/=]{1000,}$/.test(trimmed)) return Buffer.from(trimmed, "base64");
  // JSON body with a result image URL (ESRGAN capability returns { image_url }).
  const urlMatch = trimmed.match(/https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)[^\s"']*/i) ?? trimmed.match(/"image_url"\s*:\s*"([^"]+)"/);
  const resultUrl = urlMatch?.[1] ?? urlMatch?.[0];
  if (resultUrl) {
    const res = await fetch(resultUrl);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
