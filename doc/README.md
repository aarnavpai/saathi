# Saathi — design docs

Saathi is a voice-first personal assistant. You hold space and talk to an
animated character in any of 11 Indian languages (or Hinglish); it can browse and
read the files in a sandboxed workspace (including scanned PDFs and images, via
Sarvam Vision OCR), check a mock inbox, calendar and contacts, draft and send
emails, write notes, and remember facts about you. Every action it takes pops
up as a rich card around the character while it answers out loud.

| Doc | What's in it |
|---|---|
| [architecture.md](architecture.md) | Components, request flow, file layout, data model, security boundaries |
| [agent.md](agent.md) | The tool-calling loop, system prompt, tools, streaming protocol, language handling |
| [ui.md](ui.md) | The character, card system, interaction model, layout |
| [sarvam.md](sarvam.md) | How each Sarvam API is used, models/voices chosen, gotchas |

## Running it

```bash
bun install                      # packages
cp .env.example .env.local       # then set SARVAM_API_KEY
node scripts/seed-workspace.mjs  # demo files (needs ImageMagick for the scanned PDFs)
node node_modules/next/dist/bin/next dev   # or: npm run dev
```

Open http://localhost:3000. Chrome/Edge recommended (mic + Web Audio).

- `/?demo` replays a scripted turn that runs the real tools without calling the
  LLM. Use it to preview every card type without an API key, or as a fallback
  if the network dies mid-demo.
- `node scripts/seed-workspace.mjs --reset` wipes the workspace **and** the
  SQLite DB (mock mail/calendar/memories/OCR cache) back to the seed state.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `SARVAM_API_KEY` | — (required) | Sarvam API subscription key |
| `SAATHI_USER_NAME` | `friend` | What the assistant calls you |
| `SAATHI_USER_EMAIL` | `me@saathi.local` | "From" address for the mock mailbox |
| `WORKSPACE_DIR` | `workspace` | Root the assistant may read/write |
| `SAATHI_DB` | `data/saathi.db` | SQLite file |
| `SARVAM_CHAT_MODEL` | `sarvam-105b` | Chat model |
| `SARVAM_STT_MODEL` | `saaras:v4` | Speech-to-text model |
| `SARVAM_STT_MODE` | `transcribe` | STT mode (`transcribe`, `codemix`, `translit`, …) |

## Suggested demo script

1. "What's in my Documents folder?" → folder card flies out.
2. "Society notice mein kya likha hai?" → Sarvam Vision reads a *scanned Hindi*
   notice; Saathi answers in Hindi.
3. "Landlord ne rent badhane ka mail bheja hai — agreement mein kya likha hai?"
   → inbox card + rent agreement with clause 4 highlighted.
4. "Reply saying 5% is fine, and attach the agreement" → editable email draft.
5. "Haan, bhej do" → draft card flips to *Sent*.
6. "Plumber Tuesday ko 11 baje aa raha hai, calendar mein daal do" → event card.
