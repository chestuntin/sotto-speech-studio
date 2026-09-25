import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const MAX_AUDIO_BYTES = 65 * 24_000 * 2;
const MAX_AUDIO_CHUNKS = 600;
const MAX_PENDING_EVENTS = 96;

const server = http.createServer((_request, response) => {
  response.writeHead(426, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "This endpoint is for WebSocket connections." }));
});
const realtimeServer = new WebSocketServer({
  server,
  maxPayload: 32 * 1024,
  perMessageDeflate: false,
  verifyClient: ({ origin, req }) =>
    Boolean(origin && req.headers.host && origin === `https://${req.headers.host}`),
});

realtimeServer.on("connection", (browser, request) => {
  if (!process.env.OPENAI_API_KEY) {
    browser.close(1011, "Server transcription key is not configured");
    return;
  }
  const requestUrl = new URL(request.url || "/api/server", "http://localhost");
  const language = requestUrl.searchParams.get("language") === "en" ? "en" : "si";
  const openai = new WebSocket("wss://api.openai.com/v1/realtime?intent=transcription", {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
  const pendingEvents = [];
  let audioBytes = 0;
  let audioChunks = 0;
  let committed = false;
  const connectionTimer = setTimeout(() => browser.close(1008, "Recording time limit reached"), 90_000);
  const upstreamTimer = setTimeout(() => browser.close(1013, "Transcription service timed out"), 15_000);
  openai.on("open", () => {
    clearTimeout(upstreamTimer);
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
  openai.on("close", () => {
    clearTimeout(upstreamTimer);
    if (browser.readyState === WebSocket.OPEN) browser.close();
  });
  browser.on("message", (message) => {
    try {
      const event = JSON.parse(message.toString());
      let relay;
      if (event?.type === "audio" && !committed && typeof event.audio === "string") {
        const chunk = Buffer.from(event.audio, "base64");
        if (!chunk.length || chunk.length > 16_384 || chunk.length % 2 || chunk.toString("base64") !== event.audio) {
          browser.close(1003, "Invalid audio chunk");
          return;
        }
        audioBytes += chunk.length;
        audioChunks += 1;
        if (audioBytes > MAX_AUDIO_BYTES || audioChunks > MAX_AUDIO_CHUNKS) {
          browser.close(1008, "Recording limit reached");
          return;
        }
        relay = JSON.stringify({ type: "input_audio_buffer.append", audio: event.audio });
      } else if (event?.type === "commit" && !committed && audioBytes) {
        committed = true;
        relay = JSON.stringify({ type: "input_audio_buffer.commit" });
      } else {
        browser.close(1003, "Invalid realtime event");
        return;
      }
      if (openai.readyState === WebSocket.OPEN) openai.send(relay);
      else if (pendingEvents.length < MAX_PENDING_EVENTS) pendingEvents.push(relay);
      else browser.close(1013, "Transcription service is busy");
    } catch {
      browser.close(1003, "Invalid realtime event");
    }
  });
  browser.on("close", () => {
    clearTimeout(connectionTimer);
    clearTimeout(upstreamTimer);
    pendingEvents.length = 0;
    if (openai.readyState === WebSocket.CONNECTING) openai.terminate();
    else if (openai.readyState === WebSocket.OPEN) openai.close();
  });
});

export default server;
