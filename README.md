# හඬ — Sinhala speech to text

A Sinhala-first, single-viewport speech-to-text application with realtime microphone transcription, editable local transcripts, responsive desktop/mobile layouts, and a local Express server. Built with React, TypeScript, and Vite.

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

1. Select the microphone and grant microphone access. Speak naturally in Sinhala and select it again to finish.
2. Watch the waveform and partial transcript update while the realtime connection is active.
3. Edit the completed transcript, copy it, or export a `.txt` file. Completed transcripts appear under **මෑත පිටපත්** and remain on this device.

## Behavior and data

- The waveform is a live microphone visualization. Realtime transcription deltas are displayed in the transcript editor and finalized after recording stops.
- Recordings stop automatically at one minute for the demo.
- The OpenAI key is read by the local server from `OPENAI_API_KEY` in `.env` or the deployment environment. It is never sent to the browser, stored in localStorage, or accepted from a client request.
- Audio is streamed through the local server for transcription. The server does not store audio on disk.
- The last 30 completed transcripts are kept in this browser's localStorage, with debounced edits. They are not synced to a server. Clearing browser data removes them. Use Export for a durable copy.
- Transcription needs network access and a server-side API key with access and billing enabled. The app itself and fonts run locally. The server uses `gpt-transcribe` by default.
- The online deployment limits `/api` requests to 10 per 10 minutes per IP through a Vercel Firewall rule. Realtime connections require a same-origin browser request and are capped at 65 seconds of PCM audio, 600 chunks, and 90 seconds of connection time. Uploaded files are limited to 4 MB. These limits reduce casual abuse; this public demo does not have user accounts or a per-user quota.
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
- Cancel a transcription and retry.
- Reload and verify transcripts persist locally.
