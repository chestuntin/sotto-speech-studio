// Adapted from ElevenLabs UI Waveform / MicrophoneWaveform (MIT).
// https://ui.elevenlabs.io/docs/components/waveform
// © 2025 Eleven Labs Inc. See THIRD_PARTY_NOTICES.md.
// A shared analyser avoids opening a second microphone. Canvas animation is
// isolated from React, with a single ResizeObserver and cached dimensions.
// Samples are retained as a rolling amplitude history so the waveform travels
// from right to left as time passes instead of redrawing a frequency snapshot.
import { useEffect, useRef } from "react";

export function Waveform({
  analyser,
  active,
  demo = false,
  processing = false,
}: {
  analyser: AnalyserNode | null;
  active: boolean;
  demo?: boolean;
  processing?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const waveformColor =
      getComputedStyle(container).getPropertyValue("--waveform-color").trim() ||
      "#d4f77d";
    let width = 0,
      height = 0,
      frame = 0,
      lastSampleAt = 0,
      smoothedLevel = 0;
    let history: number[] = [];
    const samples = new Uint8Array(analyser?.fftSize || 1024);
    const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");

    const sampleInterval = motionQuery.matches ? 110 : 52;
    const step = 7;
    const historySize = () => Math.max(4, Math.ceil(width / step) + 3);

    const microphoneLevel = () => {
      if (!analyser) return 0;
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      let peak = 0;
      for (const sample of samples) {
        const value = (sample - 128) / 128;
        energy += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      const rms = Math.sqrt(energy / samples.length);
      // A little peak response keeps consonants crisp while RMS keeps speech
      // visually stable. The floor shows that the timeline is still moving.
      const target = Math.min(1, rms * 4.8 + peak * 0.42);
      const gated = target < 0.035 ? 0.018 : target;
      smoothedLevel +=
        (gated - smoothedLevel) * (gated > smoothedLevel ? 0.72 : 0.28);
      return smoothedLevel;
    };

    const generatedLevel = (now: number) => {
      const time = now / 1000;
      const pulse = Math.abs(
        Math.sin(time * 3.2) * Math.cos(time * 1.31 + 0.8),
      );
      return Math.min(1, 0.08 + pulse * (demo ? 0.78 : 0.5));
    };

    const appendSample = (now: number) => {
      const value = active && analyser ? microphoneLevel() : generatedLevel(now);
      history.push(value);
      if (history.length > historySize()) history.shift();
    };

    const paint = (progress: number) => {
      ctx.clearRect(0, 0, width, height);
      const center = height / 2;
      for (let i = 0; i < history.length; i++) {
        const value = history[i] ?? 0;
        const x = (i - 1 - progress) * step;
        if (x < -step || x > width + step) continue;
        const barHeight = Math.max(3, value * height * 0.86);
        const age = i / Math.max(1, history.length - 1);
        ctx.globalAlpha = (active || demo ? 0.42 : 0.25) + age * 0.4 + value * 0.28;
        ctx.fillStyle = waveformColor;
        ctx.beginPath();
        ctx.roundRect(x, center - barHeight / 2, 3, barHeight, 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (width > 0) {
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, "rgba(0,0,0,1)");
        gradient.addColorStop(0.08, "rgba(0,0,0,0)");
        gradient.addColorStop(0.94, "rgba(0,0,0,0)");
        gradient.addColorStop(1, "rgba(0,0,0,1)");
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
      }
    };

    const draw = (now: number) => {
      const animate = (active && analyser) || demo || processing;
      if (animate && now - lastSampleAt >= sampleInterval) {
        appendSample(now);
        lastSampleAt = now;
      }
      const progress =
        animate && !motionQuery.matches
          ? Math.min(1, (now - lastSampleAt) / sampleInterval)
          : 0;
      paint(progress);
      if (animate) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      cancelAnimationFrame(frame);
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = historySize();
      if (history.length > count) history = history.slice(-count);
      while (history.length < count) {
        const i = history.length;
        // A quiet, static trace makes the idle state legible without implying
        // that the microphone is listening.
        history.unshift(0.035 + Math.abs(Math.sin(i * 0.47)) * 0.12);
      }
      lastSampleAt = performance.now();
      draw(performance.now());
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [analyser, active, demo, processing]);
  return (
    <div
      className="waveform"
      ref={containerRef}
      role="img"
      aria-label={
        active
          ? "Live scrolling microphone waveform"
          : demo
            ? "Demonstration waveform"
            : "Audio waveform, microphone inactive"
      }
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
