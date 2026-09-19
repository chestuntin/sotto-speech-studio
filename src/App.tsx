import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownToLine, Check, Copy, LoaderCircle, Mic, Plus, X } from "lucide-react";
import { Waveform } from "./components/Waveform";
import { useRecorder } from "./hooks/useRecorder";
import { transcribe } from "./lib/transcribe";
import { download, formatTime, loadSessions, type Session } from "./lib/storage";

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, button, a, dialog, [contenteditable='true']"));
}

function isShiftKey(code: string) {
  return code === "ShiftLeft" || code === "ShiftRight";
}

export default function App() {
  const [onboardingOpen, setOnboardingOpen] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [title, setTitle] = useState("Voice note");
  const [text, setText] = useState("");
  const [duration, setDuration] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sessions, setSessions] = useState<Session[]>(loadSessions);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const abortRef = useRef<AbortController | null>(null);
  const holdRequested = useRef(false);
  const holdSource = useRef<"pointer" | "keyboard" | null>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);

  const notify = useCallback((message: string) => setToast(message), []);
  const saveSession = useCallback((session: Session) => {
    setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)].slice(0, 30));
    setSessionId(session.id);
    setSaved(true);
  }, []);

  const runTranscription = useCallback(async (audio: File, length: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setProcessing(true);
    setText("");
    setSaved(false);
    setSessionId(null);
    try {
      const result = await transcribe(audio, controller.signal, setText);
      if (!result.trim()) {
        setError("No speech was detected. Try speaking a little closer to your microphone.");
        return;
      }
      const noteTitle = title === "Voice note" ? `Voice note ${sessions.length + 1}` : title;
      setTitle(noteTitle);
      saveSession({ id: crypto.randomUUID(), title: noteTitle, text: result, duration: length, created: Date.now(), model: "gpt-transcribe" });
      notify("Transcript ready");
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Transcription failed. Please try again.");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setProcessing(false);
      }
    }
  }, [notify, saveSession, sessions.length, title]);

  const onRecordingComplete = useCallback((audio: File, length: number) => {
    setDuration(length);
    void runTranscription(audio, length);
  }, [runTranscription]);

  const recorder = useRecorder(onRecordingComplete, setError);
  const recording = recorder.status === "recording" || recorder.status === "paused";
  const requesting = recorder.status === "requesting";
  const busy = recording || requesting || processing;

  const persistCurrentNote = useCallback(() => {
    if (!saved || !sessionId) return;
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, title, text } : session));
  }, [saved, sessionId, text, title]);

  const newNote = useCallback(() => {
    if (busy) return;
    persistCurrentNote();
    setTitle("Voice note");
    setText("");
    setDuration(0);
    setSessionId(null);
    setSaved(false);
    setError("");
    requestAnimationFrame(() => textArea.current?.focus());
  }, [busy, persistCurrentNote]);

  async function beginHold(source: "pointer" | "keyboard") {
    if (busy || (onboardingOpen && onboardingStep === 1)) return;
    if (onboardingOpen && onboardingStep === 0) {
      void requestMicrophoneForTour();
      return;
    }
    holdRequested.current = true;
    holdSource.current = source;
    if (onboardingOpen) setOnboardingStep(1);
    newNote();
    await recorder.start();
    if (!holdRequested.current) recorder.stop();
  }

  function endHold(source: "pointer" | "keyboard") {
    if (holdSource.current !== source) return;
    holdRequested.current = false;
    holdSource.current = null;
    recorder.stop();
  }

  function cancelTranscription() {
    abortRef.current?.abort();
    setProcessing(false);
    setError("Transcription cancelled. Your recording is still available.");
  }

  function openSession(session: Session) {
    if (busy) return;
    persistCurrentNote();
    setTitle(session.title);
    setText(session.text);
    setDuration(session.duration);
    setSessionId(session.id);
    setSaved(true);
    setError("");
  }

  async function copyTranscript() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied to clipboard");
    } catch {
      textArea.current?.focus();
      textArea.current?.select();
      notify("Select the transcript and copy it manually");
    }
  }

  function exportTranscript() {
    if (!text) return;
    const filename = `${title.replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().slice(0, 80) || "voice-note"}.txt`;
    download(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
    notify("Transcript exported");
  }

  function finishOnboarding() {
    setOnboardingOpen(false);
  }

  async function requestMicrophoneForTour() {
    setOnboardingStep(1);
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach((track) => track.stop());
      setOnboardingStep(2);
    } catch {
      setError("Choose Allow in Chrome to give Sotto microphone access.");
    }
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
    if (onboardingOpen && onboardingStep === 1 && recorder.status === "recording") {
      setOnboardingStep(2);
    }
  }, [onboardingOpen, onboardingStep, recorder.status]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && !isShiftKey(event.code)) return;
      if (event.repeat || (event.code === "Space" && isInteractiveTarget(event.target))) return;
      event.preventDefault();
      void beginHold("keyboard");
    };
    const keyUp = (event: KeyboardEvent) => {
      if ((event.code !== "Space" && !isShiftKey(event.code)) || holdSource.current !== "keyboard") return;
      event.preventDefault();
      endHold("keyboard");
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  const noteNumber = sessionId ? Math.max(1, sessions.findIndex((session) => session.id === sessionId) + 1) : sessions.length + 1;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const visibleTime = recording ? recorder.seconds : duration;
  const status = recording ? "HOLDING — LISTENING" : requesting ? "OPENING MICROPHONE" : processing ? "TURNING VOICE INTO TEXT" : text ? "DRAFT READY" : "READY";
  const recent = sessions.slice(0, 3);
  const touchDevice = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const onboardingCopy = onboardingStep === 0
    ? touchDevice ? "Hold the microphone button to speak" : "Hold Right Shift to speak"
    : onboardingStep === 1
      ? touchDevice ? "Tap Allow this time to enable recording" : "Click Allow this time to enable recording"
      : touchDevice ? "Hold the microphone button to transcribe your speech to text" : "Press Right Shift to transcribe your speech to text";

  return (
    <div className={`sotto-app ${recording ? "is-listening" : ""}`}>
      <aside className="note-rail" aria-label="Recent notes">
        <button className="rail-brand" onClick={newNote} aria-label="New Sotto note">sotto</button>
        <nav className="rail-notes">
          {Array.from({ length: 3 }, (_, index) => {
            const session = recent[index];
            return (
              <button key={session?.id || index} className={session?.id === sessionId ? "active" : ""} disabled={!session || busy} onClick={() => session && openSession(session)} aria-label={session ? `Open ${session.title}` : `Empty note slot ${index + 1}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="note-surface">
        <section className="editor-pane" aria-label="Transcript editor">
          <header className="editor-header">
            <div className="editor-meta">
              <span>VOICE NOTE {String(noteNumber).padStart(2, "0")}</span>
              <time>{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </div>
            <div className="editor-actions">
              <button onClick={newNote} disabled={busy}><Plus size={14} />NEW</button>
              <button onClick={() => void copyTranscript()} disabled={!text || processing}><Copy size={14} />COPY</button>
              <button onClick={exportTranscript} disabled={!text || processing}><ArrowDownToLine size={14} />EXPORT</button>
            </div>
          </header>

          <div className="mobile-brandbar">
            <button onClick={newNote}>sotto</button>
            <div>
              <time>{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </div>
          </div>

          <div className="editor-body">
            <input className="note-title" aria-label="Note title" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} disabled={processing} />
            <textarea ref={textArea} aria-label="Transcript" value={text} onChange={(event) => setText(event.target.value)} readOnly={processing} placeholder="Your words will appear here." spellCheck />
            <div className="editor-foot">
              <span>{words} {words === 1 ? "word" : "words"}</span>
              <span>{saved ? "Saved on this device" : text ? "Editing" : "Ready for a thought"}</span>
            </div>
          </div>
        </section>

        <section className="recorder-dock" aria-label="Push-to-talk recorder">
          <div className="dock-waveform"><Waveform analyser={recorder.analyser} active={recorder.status === "recording"} processing={processing} /></div>
          <div className="dock-status" aria-live="polite"><span>{status}</span><strong>{formatTime(visibleTime)}</strong></div>
          <div className="dock-action">
            {processing ? (
              <button className="push-button processing" onClick={cancelTranscription}><LoaderCircle className="spin" size={34} /><span>CANCEL</span></button>
            ) : (
              <button
                className="push-button"
                aria-label={recording ? "Release to transcribe" : "Hold to record"}
                disabled={requesting}
                onPointerDown={(event) => {
                  if (event.pointerType === "mouse" && event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  void beginHold("pointer");
                }}
                onPointerUp={() => endHold("pointer")}
                onPointerCancel={() => endHold("pointer")}
                onKeyDown={(event) => {
                    if ((event.code === "Space" || event.code === "Enter" || isShiftKey(event.code)) && !event.repeat) {
                    event.preventDefault();
                    void beginHold("keyboard");
                  }
                }}
                onKeyUp={(event) => {
                  if (event.code === "Space" || event.code === "Enter" || isShiftKey(event.code)) {
                    event.preventDefault();
                    endHold("keyboard");
                  }
                }}
                onContextMenu={(event) => event.preventDefault()}
              >
                {requesting ? <LoaderCircle className="spin" size={36} /> : <Mic size={42} strokeWidth={2.1} />}
              </button>
            )}
            <span>{processing ? "CANCEL TRANSCRIPTION" : recording ? "RELEASE TO WRITE" : requesting ? "OPENING MICROPHONE" : "HOLD TO SPEAK"}</span>
          </div>
        </section>
      </main>

      <AnimatePresence>
        {onboardingOpen && (
          <motion.div
            className={`onboarding-overlay ${onboardingStep === 1 ? "permission-step" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coachmark-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="coachmark"
              initial={{ opacity: 0, y: 12, scale: .98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: .99 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              <div className="coachmark-topline">
                <span>{onboardingStep + 1} OF 3</span>
                <button onClick={finishOnboarding}>SKIP</button>
              </div>
              <div className="coachmark-body" key={onboardingStep}>
                {onboardingStep === 0 && (touchDevice ? <div className="permission-mark"><Mic size={28} /></div> : <div className="keycap"><small>RIGHT</small><strong>SHIFT</strong><i>⇧</i></div>)}
                {onboardingStep === 1 && <div className="permission-mark"><Mic size={28} /><Check size={16} /></div>}
                {onboardingStep === 2 && <div className="voice-mark"><i /><i /><i /><i /><i /></div>}
                <div>
                  <h2 id="coachmark-title">{onboardingCopy}</h2>
                </div>
              </div>
              <div className="coachmark-actions">
                <button className="coachmark-back" onClick={() => setOnboardingStep((step) => Math.max(0, step - 1))} disabled={onboardingStep === 0}>BACK</button>
                <div className="coachmark-dots" aria-hidden="true"><i className={onboardingStep === 0 ? "active" : ""} /><i className={onboardingStep === 1 ? "active" : ""} /><i className={onboardingStep === 2 ? "active" : ""} /></div>
                <button
                  className="coachmark-next"
                  onClick={() => {
                    if (onboardingStep === 0) void requestMicrophoneForTour();
                    else if (onboardingStep === 2) finishOnboarding();
                    else setOnboardingStep((step) => step + 1);
                  }}
                  autoFocus
                >{onboardingStep === 2 ? "DONE" : "NEXT"}</button>
              </div>
              <span className="coachmark-arrow" aria-hidden="true" />
            </motion.div>
          </motion.div>
        )}
        {error && <motion.div className="error-toast" role="alert" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></motion.div>}
        {toast && <motion.div className="success-toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={15} />{toast}</motion.div>}
      </AnimatePresence>

    </div>
  );
}
