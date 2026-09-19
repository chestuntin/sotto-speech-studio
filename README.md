# Sotto — Your voice, in writing.

A local speech-to-text portfolio app with a microphone-driven canvas waveform, warm editorial design, responsive desktop/mobile layout, and streamed OpenAI transcription. Built with React, TypeScript, Vite, and a local Express server.

## Run locally

Requires Node.js 20.19+ or 22.12+ (Node 24 is supported).

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Add your server-side key to `.env` first if you want transcription:

```sh
cp .env.example .env
```

Then replace the placeholder value with your OpenAI API key. The key stays on the server and is never exposed in the browser.

1. Select **Start recording** and grant microphone access. Speak to see the waveform respond. Pause/resume as needed, then finish. The finished recording is transcribed automatically by the server.
2. Or select **Upload a file** and choose/drop audio up to 25 MB; the server transcribes it automatically.
3. Edit the title and transcript, copy the text, or export a `.txt` file. Completed transcripts appear in **My transcripts** and are searchable.

## Behavior and data

- The waveform is live microphone visualization. Text is streamed **after finishing a recording**, as the completed audio is processed; it is not realtime word-by-word recognition during recording.
- Recordings stop automatically at one minute for the demo, or near the 25 MB local upload limit. Capture uses a supported MediaRecorder format (WebM/Opus, MP4, or OGG), including an MP4 option for Safari.
- The OpenAI key is read by the local server from `OPENAI_API_KEY` in `.env` or the deployment environment. It is never sent to the browser, stored in localStorage, or accepted from a client request.
- Audio is held in memory, and sent to OpenAI only when transcribing. Download original audio before starting a new session or closing the page. The server does not store audio on disk.
- The last 30 completed transcripts are kept in this browser's localStorage, with debounced edits. They are not synced to a server. Clearing browser data removes them. Use Export for a durable copy.
- Transcription needs network access and a server-side API key with access and billing enabled. The app itself and fonts run locally. The server uses `gpt-transcribe` by default.
- The server binds to `127.0.0.1` only. Mobile-responsive CSS is included; accessing this localhost server from a physical phone requires a separate HTTPS development setup, since microphone access requires a secure context.
- Native dialogs provide modal focus management, Escape dismissal, and focus return. Controls have accessible labels, visible focus, and reduced-motion support. Motion-only hover effects are gated on pointer capability.

## Commands

```sh
npm run typecheck
npm run build
npm start
```

`npm start` serves the built app and API at the same localhost address. Stop an existing development server first, or choose another port with `PORT=5174 npm start`.

## Components and API reference

The waveform is adapted from [ElevenLabs UI](https://ui.elevenlabs.io/docs/components/waveform); spring buttons are adapted from [beUI](https://beui.dev/components/motion/button). Source details, modifications, and MIT notices are in `THIRD_PARTY_NOTICES.md`.

Transcription follows [OpenAI's file-transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text), including multipart uploads and `transcript.text.delta` / `transcript.text.done` streaming events. No ChatGPT Sites integration, hosted deployment, or computer-use automation is included.

## Manual checks

No browser or microphone test is performed automatically. For your testing:

- Try the demo at desktop and narrow mobile widths.
- Record in silence, speak, pause, resume, and finish; verify the microphone indicator turns off.
- Deny microphone access and verify the helpful error.
- Configure `OPENAI_API_KEY`, transcribe a short recording, then edit/copy/export it.
- Upload an audio file, play it, and transcribe it; try an invalid or oversized file.
- Cancel a transcription and retry using the retained audio.
- Reload and verify transcripts persist locally.
