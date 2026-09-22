import { useCallback, useEffect, useRef, useState } from "react";

export type RealtimeRecorderStatus = "idle" | "requesting" | "recording" | "paused" | "processing";
type Callbacks = {
  onComplete: (text: string, duration: number) => void;
  onError: (message: string) => void;
  onProcessing?: () => void;
  onPartial?: (text: string) => void;
};

function pcm16Base64(input: Float32Array) {
  const bytes = new Uint8Array(input.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function websocketUrl(language: "si" | "en") {
  const configured = import.meta.env.VITE_REALTIME_WS_URL as string | undefined;
  if (configured) {
    const url = new URL(configured, window.location.href);
    url.searchParams.set("language", language);
    return url.toString();
  }
  const path = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "/realtime" : "/api/server";
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}${path}?language=${language}`;
}

export function useRealtimeRecorder(
  onComplete: Callbacks["onComplete"],
  onError: Callbacks["onError"],
  onProcessing?: Callbacks["onProcessing"],
  onPartial?: Callbacks["onPartial"],
  language: "si" | "en" = "si",
) {
  const [status, setStatus] = useState<RealtimeRecorderStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [deviceName, setDeviceName] = useState("Default microphone");
  const callbacks = useRef<Callbacks>({ onComplete, onError, onProcessing, onPartial });
  callbacks.current = { onComplete, onError, onProcessing, onPartial };
  const mounted = useRef(true);
  const starting = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const elapsed = useRef(0);
  const segmentStart = useRef(0);
  const stopping = useRef(false);
  const committedText = useRef("");
  const completionTimer = useRef<number | null>(null);
  const pendingAudio = useRef<string[]>([]);
  const pendingCommit = useRef(false);

  const cleanup = useCallback(() => {
    if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    completionTimer.current = null;
    if (processor.current) processor.current.onaudioprocess = null;
    processor.current?.disconnect();
    processor.current = null;
    const currentSocket = socket.current;
    socket.current = null;
    pendingAudio.current = [];
    pendingCommit.current = false;
    if (currentSocket) {
      currentSocket.onclose = null;
      currentSocket.onerror = null;
      currentSocket.close();
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (context.current && context.current.state !== "closed") void context.current.close().catch(() => {});
    context.current = null;
    if (mounted.current) setAnalyser(null);
  }, []);

  const fail = useCallback((message: string) => {
    cleanup();
    if (!mounted.current) return;
    stopping.current = false;
    setStatus("idle");
    callbacks.current.onError(message);
  }, [cleanup]);

  const complete = useCallback(() => {
    const text = committedText.current.trim();
    const length = elapsed.current;
    cleanup();
    if (!mounted.current) return;
    stopping.current = false;
    setStatus("idle");
    callbacks.current.onComplete(text, length);
  }, [cleanup]);

  const stop = useCallback(() => {
    if (stopping.current || !socket.current) return;
    if (status === "recording") elapsed.current += (performance.now() - segmentStart.current) / 1000;
    setSeconds(elapsed.current);
    stopping.current = true;
    callbacks.current.onProcessing?.();
    setStatus("processing");
    if (socket.current.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type: "commit" }));
      completionTimer.current = window.setTimeout(() => fail("Live transcription timed out. Please try again."), 15_000);
    } else pendingCommit.current = true;
  }, [fail, status]);

  const start = useCallback(async () => {
    if (starting.current || socket.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof WebSocket === "undefined") {
      callbacks.current.onError("Live microphone transcription is unavailable in this browser.");
      return;
    }
    starting.current = true;
    setStatus("requesting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!mounted.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      setDeviceName(media.getAudioTracks()[0]?.label || "Default microphone");
      const audioContext = new AudioContext({ sampleRate: 24000, latencyHint: "interactive" });
      context.current = audioContext;
      await audioContext.resume().catch(() => {});
      const source = audioContext.createMediaStreamSource(media);
      const audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 1024;
      audioAnalyser.smoothingTimeConstant = 0.7;
      source.connect(audioAnalyser);
      setAnalyser(audioAnalyser);
      const connection = new WebSocket(websocketUrl(language));
      socket.current = connection;
      connection.onmessage = (message) => {
        let event: { type?: string; delta?: string; transcript?: string; error?: { message?: string } };
        try { event = JSON.parse(message.data as string); } catch { return; }
        if (event.type === "error") fail(event.error?.message || "Live transcription failed. Please try again.");
        else if (event.type === "conversation.item.input_audio_transcription.delta") {
          committedText.current += event.delta || "";
          callbacks.current.onPartial?.(committedText.current);
        }
        else if (event.type === "conversation.item.input_audio_transcription.completed") {
          committedText.current = event.transcript || committedText.current;
          callbacks.current.onPartial?.(committedText.current);
          complete();
        }
      };
      connection.onopen = () => {
        for (const audio of pendingAudio.current) connection.send(JSON.stringify({ type: "audio", audio }));
        pendingAudio.current = [];
        if (pendingCommit.current) {
          connection.send(JSON.stringify({ type: "commit" }));
          pendingCommit.current = false;
          completionTimer.current = window.setTimeout(() => fail("Live transcription timed out. Please try again."), 15_000);
        }
      };
      connection.onerror = () => fail("Could not connect to the realtime transcription server.");
      connection.onclose = () => { if (!stopping.current && mounted.current) fail("The realtime transcription connection closed. Please try again."); };
      if (!mounted.current) return;
      const recorder = audioContext.createScriptProcessor(4096, 1, 1);
      processor.current = recorder;
      recorder.onaudioprocess = (event) => {
        if (stopping.current) return;
        const audio = pcm16Base64(event.inputBuffer.getChannelData(0));
        if (connection.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ type: "audio", audio }));
        else pendingAudio.current.push(audio);
      };
      source.connect(recorder);
      recorder.connect(audioContext.destination);
      elapsed.current = 0;
      committedText.current = "";
      callbacks.current.onPartial?.("");
      stopping.current = false;
      segmentStart.current = performance.now();
      setSeconds(0);
      setStatus("recording");
    } catch (error) {
      fail(error instanceof DOMException ? "Could not access your microphone. Check the browser permission and try again." : "Could not connect to realtime transcription. Start the local server and try again.");
    } finally { starting.current = false; }
  }, [complete, fail, language]);

  const cancel = useCallback(() => { cleanup(); stopping.current = false; setStatus("idle"); }, [cleanup]);
  const togglePause = useCallback(() => {}, []);

  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => {
      const duration = elapsed.current + (performance.now() - segmentStart.current) / 1000;
      setSeconds(duration);
      if (duration >= 60) stop();
    }, 100);
    return () => window.clearInterval(timer);
  }, [status, stop]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cleanup(); }; }, [cleanup]);
  return { status, seconds, analyser, deviceName, start, stop, cancel, togglePause };
}
