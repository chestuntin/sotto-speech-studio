import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "requesting" | "recording" | "paused";
export function useRecorder(
  onComplete: (file: File, duration: number) => void,
  onError: (message: string) => void,
) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [deviceName, setDeviceName] = useState("Default microphone");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const elapsed = useRef(0);
  const segmentStart = useRef(0);
  const callbacks = useRef({ onComplete, onError });
  callbacks.current = { onComplete, onError };
  const mounted = useRef(true);
  const starting = useRef(false);

  const cleanup = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (context.current && context.current.state !== "closed")
      void context.current.close().catch(() => {});
    context.current = null;
    if (mounted.current) setAnalyser(null);
  }, []);

  const stop = useCallback(() => {
    const current = recorder.current;
    if (!current || current.state === "inactive") return;
    if (current.state === "recording")
      elapsed.current += (performance.now() - segmentStart.current) / 1000;
    setSeconds(elapsed.current);
    current.stop();
    setStatus("idle");
    cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    if (
      starting.current ||
      (recorder.current && recorder.current.state !== "inactive")
    )
      return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      callbacks.current.onError(
        "Microphone recording is unavailable. Open this app on localhost in a current browser, or upload an audio file.",
      );
      return;
    }
    starting.current = true;
    setStatus("requesting");
    try {
      // Start the permission request before any await so a keyboard gesture
      // retains its transient activation in Chrome.
      const mediaPromise = navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const audioContext = new AudioContext();
      context.current = audioContext;
      // Resume from the user gesture for Safari and mobile audio policies.
      // Do not let a browser-specific audio-policy delay hold up the
      // microphone permission result or leave the recorder stuck requesting.
      void audioContext.resume().catch(() => {});
      const media = await mediaPromise;
      void audioContext.resume().catch(() => {});
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        await audioContext.close().catch(() => {});
        return;
      }
      stream.current = media;
      const audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 1024;
      audioAnalyser.smoothingTimeConstant = 0.7;
      audioContext.createMediaStreamSource(media).connect(audioAnalyser);
      setAnalyser(audioAnalyser);
      setDeviceName(media.getAudioTracks()[0]?.label || "Default microphone");
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
      });
      recorder.current = instance;
      const chunks: Blob[] = [];
      let bytes = 0;
      instance.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          bytes += event.data.size;
        }
        if (bytes >= 23_000_000 && instance.state !== "inactive") {
          stop();
          callbacks.current.onError(
            "Recording stopped near the upload limit. Your audio is ready.",
          );
        }
      };
      instance.onerror = () => {
        callbacks.current.onError(
          "The microphone stopped unexpectedly. Any captured audio will be kept.",
        );
        if (instance.state !== "inactive") stop();
        else {
          cleanup();
          setStatus("idle");
        }
      };
      instance.onstop = () => {
        if (!mounted.current) return;
        cleanup();
        setStatus("idle");
        const type = instance.mimeType || mimeType || "audio/webm";
        const extension = type.includes("mp4")
          ? "m4a"
          : type.includes("ogg")
            ? "ogg"
            : "webm";
        const file = new File(chunks, `sotto-recording.${extension}`, { type });
        if (file.size > 0) callbacks.current.onComplete(file, elapsed.current);
        else
          callbacks.current.onError(
            "No audio was captured. Please try recording again.",
          );
      };
      media.getAudioTracks()[0]?.addEventListener("ended", () => {
        if (instance.state !== "inactive") {
          stop();
          callbacks.current.onError(
            "Your microphone disconnected. Captured audio has been kept.",
          );
        }
      });
      elapsed.current = 0;
      segmentStart.current = performance.now();
      setSeconds(0);
      instance.start(1000);
      setStatus("recording");
    } catch (error) {
      cleanup();
      if (!mounted.current) return;
      setStatus("idle");
      const name = error instanceof DOMException ? error.name : "";
      callbacks.current.onError(
        name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in your browser’s site settings, then try again."
          : name === "NotFoundError"
            ? "No microphone was found. Connect one or upload an audio file."
            : name === "NotReadableError"
              ? "Your microphone is being used by another app. Close it and try again."
              : "Could not start your microphone. Please check your device and browser permissions.",
      );
    } finally {
      starting.current = false;
    }
  }, [cleanup, stop]);

  const togglePause = useCallback(() => {
    const current = recorder.current;
    if (!current) return;
    if (current.state === "recording") {
      elapsed.current += (performance.now() - segmentStart.current) / 1000;
      current.pause();
      setStatus("paused");
      setSeconds(elapsed.current);
    } else if (current.state === "paused") {
      segmentStart.current = performance.now();
      current.resume();
      setStatus("recording");
    }
  }, []);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = window.setInterval(() => {
      const duration =
        elapsed.current + (performance.now() - segmentStart.current) / 1000;
      setSeconds(duration);
      if (duration >= 60) {
        stop();
        callbacks.current.onError(
          "You reached the one-minute demo limit. Your recording is ready.",
        );
      }
    }, 100);
    return () => clearInterval(timer);
  }, [status, stop]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current && recorder.current.state !== "inactive")
        recorder.current.stop();
      cleanup();
    };
  }, [cleanup]);
  return { status, seconds, analyser, deviceName, start, stop, togglePause };
}
