# Component sources

Sotto uses components from the user-selected libraries:

- `src/components/Waveform.tsx` adapts the canvas rendering, rounded bars, opacity mapping, edge fading, ResizeObserver sizing, and microphone frequency visualization from [ElevenLabs UI Waveform](https://ui.elevenlabs.io/docs/components/waveform), source: https://github.com/elevenlabs/ui/blob/main/apps/www/registry/elevenlabs-ui/ui/waveform.tsx. The adaptation shares the recorder's analyser, avoids per-frame React updates, respects reduced motion, and labels the static idle visualization and simulated demo separately from live input.
- `src/components/Button.tsx` adapts [beUI Button](https://beui.dev/components/motion/button), source: https://beui.dev/r/button (`components/motion/button/base.tsx`). The adaptation keeps its spring timing, press/hover interaction, touch hover detection, and reduced-motion behavior, with app-specific CSS.

The layout, recording integration, native form controls, and application logic are custom. No additional third-party UI component kit is used. Icons are from Lucide; animations use Motion. Fonts are bundled locally using Fontsource.

## ElevenLabs UI

MIT License

Copyright (c) 2025 Eleven Labs Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## beUI

MIT License

Copyright (c) 2026 Saurabh Chauhan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
