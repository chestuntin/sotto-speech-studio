import express from "express";
import multer from "multer";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  const localEnv = fs.readFileSync(path.join(root, ".env"), "utf8");
  for (const line of localEnv.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch {
  // Production environments provide secrets through process.env.
}

const app = express();
const server = createHttpServer(app);
const realtimeServer = new WebSocketServer({ noServer: true });
const port = Number(process.env.PORT || 5173);
const models = new Set([
  "gpt-transcribe",
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25_000_000, files: 1, fields: 3 },
});

app.disable("x-powered-by");
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const origin = req.headers.origin;
  const hostOrigins = new Set([
    `http://${req.headers.host}`,
    `https://${req.headers.host}`,
  ]);
  if (origin && !hostOrigins.has(origin)) {
    return res
      .status(403)
      .json({ error: "This local studio only accepts same-origin requests." });
  }
  next();
});
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.post(
  "/api/transcribe",
  (req, res, next) => {
    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(503)
        .json({ error: "Transcription is not configured on this server yet." });
    }
    next();
  },
  upload.single("file"),
  async (req, res) => {
    if (!req.file?.size)
      return res
        .status(400)
        .json({ error: "Choose an audio file or record something first." });
    const model = "gpt-transcribe";
    if (!models.has(model))
      return res
        .status(400)
        .json({ error: "Choose a supported transcription model." });
    if (
      !/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|flac)$/i.test(
        req.file.originalname,
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            "This audio format is not supported. Try MP3, WAV, M4A, or WebM.",
        });
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
      form.append("model", model);
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
          413: "This recording is too large. Please use an audio file under 25 MB.",
          429: "OpenAI’s usage or rate limit was reached. Check your API billing and retry in a moment.",
        };
        return res
          .status(upstream.status)
          .json({
            error:
              messages[upstream.status] ||
              "OpenAI could not transcribe this audio. Check the file and try again.",
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
      if (!res.headersSent)
        res
          .status(502)
          .json({
            error:
              error.name === "AbortError"
                ? "Transcription timed out. Your audio is still available; try again."
                : "Cannot reach OpenAI. Check your connection and try again.",
          });
      else if (!res.destroyed) res.end();
    } finally {
      clearTimeout(timer);
      res.off("close", onClose);
    }
  },
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  res
    .status(400)
    .json({
      error:
        error.code === "LIMIT_FILE_SIZE"
          ? "Choose an audio file smaller than 25 MB."
          : "The upload could not be read. Please try another audio file.",
    });
});

if (process.argv.includes("--production")) {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
server.listen(port, "127.0.0.1", () =>
  console.log(`\n  Sotto is ready at http://localhost:${port}\n`),
);
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname !== "/realtime") return;
  realtimeServer.handleUpgrade(request, socket, head, (client) => realtimeServer.emit("connection", client, request));
});
realtimeServer.on("connection", (browser, request) => {
  if (!process.env.OPENAI_API_KEY) {
    browser.close(1011, "Server transcription key is not configured");
    return;
  }
  const requestUrl = new URL(request.url || "/realtime", "http://localhost");
  const language = requestUrl.searchParams.get("language") === "en" ? "en" : "si";
  const openai = new WebSocket("wss://api.openai.com/v1/realtime?intent=transcription", {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  const pendingEvents = [];
  openai.on("open", () => {
    openai.send(JSON.stringify({
      type: "session.update",
      session: {
        type: "transcription",
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            transcription: {
              model: "gpt-transcribe",
              ...(language === "en" ? { languages: ["en"] } : {}),
              prompt: language === "si"
                ? "මෙම හඬ පටය සිංහල අක්ෂරවලින් සහ නිවැරදි විරාම ලකුණු සමඟ පිටපත් කරන්න."
                : "Transcribe this audio in English with accurate punctuation.",
            },
            turn_detection: null,
          },
        },
      },
    }));
    for (const event of pendingEvents.splice(0)) openai.send(event);
  });
  openai.on("message", (message) => {
    if (browser.readyState === WebSocket.OPEN) browser.send(message.toString());
  });
  openai.on("error", () => {
    if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify({ type: "error", error: { message: "OpenAI realtime transcription could not be reached." } }));
  });
  openai.on("close", () => { if (browser.readyState === WebSocket.OPEN) browser.close(); });
  browser.on("message", (message) => {
    try {
      const event = JSON.parse(message.toString());
      const relay = event.type === "audio"
        ? JSON.stringify({ type: "input_audio_buffer.append", audio: event.audio })
        : event.type === "commit"
          ? JSON.stringify({ type: "input_audio_buffer.commit" })
          : null;
      if (!relay) return;
      if (openai.readyState === WebSocket.OPEN) openai.send(relay);
      else pendingEvents.push(relay);
    } catch {
      browser.close(1003, "Invalid realtime event");
    }
  });
  browser.on("close", () => openai.close());
});
server.on("error", (error) => {
  console.error(`Could not start Sotto: ${error.message}`);
  process.exit(1);
});
