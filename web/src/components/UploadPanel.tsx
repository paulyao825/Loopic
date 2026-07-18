import { useRef, useState } from "react";
import type { PhotoPreference } from "../types";

export interface RunOptions {
  n: number;
  preference: PhotoPreference;
}

const PREFERENCES: Array<{ value: PhotoPreference; label: string; description: string }> = [
  { value: "balanced", label: "Balanced", description: "A strong all-purpose mix of moment, story, craft, and composition." },
  { value: "people-emotion", label: "People & emotion", description: "Expressions, connection, gestures, and moments that cannot be recreated." },
  { value: "competition", label: "Competition", description: "Professional impact, deliberate framing, controlled light, and finish." },
  { value: "action-energy", label: "Action & energy", description: "Decisive movement, expressive body position, and readable energy." },
  { value: "scenic-composed", label: "Scenic & composed", description: "Light, depth, geometry, atmosphere, and environmental storytelling." },
];

export function UploadPanel({
  busy,
  onRunFile,
}: {
  busy: boolean;
  onRunFile: (file: File, opts: RunOptions) => void;
}) {
  const [n, setN] = useState(3);
  const [preference, setPreference] = useState<PhotoPreference>("balanced");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const opts: RunOptions = { n, preference };

  return (
    <section className="card upload-panel fade-in" id="upload">
      <header className="upload-head">
        <span className="eyebrow">Start a run</span>
        <h2>Upload your video</h2>
        <p className="muted">Precious Frame works best with short reels, clips, and highlight videos.</p>
      </header>

      <div
        className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) setFile(f);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <p>
            <strong>{file.name}</strong> <span className="muted">({(file.size / 1e6).toFixed(1)} MB)</span>
          </p>
        ) : (
          <p>
            Drop a video here or <span className="link">browse</span>
          </p>
        )}
      </div>

      <div className="controls">
        <fieldset className="preference-control">
          <legend className="control-label">What should make a frame stand out?</legend>
          <div className="preference-grid">
            {PREFERENCES.map((option) => (
              <label className={`preference-option ${preference === option.value ? "selected" : ""}`} key={option.value}>
                <input
                  type="radio"
                  name="photo-preference"
                  value={option.value}
                  checked={preference === option.value}
                  onChange={() => setPreference(option.value)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="control">
          <span className="control-label">
            best shots <strong className="mono">N = {n}</strong>
          </span>
          <input type="range" min={1} max={6} value={n} onChange={(e) => setN(Number(e.target.value))} />
        </label>

        <p className="muted">Frames are judged by Kimi Vision and refined locally with Sharp.</p>
      </div>

      <div className="actions">
        <button className="btn primary" disabled={!file || busy} onClick={() => file && onRunFile(file, opts)}>
          {busy ? "working…" : "Run the loops"}
        </button>
      </div>
    </section>
  );
}
