import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const server = http.createServer((_request, response) => {
  response.writeHead(426, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "This endpoint is for WebSocket connections." }));
});
const realtimeServer = new WebSocketServer({ server });

realtimeServer.on("connection", (browser) => {
  if (!process.env.OPENAI_API_KEY) {
    browser.close(1011, "Server transcription key is not configured");
    return;
  }
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
            transcription: { model: "gpt-transcribe" },
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

export default server;
