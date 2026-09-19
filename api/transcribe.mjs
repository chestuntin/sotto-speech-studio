import express from "express";
import multer from "multer";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4_000_000, files: 1, fields: 1 },
});

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const origin = req.headers.origin;
  const hostOrigins = new Set([
    `http://${req.headers.host}`,
    `https://${req.headers.host}`,
  ]);
  if (origin && !hostOrigins.has(origin)) {
    return res
      .status(403)
      .json({ error: "This app only accepts same-origin requests." });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }
  next();
});

app.use(upload.single("file"));

app.use(async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(503)
      .json({ error: "Transcription is not configured on this server yet." });
  }
  if (!req.file?.size) {
    return res
      .status(400)
      .json({ error: "Choose an audio file or record something first." });
  }
  if (
    !/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|flac)$/i.test(
      req.file.originalname,
    )
  ) {
    return res
      .status(400)
      .json({ error: "This audio format is not supported." });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", onClose);

  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob([req.file.buffer], { type: req.file.mimetype }),
      req.file.originalname,
    );
    form.append("model", "gpt-transcribe");
    form.append("stream", "true");

    const upstream = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
        signal: controller.signal,
      },
    );

    if (!upstream.ok) {
      const messages = {
        401: "The transcription service rejected its server configuration.",
        403: "The transcription service does not have access to this model.",
        404: "The configured transcription model is unavailable.",
        413: "This recording is too large.",
        429: "OpenAI’s usage or rate limit was reached. Try again shortly.",
      };
      return res.status(upstream.status).json({
        error:
          messages[upstream.status] ||
          "OpenAI could not transcribe this audio. Please try again.",
      });
    }
    if (!upstream.body) throw new Error("Empty upstream response");

    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "text/event-stream",
    );
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(502).json({
        error:
          error.name === "AbortError"
            ? "Transcription timed out. Please try again."
            : "Cannot reach OpenAI. Check the server configuration and try again.",
      });
    } else if (!res.destroyed) {
      res.end();
    }
  } finally {
    clearTimeout(timer);
    res.off("close", onClose);
  }
});

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(400).json({
    error:
      error.code === "LIMIT_FILE_SIZE"
        ? "This recording is too large for the demo deployment."
        : "The upload could not be read. Please try again.",
  });
});

export default app;
