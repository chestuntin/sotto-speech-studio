import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AudioWaveform, Check, ChevronDown, CircleHelp, CircleOff, Copy, Download, FileText,
  Grid3X3, History, LoaderCircle, Mic, Mic2, Moon, Plus, Radio, ShieldCheck, Sparkles, Sun, X,
} from "lucide-react";
import { Waveform } from "./components/Waveform";
import { useRealtimeRecorder } from "./hooks/useRealtimeRecorder";
import { download, formatTime, loadSessions, type Session } from "./lib/storage";

const DEFAULT_TITLE = "නව හඬ සටහන";
type BackgroundMode = "none" | "matrix" | "grid";
const BACKGROUND_MODES: BackgroundMode[] = ["none", "matrix", "grid"];
const BACKGROUND_LABELS: Record<BackgroundMode, string> = {
  none: "අක්‍රීය",
  matrix: "සිංහල අකුරු",
  grid: "සංඥා ජාලය",
};
const isShiftKey = (code: string) => code === "ShiftLeft" || code === "ShiftRight";
const SINHALA_ALPHABET = [
  "අ", "ආ", "ඇ", "ඈ", "ඉ", "ඊ", "උ", "ඌ", "ඍ", "ඎ", "ඏ", "ඐ", "එ", "ඒ", "ඓ", "ඔ", "ඕ", "ඖ",
  "ක", "ඛ", "ග", "ඝ", "ඞ", "ඟ", "ච", "ඡ", "ජ", "ඣ", "ඤ", "ඥ", "ඦ", "ට", "ඨ", "ඩ", "ඪ", "ණ", "ඬ",
  "ත", "ථ", "ද", "ධ", "න", "ඳ", "ප", "ඵ", "බ", "භ", "ම", "ඹ", "ය", "ර", "ල", "ව", "ශ", "ෂ", "ස", "හ", "ළ", "ෆ",
] as const;
const SIGNAL_POSITIONS = [4, 15, 27, 39, 50, 61, 73, 85, 96] as const;
const SIGNAL_COLUMNS = (["left", "right"] as const).flatMap((side, sideIndex) =>
  SIGNAL_POSITIONS.map((x, columnIndex) => ({
    side,
    x,
    duration: 17 + ((columnIndex * 7 + sideIndex * 5) % 28),
    delay: -(4 + ((columnIndex * 7 + sideIndex * 11) % 28)),
    sway: -8 + ((columnIndex * 5 + sideIndex * 9) % 17),
    glyphs: Array.from({ length: 14 }, (_, glyphIndex) =>
      SINHALA_ALPHABET[(columnIndex + glyphIndex * SIGNAL_POSITIONS.length + sideIndex * 5) % SINHALA_ALPHABET.length],
    ),
  })),
);

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return localStorage.getItem("sotto-theme") === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() => {
    try {
      const stored = localStorage.getItem("sotto-background-mode");
      return stored === "matrix" || stored === "grid" ? stored : "none";
    } catch { return "none"; }
  });
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    try { return localStorage.getItem("sotto-onboarding-complete") !== "true"; }
    catch { return true; }
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [language, setLanguage] = useState<"si" | "en">(() => {
    try { return localStorage.getItem("sotto-transcription-language") === "en" ? "en" : "si"; }
    catch { return "si"; }
  });
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [text, setText] = useState("");
  const [duration, setDuration] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sessions, setSessions] = useState<Session[]>(loadSessions);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const holdRequested = useRef(false);
  const textArea = useRef<HTMLTextAreaElement>(null);

  const notify = useCallback((message: string) => setToast(message), []);
  const saveSession = useCallback((session: Session) => {
    setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)].slice(0, 30));
    setSessionId(session.id);
    setSaved(true);
  }, []);

  const finishTranscript = useCallback((result: string, length: number) => {
    setError("");
    setDuration(length);
    setProcessing(false);
    if (!result.trim()) {
      setText("");
      setError("කථාවක් හඳුනාගත නොහැකි විය. මයික්‍රොෆෝනයට සමීපව නැවත උත්සාහ කරන්න.");
      return;
    }
    const noteTitle = title === DEFAULT_TITLE ? `හඬ සටහන ${sessions.length + 1}` : title;
    setTitle(noteTitle);
    setText(result);
    saveSession({ id: crypto.randomUUID(), title: noteTitle, text: result, duration: length, created: Date.now(), model: "gpt-transcribe" });
    notify("පිටපත සූදානම්");
  }, [notify, saveSession, sessions.length, title]);

  const recorder = useRealtimeRecorder(
    finishTranscript,
    (message) => { setProcessing(false); setError(message); },
    () => setProcessing(true),
    (partial) => setText(partial),
    language,
  );
  const recording = recorder.status === "recording" || recorder.status === "paused";
  const requesting = recorder.status === "requesting";
  const busy = recording || requesting || processing;
  const visibleTime = recording ? recorder.seconds : duration;

  const cycleBackground = useCallback(() => {
    setBackgroundMode((current) => BACKGROUND_MODES[(BACKGROUND_MODES.indexOf(current) + 1) % BACKGROUND_MODES.length]);
  }, []);

  const persistCurrentNote = useCallback(() => {
    if (!saved || !sessionId) return;
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, title, text } : session));
  }, [saved, sessionId, text, title]);

  const newNote = useCallback(() => {
    if (busy) return;
    persistCurrentNote();
    setTitle(DEFAULT_TITLE);
    setText("");
    setDuration(0);
    setSessionId(null);
    setSaved(false);
    setError("");
    setHistoryOpen(false);
    requestAnimationFrame(() => textArea.current?.focus());
  }, [busy, persistCurrentNote]);

  const startRecording = useCallback(async () => {
    if (busy || onboardingOpen) return;
    newNote();
    setText("");
    await recorder.start();
  }, [busy, newNote, onboardingOpen, recorder]);

  const toggleRecording = useCallback(() => {
    if (processing) { recorder.cancel(); setProcessing(false); return; }
    if (recording) recorder.stop();
    else void startRecording();
  }, [processing, recorder, recording, startRecording]);

  const openSession = useCallback((session: Session) => {
    if (busy) return;
    persistCurrentNote();
    setTitle(session.title);
    setText(session.text);
    setDuration(session.duration);
    setSessionId(session.id);
    setSaved(true);
    setError("");
    setHistoryOpen(false);
  }, [busy, persistCurrentNote]);

  async function copyTranscript() {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); notify("පිටපත් කරන ලදී"); }
    catch { textArea.current?.focus(); textArea.current?.select(); notify("පෙළ තෝරා අතින් පිටපත් කරන්න"); }
  }

  function exportTranscript() {
    if (!text) return;
    const filename = `${title.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().slice(0, 80) || "sinhala-transcript"}.txt`;
    download(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
    notify("පිටපත බාගත කරන ලදී");
  }

  async function finishOnboarding() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      localStorage.setItem("sotto-onboarding-complete", "true");
      setOnboardingOpen(false);
      notify("මයික්‍රොෆෝනය සූදානම්");
    } catch { setError("මයික්‍රොෆෝන අවසරය ලබා දී නැත. බ්‍රවුසරයේ Allow තෝරා නැවත උත්සාහ කරන්න."); }
  }

  function skipOnboarding() {
    try { localStorage.setItem("sotto-onboarding-complete", "true"); } catch { /* Continue without persistence. */ }
    setOnboardingOpen(false);
  }

  useEffect(() => {
    try { localStorage.setItem("sotto-sessions", JSON.stringify(sessions)); }
    catch { setSaved(false); }
  }, [sessions]);
  useEffect(() => {
    if (!saved || !sessionId || processing) return;
    const timer = window.setTimeout(persistCurrentNote, 400);
    return () => window.clearTimeout(timer);
  }, [processing, saved, sessionId, text, title, persistCurrentNote]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    try { localStorage.setItem("sotto-transcription-language", language); } catch { /* Continue without persistence. */ }
  }, [language]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("sotto-theme", theme); } catch { /* Continue without persistence. */ }
  }, [theme]);
  useEffect(() => {
    try { localStorage.setItem("sotto-background-mode", backgroundMode); } catch { /* Continue without persistence. */ }
  }, [backgroundMode]);
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (!isShiftKey(event.code) || event.repeat || busy || onboardingOpen) return;
      event.preventDefault();
      holdRequested.current = true;
      void startRecording();
    };
    const keyUp = (event: KeyboardEvent) => {
      if (!isShiftKey(event.code) || !holdRequested.current) return;
      event.preventDefault();
      holdRequested.current = false;
      if (recorder.status === "recording") recorder.stop();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); };
  }, [busy, onboardingOpen, recorder, startRecording]);

  const words = useMemo(() => text.trim() ? text.trim().split(/\s+/).length : 0, [text]);
  const statusLabel = recording ? "පටිගත වෙමින්" : requesting ? "අවසරය ඉල්ලමින්" : processing ? "පිටපත් කරමින්" : "සූදානම්";
  const prompt = recording ? "මම අසා සිටිමි…" : processing ? "වචන සකසමින්…" : "කතා කිරීම අරඹන්න";
  const helper = recording ? "නවත්වන්න මයික්‍රොෆෝනය තට්ටු කරන්න" : "මයික්‍රොෆෝනය තට්ටු කරන්න හෝ Right Shift අල්ලාගෙන සිටින්න";
  const nextBackground = BACKGROUND_MODES[(BACKGROUND_MODES.indexOf(backgroundMode) + 1) % BACKGROUND_MODES.length];

  return (
    <>
      <div className={`ambient-signal mode-${backgroundMode}`} aria-hidden="true">
        {backgroundMode === "matrix" && <>
          <div className="signal-glow" />
          <div className="signal-field signal-left">
          {SIGNAL_COLUMNS.filter((column) => column.side === "left").map((column, columnIndex) => (
            <span
              className="signal-column"
              key={`${column.side}-${column.x}`}
              style={{ "--signal-x": `${column.x}%`, "--signal-duration": `${column.duration}s`, "--signal-delay": `${column.delay}s`, "--signal-sway": `${column.sway}px`, "--signal-sway-back": `${column.sway * -.45}px` } as React.CSSProperties}
            >
              {column.glyphs.map((glyph, glyphIndex) => (
                <i
                  className={(glyphIndex + columnIndex) % 7 === 0 ? "accent" : ""}
                  data-glyph={glyph}
                  data-next={SINHALA_ALPHABET[(columnIndex * 11 + glyphIndex * 7 + 13) % SINHALA_ALPHABET.length]}
                  key={`${glyph}-${glyphIndex}`}
                  style={{ "--glyph-delay": `${-((glyphIndex * 1.7 + columnIndex * .9) % 13)}s`, "--glyph-duration": `${5 + ((glyphIndex + columnIndex * 2) % 8)}s`, "--glyph-opacity": `${.22 + ((glyphIndex * 3 + columnIndex) % 6) * .09}` } as React.CSSProperties}
                ><span>{glyph}</span></i>
              ))}
            </span>
          ))}
          </div>
          <div className="signal-field signal-right">
          {SIGNAL_COLUMNS.filter((column) => column.side === "right").map((column, columnIndex) => (
            <span
              className="signal-column"
              key={`${column.side}-${column.x}`}
              style={{ "--signal-x": `${column.x}%`, "--signal-duration": `${column.duration}s`, "--signal-delay": `${column.delay}s`, "--signal-sway": `${column.sway}px`, "--signal-sway-back": `${column.sway * -.45}px` } as React.CSSProperties}
            >
              {column.glyphs.map((glyph, glyphIndex) => (
                <i
                  className={(glyphIndex + columnIndex + 3) % 8 === 0 ? "accent" : ""}
                  data-glyph={glyph}
                  data-next={SINHALA_ALPHABET[(columnIndex * 13 + glyphIndex * 5 + 29) % SINHALA_ALPHABET.length]}
                  key={`${glyph}-${glyphIndex}`}
                  style={{ "--glyph-delay": `${-((glyphIndex * 1.3 + columnIndex * 1.1) % 15)}s`, "--glyph-duration": `${6 + ((glyphIndex * 2 + columnIndex) % 9)}s`, "--glyph-opacity": `${.2 + ((glyphIndex * 5 + columnIndex) % 7) * .08}` } as React.CSSProperties}
                ><span>{glyph}</span></i>
              ))}
            </span>
          ))}
          </div>
        </>}
        {backgroundMode === "grid" && <div className="signal-grid" />}
      </div>
      <div className={`hela-app ${recording ? "is-recording" : ""}`}>
      <aside className="app-sidebar" aria-label="ප්‍රධාන මෙනුව">
        <button className="brand" onClick={newNote} aria-label="නව හඬ සටහනක්">
          <span className="brand-mark"><AudioWaveform aria-hidden="true" /></span>
          <span className="brand-copy"><strong>හඬ</strong><small>Voice to text</small></span>
        </button>
        <nav className="primary-nav">
          <button className={!historyOpen ? "active" : ""} onClick={() => setHistoryOpen(false)}><Mic2 aria-hidden="true" /><span>හඬ ලියන්න</span></button>
          <button className={historyOpen ? "active" : ""} onClick={() => setHistoryOpen((open) => !open)}><History aria-hidden="true" /><span>මෑත පිටපත්</span><em>{sessions.length}</em></button>
          <button onClick={newNote} disabled={busy}><Plus aria-hidden="true" /><span>නව සටහන</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setOnboardingOpen(true)}><CircleHelp aria-hidden="true" /><span>උදව්</span></button>
          <div className="account"><span className="avatar">ස</span><span><strong>සිංහල කථිකයා</strong><small>Free plan · 5 min</small></span></div>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div className="topbar-title"><h1>ඔබ කියන දේ සිංහලෙන් ලියමු</h1><p>Speak naturally — හඬ ඔබේ වචන හඳුනාගනී</p></div>
          <div className="topbar-actions">
            <label className="language-pill">
              <select aria-label="Transcription language" value={language} onChange={(event) => setLanguage(event.target.value as "si" | "en")} disabled={busy}>
                <option value="si">සිංහල · ශ්‍රී ලංකා</option>
                <option value="en">English</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
            <button
              className="display-button"
              type="button"
              onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "ආලෝක තේමාව සක්‍රිය කරන්න" : "අඳුරු තේමාව සක්‍රිය කරන්න"}
              title={theme === "dark" ? "ආලෝක තේමාව" : "අඳුරු තේමාව"}
            >
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
            <button
              className={`display-button background-button mode-${backgroundMode}`}
              type="button"
              onClick={cycleBackground}
              aria-label={`පසුබිම: ${BACKGROUND_LABELS[backgroundMode]}. ඊළඟ: ${BACKGROUND_LABELS[nextBackground]}`}
              title={`පසුබිම: ${BACKGROUND_LABELS[backgroundMode]}`}
            >
              {backgroundMode === "none" ? <CircleOff aria-hidden="true" /> : backgroundMode === "matrix" ? <Sparkles aria-hidden="true" /> : <Grid3X3 aria-hidden="true" />}
            </button>
            <button className="new-note-button" onClick={newNote} disabled={busy}><Plus aria-hidden="true" />නව සටහන</button>
          </div>
        </header>

        <div className="workspace">
          <section className="recorder-card" aria-label="හඬ පටිගත කිරීම">
            <div className="panel-heading"><span>සජීවී පටිගත කිරීම</span><span className={`status-chip ${recording || processing ? "active" : ""}`}><i />{statusLabel}</span></div>
            <div className="recording-stage">
              <div className="mic-orbit">
                <button className={`mic-button ${processing ? "processing" : ""}`} type="button" onClick={toggleRecording} aria-pressed={recording} aria-label={recording ? "පටිගත කිරීම නවත්වන්න" : processing ? "පිටපත් කිරීම අවලංගු කරන්න" : "පටිගත කිරීම අරඹන්න"} disabled={requesting}>
                  {processing ? <LoaderCircle className="spin" aria-hidden="true" /> : recording ? <span className="stop-mark" /> : <Mic aria-hidden="true" />}
                </button>
              </div>
              <strong>{prompt}</strong><span>{helper}</span>
            </div>
            <div className="recorder-footer">
              <AnimatePresence mode="wait">
                {error ? (
                  <motion.div className="recorder-feedback error" role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
                    <span>{error}</span><button onClick={() => setError("")} aria-label="දෝෂය වසන්න"><X /></button>
                  </motion.div>
                ) : toast ? (
                  <motion.div className="recorder-feedback success" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
                    <Check />{toast}
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <div className="waveform-wrap"><Waveform analyser={recorder.analyser} active={recording} processing={processing} /></div>
              <div className="device-row"><span><Radio aria-hidden="true" />Input</span><strong>{recorder.deviceName}</strong></div>
            </div>
          </section>

          <section className="transcript-card" aria-label="සිංහල පිටපත">
            <div className="transcript-heading">
              <div><input aria-label="සටහන් මාතෘකාව" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} disabled={processing} /><p>වචන {words} · මිනිත්තු {formatTime(visibleTime)}</p></div>
              <button className="copy-button" onClick={() => void copyTranscript()} disabled={!text || processing}><Copy aria-hidden="true" />පිටපත් කරන්න</button>
            </div>
            <div className="editor-shell">
              <textarea ref={textArea} aria-label="පිටපත් පෙළ" value={text} onChange={(event) => setText(event.target.value)} readOnly={processing || recording} placeholder={recording ? "ඔබේ වචන මෙහි දිස්වනු ඇත…" : "පටිගත කිරීමක් ආරම්භ කරන්න, නැතහොත් මෙහි ටයිප් කරන්න…"} spellCheck />
              {(recording || processing) && <span className="live-caret" aria-hidden="true" />}
            </div>
            <div className="transcript-footer">
              <div className="trust-notes"><span><Sparkles aria-hidden="true" />විරාම ලකුණු ස්වයංක්‍රීයයි</span><span><ShieldCheck aria-hidden="true" />පෞද්ගලිකයි</span></div>
              <button className="export-button" onClick={exportTranscript} disabled={!text || processing}><Download aria-hidden="true" />අපනයනය</button>
            </div>
          </section>
        </div>

        <AnimatePresence>
          {historyOpen && (
            <motion.aside className="history-drawer" aria-label="මෑත පිටපත්" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
              <div className="drawer-heading"><div><span>ඔබේ සටහන්</span><h2>මෑත පිටපත්</h2></div><button onClick={() => setHistoryOpen(false)} aria-label="වසන්න"><X /></button></div>
              <div className="history-list">
                {sessions.length ? sessions.map((session) => (
                  <button key={session.id} onClick={() => openSession(session)} className={session.id === sessionId ? "selected" : ""}>
                    <FileText aria-hidden="true" /><span><strong>{session.title}</strong><small>{new Intl.DateTimeFormat("si-LK", { dateStyle: "medium" }).format(session.created)} · {formatTime(session.duration)}</small></span>
                  </button>
                )) : <div className="empty-history"><History /><strong>තවම පිටපත් නැත</strong><span>ඔබේ පළමු හඬ සටහන මෙහි දිස්වනු ඇත.</span></div>}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {onboardingOpen && (
          <motion.div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="welcome-card" initial={{ y: 18, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, opacity: 0 }}>
              <span className="welcome-mark"><Mic /></span><p>සිංහල හඬ-ට-පෙළ</p><h2 id="welcome-title">ඔබේ හඬ, පැහැදිලි වචන ලෙස.</h2>
              <span>මයික්‍රොෆෝනය තට්ටු කර කතා කරන්න. ඔබ අවසන් කළ විට හඬ ඔබේ සිංහල පිටපත සූදානම් කරයි.</span>
              <div className="welcome-actions"><button onClick={() => void finishOnboarding()}>මයික්‍රොෆෝනය සූදානම් කරන්න</button><button className="skip-button" onClick={skipOnboarding}>දැනට මඟහරින්න</button></div>
              <small>හඬ ගොනු මෙම යෙදුම තුළ ගබඩා නොකෙරේ.</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </>
  );
}
