# Saathi

**Your files, mail and calendar, in your language.**

Saathi is a voice-first personal assistant that actually *does things*. Talk to it
in English, Hindi, Hinglish or any of 11 Indian languages. It reads your documents
(including scanned PDFs and photos), checks your inbox, drafts emails, manages your
calendar and translates messages. Every action it takes pops up as a live card
around an animated character while it answers out loud.

Built end to end on [Sarvam AI](https://www.sarvam.ai).

---

## Features

- **Voice in any Indian language.** Code-mixed speech ("rent agreement mein deposit kitna hai?") works, and replies come back in your language, in its native script and voice.
- **Lives in your files.** It can browse, search, read and write notes in a sandboxed workspace.
- **Reads scans.** PDFs and images, including Hindi documents, are read with Sarvam Vision and cached.
- **Mail, calendar, contacts.** Check the inbox, draft replies with attachments, send them after you confirm, list events and add new ones. These are mock services backed by SQLite.
- **Translation.** "Maa ko Marathi mein likho…" → Sarvam Translate.
- **Memory.** "Remember that I'm vegetarian" persists across conversations.
- **Drag and drop.** Drop any PDF, photo or text file onto the page and Saathi reads it and tells you what needs doing.
- **Hands-free conversation mode.** It listens, detects when you pause, answers and listens again.
- **Transparent by design.** Every tool call is shown as a card, and emails are always drafted for review before sending.

## Sarvam APIs used

| What | API / model |
|---|---|
| Speech to text + language detection | `saaras:v4` |
| Agent with native tool calling | `sarvam-105b` (chat completions) |
| Reading PDFs and images | Document Intelligence (Sarvam Vision) |
| Translation | `mayura:v1` |
| Voice | `bulbul:v4-flash` (Ishita), falling back to `bulbul:v3` |

---

## Quick start

Requirements: **Node 22+** (uses the built-in `node:sqlite`), **bun**, a
**Sarvam API key**, and **ImageMagick** with pango (only needed to generate the
scanned demo documents).

```bash
bun install
cp .env.example .env.local          # add your SARVAM_API_KEY
npm run seed                        # create the demo workspace
npm run smoke                       # optional: verify every Sarvam API works with your key
npm run dev                         # http://localhost:3000
```

Open the page in **Chrome or Edge** for the best mic and audio support. Wait for the
header chip to show **"N docs indexed"**: documents are read in the background on
first load, so later questions are instant.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run seed` | Create any missing demo files in `workspace/` |
| `npm run seed:reset` | Wipe `workspace/` **and** the database (mail, calendar, memories, OCR cache) back to the demo state |
| `npm run smoke` | Call each Sarvam API once and report ✓/✗ with latency |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `npm run format` | Biome |

### Environment (`.env.local`)

| Variable | Default | |
|---|---|---|
| `SARVAM_API_KEY` | — | **Required** |
| `SAATHI_USER_NAME` | `friend` | What Saathi calls you |
| `SAATHI_USER_EMAIL` | `me@saathi.local` | "From" address in the mock mailbox |
| `WORKSPACE_DIR` | `workspace` | The only folder Saathi can read or write |
| `SAATHI_DB` | `data/saathi.db` | SQLite file |
| `SARVAM_CHAT_MODEL` | `sarvam-105b` | |
| `SARVAM_STT_MODEL` | `saaras:v4` | |
| `SARVAM_STT_MODE` | `transcribe` | Also: `codemix`, `translit`, `translate` |

---

## Using Saathi

| Action | How |
|---|---|
| Talk | **Tap** the mic (it stops when you pause) or **hold Space / hold the mic** (push-to-talk) |
| Hands-free | Toggle the **〰** button and just talk back and forth |
| Type | **⌨** button |
| Interrupt | **Esc**, or start talking |
| Give it a document | Drag a PDF, image or text file onto the page |
| Change language | Speak in it, or say *"Talk to me in Tamil"* / *"Kannada mein bolo"* |
| Preview a file | Click any file on a card |

### Things to try

The seeded workspace is a believable personal setup: a rent agreement, a flight
ticket, a payslip, a scanned Hindi society notice, notes, a recipe and Maa's
medicine list. The mock inbox and calendar match these files.

- *"What's in my Documents folder?"*
- *"Society notice mein kya likha hai?"* (scanned Hindi image)
- *"Landlord ne rent badhane ka mail bheja hai — agreement mein allowed hai kya?"*
- *"Reply kar do ki theek hai, aur agreement attach kar do"* → *"Haan, bhej do"*
- *"Is hafte calendar mein kya hai?"* → *"Dentist wala Friday kar do"*
- *"Maa ko Marathi mein likho ki main Diwali pe 7 ko aa raha hoon"*
- *"Maa ki dawai kab khatam ho rahi hai?"*
- *"How much did I spend on groceries this month?"*
- *"Remember that I'm vegetarian."*

### Offline / no-key preview

Open **`/?demo`** to replay a scripted turn that runs the real tools without calling
the LLM. It shows every card type, and works as a fallback if the network dies
mid-demo. Voice output still needs the key.

---

## How it works

```
mic ─► /api/stt (Saaras) ─► /api/agent ─► Sarvam-105B ⇄ tools ─► files · Sarvam Vision · SQLite · Translate
                                 │  streams NDJSON: status lines, UI cards, final reply
                                 ▼
             cards pop out of the character ◄── browser ──► /api/tts (Bulbul) ─► lip-synced voice
```

- The agent runs a tool-calling loop (up to 6 steps) with reasoning disabled for
  low latency. Each tool emits UI events that stream to the browser *while the
  model is still working*.
- The voice language is chosen from the script of the reply (Tamil script → `ta-IN`, …).
- Document text is cached in SQLite by `(path, mtime)`, so each file is only sent to Sarvam Vision once.
- All file access goes through a sandbox check that rejects any path outside `WORKSPACE_DIR`.

Full design docs live in **[`doc/`](doc/README.md)**:
[architecture](doc/architecture.md) · [agent & tools](doc/agent.md) ·
[UI](doc/ui.md) · [Sarvam API notes](doc/sarvam.md).

### Project layout

```
src/app/            page + API routes (agent, stt, tts, file, upload, email, prewarm, demo)
src/components/     Saathi (page), Character (animated SVG), Cards (one per UI event)
src/lib/            sarvam client, agent loop, tools, workspace sandbox, documents/OCR cache, db
src/lib/client/     mic recorder (WAV encoder + VAD) and audio player (analyser)
scripts/            seed-workspace.mjs, smoke-sarvam.mjs
workspace/          the sandbox Saathi can see
data/               SQLite database (gitignored)
doc/                design docs
```

**Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Motion,
lucide-react, `node:sqlite`, fflate.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "SARVAM_API_KEY is not set" | Add it to `.env.local` and restart the dev server |
| Mic button flips back to idle | Speak for at least half a second; tap once to keep it open, or hold while talking |
| No sound | Click anywhere on the page first (browser autoplay rules) and check the volume |
| Hydration warnings mentioning `darkreader` | Caused by the Dark Reader extension; the page opts out with `darkreader-lock`, or disable it for localhost |
| Firefox "Security Error … file:///" | Harmless dev-tools message |
| Header says "Sarvam Vision reading N docs" for a long time | Each document takes about 5 s; check the server log for `[prewarm]` errors |
| Seed script fails | Install ImageMagick with pango support (`magick -list format \| grep PANGO`) |
| Demo got messy | `npm run seed:reset`, then restart the server |

## Notes and limits

- Mail, calendar and contacts are **local mocks** behind the same tool interface a
  real Gmail or Google Calendar integration would use. Swapping them in only touches
  `src/lib/tools.ts` and `src/app/api/email`.
- This is a single-user local demo with no authentication. Don't expose it on a public network.
- Sarvam REST speech-to-text accepts up to 30 s per utterance (the recorder stops at 29 s), and
  Document Intelligence accepts up to 10 pages per file.

## License

Copyright (C) 2026 the Saathi authors.

Saathi is free software, licensed under the **GNU Affero General Public License v3.0**
([`LICENSE`](LICENSE)). You may use, modify and redistribute it under those terms. If
you run a modified version as a network service, you must offer its users the
corresponding source code.
