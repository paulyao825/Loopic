import { Fragment, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { reduceEvent, initialRunState, type RunState, type RunEvent } from "./types";
import { runVideo } from "./api";
import { UploadPanel, type RunOptions } from "./components/UploadPanel";
import { Loop1Panel } from "./components/Loop1Panel";
import { Loop2Card } from "./components/Loop2Card";
import { FinalGallery } from "./components/FinalGallery";
import { InfraPanel } from "./components/InfraPanel";
import { Spinner } from "./components/bits";
import { COPY, type AppCopy, type Language } from "./i18n";

function runReducer(state: RunState, action: RunEvent | { type: "reset" } | { type: "uploading" }): RunState {
  if (action.type === "reset") return initialRunState;
  if (action.type === "uploading") return { ...initialRunState, phase: "uploading" };
  return reduceEvent(state, action);
}

export default function App() {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const [uiError, setUiError] = useState<string>();
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = window.localStorage.getItem("precious-frame-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [language, setLanguage] = useState<Language>(() => {
    const saved = window.localStorage.getItem("precious-frame-language");
    return saved === "zh-Hant" ? "zh-Hant" : "en";
  });
  const unsubscribe = useRef<() => void>(null);
  const text = COPY[language];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("precious-frame-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language === "zh-Hant" ? "zh-Hant" : "en";
    window.localStorage.setItem("precious-frame-language", language);
  }, [language]);

  const launch = useCallback((file: File, opts: RunOptions) => {
    setUiError(undefined);
    unsubscribe.current?.();
    dispatch({ type: "uploading" });
    unsubscribe.current = runVideo(file, opts.n, opts.preference, dispatch, (message) => {
      setUiError(message);
      dispatch({ type: "reset" });
    });
  }, []);

  const busy = !["idle", "done", "error"].includes(state.phase);
  const isLanding = state.phase === "idle" || state.phase === "uploading";
  const frameById = new Map(state.frames.map((f) => [f.id, f]));
  const error = uiError ?? state.error;

  return (
    <div className="page" id="top">
      <header className="topbar">
        <a className="brand" href="/" aria-label={text.homeAria}>
          <span className="brand-word">Precious Frame</span><span className="brand-stop">.</span>
        </a>
        <div className="topbar-right">
          <button
            className="language-toggle"
            type="button"
            aria-label={text.languageAria}
            onClick={() => setLanguage((current) => (current === "en" ? "zh-Hant" : "en"))}
          >
            {text.languageButton}
          </button>
          <button
            className="theme-toggle"
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label={theme === "light" ? text.theme.switchToDark : text.theme.switchToLight}
            onClick={() => setTheme((cur) => (cur === "light" ? "dark" : "light"))}
          >
            <span className="theme-track"><span className="theme-knob" /></span>
            <span>{theme === "light" ? text.theme.dark : text.theme.light}</span>
          </button>
          {state.config && (
            <>
              <span className="judge-chip">{text.labels.vision}: {state.config.selector}</span>
              <span className="judge-chip">{text.labels.judge}: {state.config.judge}</span>
            </>
          )}
          {busy && <Spinner label={text.phase[state.phase as keyof typeof text.phase] ?? state.phase} />}
          {(state.phase === "done" || state.phase === "error") && (
            <button className="btn ghost" onClick={() => dispatch({ type: "reset" })}>
              {text.labels.newRun}
            </button>
          )}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {state.config?.judgeNote && <div className="info-banner">{text.banners.vision}: {state.config.judgeNote}</div>}
      {state.judgeFallback && <div className="info-banner">{state.judgeFallback}</div>}

      {isLanding ? (
        <LandingPage
          busy={state.phase === "uploading"}
          onRunFile={launch}
          copy={text}
        />
      ) : (
        <main className="pipeline">
          <InfraPanel state={state} copy={text} />
          {state.frames.length > 0 && (
            <Loop1Panel
              frames={state.frames}
              rounds={state.loop1Rounds}
              done={state.loop1Done}
              running={state.phase === "loop1"}
              copy={text}
            />
          )}

          {state.loop2Order.length > 0 && (
            <section className="loop2-section">
              <header className="section-head">
                <span className="loop-tag">{text.pipeline.loop2Tag}</span>
                <h2>{text.pipeline.loop2Title}</h2>
                <span className="muted">
                  {text.pipeline.loop2Note} {state.config?.bar ?? 7.5}
                </span>
              </header>
              <div className="loop2-grid">
                {state.loop2Order.map((frameId) => {
                  const loop = state.loop2[frameId];
                  return loop ? (
                    <Loop2Card
                      key={frameId}
                      frame={frameById.get(frameId)}
                      loop={loop}
                      bar={state.config?.bar}
                      copy={text}
                    />
                  ) : null;
                })}
              </div>
            </section>
          )}

          {state.results && (
            <FinalGallery
              results={state.results}
              preference={state.config?.preference ?? "balanced"}
              copy={text}
              onRefined={(result) => dispatch({ type: "result:refined", ...result })}
            />
          )}
        </main>
      )}

      <footer className="footer">
        <div>
          <strong>Precious Frame.</strong>
          <span>{text.footer.assistant}</span>
          <span>
            {text.footer.creator} {" "}
            <a href="https://www.linkedin.com/in/paulyao0825" target="_blank" rel="noreferrer">Paul Yao</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function LandingPage({ busy, onRunFile, copy }: { busy: boolean; onRunFile: (file: File, opts: RunOptions) => void; copy: AppCopy }) {
  const landing = copy.landing;

  return (
    <main className="landing">
      <div className="edition-line">
        <span>{landing.editionPrototype}</span>
        <span>{landing.editionLoop}</span>
        <span>{landing.editionTagline}</span>
      </div>

      <section className="hero">
        <div className="hero-copy fade-in">
          <span className="kicker">{landing.kicker}</span>
          <h1>{landing.title}</h1>
          <p className="hero-slogan">{landing.slogan}</p>
          <p className="hero-dek">{landing.dek}</p>
          <div className="hero-actions">
            <a className="btn primary" href="#upload">{landing.startVideo}</a>
            <a className="btn ghost" href="#how-it-works">{landing.readHow}</a>
          </div>
          <div className="hero-facts" aria-label={landing.capabilitiesAria}>
            {landing.capabilities.map((capability, index) => (
              <div key={capability}><strong>{String(index + 1).padStart(2, "0")}</strong><span>{capability}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="run-section" aria-label={copy.upload.eyebrow}>
        <UploadPanel busy={busy} onRunFile={onRunFile} copy={copy} />
      </section>

      <figure className="editorial-visual">
        <img
          src="/images/precious-frame-contact-sheet.jpg"
          alt={landing.imageAlt}
        />
        <figcaption>
          <span>{landing.imageCaption[0]}</span>
          <span>{landing.imageCaption[1]}</span>
        </figcaption>
      </figure>

      <div className="news-strip" aria-label={landing.newsLabel}>
        <span>{landing.newsLabel}</span>
        <p>{landing.newsCopy}</p>
      </div>

      <section className="story-section problem-section">
        <header className="section-intro">
          <span className="section-number">I.</span>
          <p className="kicker">{landing.problemKicker}</p>
          <h2>{landing.problemTitle}</h2>
        </header>
        <div className="editorial-columns">
          <p className="drop-cap">
            {landing.problemParagraphs[0]}
          </p>
          <p>
            {landing.problemParagraphs[1]}
          </p>
          <blockquote>
            {landing.problemQuote}
          </blockquote>
        </div>
      </section>

      <section className="story-section" id="how-it-works">
        <header className="section-intro split-heading">
          <div>
            <span className="section-number">II.</span>
            <p className="kicker">{landing.methodKicker}</p>
            <h2>{landing.methodTitle}</h2>
          </div>
          <p>
            {landing.methodDescription}
          </p>
        </header>
        <div className="method-grid">
          {landing.methodCards.map((card) => (
            <article key={card.index}>
              <span className="method-index">{card.index}</span>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
        <div className="loop-formula" aria-label={landing.formulaAria}>
          {landing.formula.map((step, index) => (
            <Fragment key={step}><span>{step}</span>{index < landing.formula.length - 1 && <b>→</b>}</Fragment>
          ))}
        </div>
      </section>

      <section className="story-section use-section" id="uses">
        <div className="use-copy">
          <span className="section-number">III.</span>
          <p className="kicker">{landing.usesKicker}</p>
          <h2>{landing.usesTitle}</h2>
          <p>{landing.usesDescription}</p>
        </div>
        <div className="use-list">
          {landing.useItems.map((item, index) => (
            <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong></div>
          ))}
        </div>
      </section>

      <section className="story-section future-section" id="future">
        <header className="section-intro split-heading">
          <div>
            <span className="section-number">IV.</span>
            <p className="kicker">{landing.futureKicker}</p>
            <h2>{landing.futureTitle}</h2>
          </div>
          <p>
            {landing.futureDescription}
          </p>
        </header>
        <div className="future-list">
          {landing.futureItems.map((item) => (
            <article key={item.number}>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="story-section pro-section">
        <div>
          <span className="section-number">V.</span>
          <p className="kicker">{landing.proKicker}</p>
          <h2>{landing.proTitle}</h2>
        </div>
        <div className="pro-copy">
          <p>
            {landing.proDescription}
          </p>
          <ul>
            {landing.proItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section className="closing-section">
        <p className="kicker">{landing.closingKicker}</p>
        <h2>{landing.closingTitle}</h2>
        <div className="hero-actions">
          <a className="btn primary" href="#upload">{landing.uploadVideo}</a>
        </div>
      </section>
    </main>
  );
}
