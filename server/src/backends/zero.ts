import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { ZeroConfig } from "../appConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

/** One capability from the Zero.xyz catalog. */
export interface ZeroCapability {
  name: string;
  slug: string;
  url: string;
  method: string;
  costUsdc: number;
  pricing: string;
  status: string;
  /** Payment protocol — x402 settles on Base, mpp needs Tempo funds. */
  protocol: string;
  about: string;
}

export interface ZeroDiscovery {
  query: string;
  capability?: ZeroCapability;
  /** Next-best fits, tried in order if the primary's upstream fails. */
  alternates: ZeroCapability[];
  /** Can we actually pay for a call right now? */
  invocable: boolean;
  note: string;
}

/**
 * Thin client around the real @zeroxyz/cli. Capability discovery
 * (`zero search`) is free and needs no account. Paid invocation
 * (`zero fetch`) requires `zero auth login` + a funded USDC wallet and
 * an explicit maxPayUsdc budget in loopic.config.json.
 */
export class ZeroClient {
  private readonly bin: string | undefined;
  private walletOk: boolean | undefined;

  constructor(private readonly cfg: ZeroConfig) {
    const local = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "zero.cmd" : "zero");
    this.bin = existsSync(local) ? local : undefined;
  }

  get available(): boolean {
    return this.cfg.enabled && this.bin !== undefined;
  }

  private run(args: string[], timeoutMs = 30_000): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.bin) return reject(new Error("zero CLI not installed"));
      execFile(this.bin, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(new Error(`zero ${args[0]} failed: ${String(stderr || err.message).slice(0, 400)}`));
        else resolve(String(stdout));
      });
    });
  }

  /** Is a wallet configured on this machine? (login state, not balance) */
  async hasWallet(): Promise<boolean> {
    if (this.walletOk !== undefined) return this.walletOk;
    if (!existsSync(path.join(os.homedir(), ".zero", "config.json"))) {
      this.walletOk = false;
      return false;
    }
    try {
      const out = await this.run(["wallet", "address"], 15_000);
      this.walletOk = /0x[0-9a-fA-F]{40}/.test(out);
    } catch {
      this.walletOk = false;
    }
    return this.walletOk;
  }

  /** Live catalog search — real network call to Zero.xyz. */
  async search(query: string): Promise<ZeroCapability[]> {
    const out = await this.run(["search", query, "--json"], 45_000);
    const parsed = JSON.parse(out) as {
      capabilities?: Array<{
        canonicalName?: string;
        name: string;
        slug: string;
        url: string;
        method: string;
        cost?: { amount?: string };
        pricing?: { summary?: string };
        availabilityStatus?: string;
        protocol?: string;
        whatItDoes?: string;
      }>;
    };
    return (parsed.capabilities ?? []).map((c) => ({
      name: c.canonicalName || c.name,
      slug: c.slug,
      url: c.url,
      method: c.method,
      costUsdc: Number(c.cost?.amount ?? NaN),
      pricing: c.pricing?.summary ?? "unknown",
      status: c.availabilityStatus ?? "unknown",
      protocol: c.protocol ?? "unknown",
      about: c.whatItDoes ?? "",
    }));
  }

  /**
   * Discover the best capability for a query and report honestly whether
   * we can invoke it (wallet + budget) — the UI shows this verbatim.
   */
  async discover(query: string): Promise<ZeroDiscovery> {
    if (!this.available) {
      return {
        query,
        alternates: [],
        invocable: false,
        note: this.cfg.enabled ? "zero CLI not installed" : "zero disabled in config",
      };
    }
    let caps: ZeroCapability[];
    try {
      caps = await this.search(query);
    } catch (err) {
      return { query, alternates: [], invocable: false, note: `zero search failed: ${String(err).slice(0, 160)}` };
    }

    // Search ranking drifts, so verify fit ourselves: must take an image
    // in (not text-to-image) and actually enhance/upscale it. Prefer
    // x402 (settles on Base, where our USDC lives) over mpp (needs a
    // bridge to Tempo), then healthy over unknown.
    const fits = (c: ZeroCapability) =>
      /upscal|enhanc|super.?resolution/i.test(c.about + c.name) && !/text.?to.?image|from (a )?text|prompt/i.test(c.about);
    const affordable = (c: ZeroCapability) => isNaN(c.costUsdc) || c.costUsdc <= this.cfg.maxPayUsdc;
    const rank = (c: ZeroCapability) =>
      (fits(c) ? 0 : 100) + (affordable(c) ? 0 : 50) + (c.protocol === "x402" ? 0 : 10) + (c.status === "healthy" ? 0 : 1);
    const ranked = [...caps].sort((a, b) => rank(a) - rank(b)).filter(fits);
    const capability = ranked[0];
    const alternates = ranked.slice(1, 4).filter(affordable);
    if (!capability) {
      return { query, alternates: [], invocable: false, note: "no image-enhancement capability matched in the Zero catalog" };
    }

    const wallet = await this.hasWallet();
    const budgetOk = this.cfg.maxPayUsdc > 0 && (isNaN(capability.costUsdc) || capability.costUsdc <= this.cfg.maxPayUsdc);
    const invocable = wallet && budgetOk;
    const note = invocable
      ? `ready to invoke (${capability.pricing}, budget $${this.cfg.maxPayUsdc}/call)`
      : !wallet
        ? "discovered via live Zero search — invocation needs `zero auth login` + funded wallet"
        : this.cfg.maxPayUsdc <= 0
          ? "discovered via live Zero search — set zero.maxPayUsdc in loopic.config.json to allow spending"
          : `capability costs ${capability.pricing}, over the $${this.cfg.maxPayUsdc} budget`;
    return { query, capability, alternates, invocable, note };
  }

  /** Paid invocation with an x402/mpp payment handled by the CLI. */
  async invoke(cap: ZeroCapability, body: unknown): Promise<string> {
    return this.run(
      [
        "fetch",
        cap.url,
        "-X",
        cap.method || "POST",
        "-d",
        JSON.stringify(body),
        "--max-pay",
        String(this.cfg.maxPayUsdc),
        "--capability",
        cap.slug,
      ],
      180_000,
    );
  }
}
