# LittleAIBox

Privacy-focused AI conversation platform for chat, coding, writing, translation, and research. The client runs as a web app, PWA, and Android build, with document parsing and conversation state kept on the device whenever possible.

## Overview

LittleAIBox is an applied-AI product: a Gemini-compatible conversation surface plus an API pooling and relay layer for stable access. Users bring their own keys, choose task presets, and keep files and history under local control.

Live product: [littleaibox.com](https://littleaibox.com)

## Capabilities

- Conversational AI for general, coding, and research tasks
- Client-side parsing for PDF, DOCX, PPTX, and XLSX
- Mermaid, LaTeX, and Vega-Lite rendering
- Conversation timeline and task presets
- Dual API-key management with health checks and failover
- Voice input, customizable model parameters
- PWA offline support and Capacitor Android packaging
- Optional web search and Semantic Scholar research mode

## Who it is for

| Audience | Use |
| --- | --- |
| Developers | File-aware coding help without uploading a workspace |
| Researchers | Paper and slide analysis in the browser |
| Operators in restricted networks | Relay / pool for model access |
| Privacy-conscious teams | Local processing and user-owned keys |

## Tech stack

- Vite frontend
- Capacitor for native Android
- Cloudflare / edge workers for relay and availability
- IndexedDB for local conversation state
- Google Gemini-compatible model APIs

## Getting started

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Configure model keys and relay settings in the application UI. Do not commit secrets.

## Internationalization

Documentation and UI copy are available in multiple locales under `docs/` and the i18n pipeline used by `scripts/copy-i18n.mjs`.

## License

MIT. See [LICENSE](LICENSE) where present.

## Maintainer

[Anton Karas](https://github.com/antonkarasbiz) — full-stack, blockchain, and AI engineering.
