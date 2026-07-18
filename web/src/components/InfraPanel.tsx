import type { RunState } from "../types";

export function InfraPanel({ state }: { state: RunState }) {
  const cfg = state.config;
  if (!cfg) return null;

  const usesVisionApi = cfg.selector.startsWith("Kimi:");
  return (
    <section className="card infra-panel fade-in">
      <header className="card-head">
        <div>
          <span className="loop-tag">STACK</span>
          <h2>Processing stack</h2>
        </div>
      </header>

      <div className="infra-row">
        <div className="infra-label">
          Frame intelligence
          <span className={`pill ${usesVisionApi ? "pass" : "close"}`}>
            {usesVisionApi ? "vision AI" : "local fallback"}
          </span>
        </div>
        <div className="infra-note muted">{cfg.selector}</div>
      </div>

      <div className="infra-row">
        <div className="infra-label">Photo preference<span className="pill pass">selected</span></div>
        <div className="infra-note muted">{cfg.preferenceLabel}</div>
      </div>

      <div className="infra-row">
        <div className="infra-label">Video and image processing<span className="pill pass">local</span></div>
        <div className="infra-note muted">The browser extracts real frames; Sharp applies crop, color, and detail edits.</div>
      </div>

      <div className="infra-row">
        <div className="infra-label">Application API<span className="pill pass">standard</span></div>
        <div className="infra-note muted">Express processes frames and streams the complete run over one SSE request.</div>
      </div>
    </section>
  );
}
