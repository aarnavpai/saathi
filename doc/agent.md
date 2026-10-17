# Agent

`src/lib/agent.ts` + `src/lib/tools.ts`.

## Loop

```
messages = [system, ...last 12 turns, user]
repeat up to 6 times:
  response = sarvam-105b(messages, tools, tool_choice=auto, reasoning off)
  if no tool_calls: emit reply, stop
  append assistant message (with tool_calls)
  for each call: emit status → run tool (tools emit ui events) → append tool result
```

- **Native tool calling.** Sarvam's v1 chat completions accept OpenAI-style
  `tools`; `function.arguments` is a JSON string we parse ourselves. Tool
  errors are returned to the model as `{"error": "..."}` rather than thrown, so
  it can recover (e.g. pick another path).
- **Reasoning off** (`reasoning_effort: null`). Silence is fatal in a voice UI,
  and the tool loop already gives the model room to work step by step.
- **History** is kept client-side as plain user/assistant text (last 16) and
  sent with each request. Tool calls and results from earlier turns are not
  replayed, which keeps prompts small; anything that must survive across turns
  is either in the DB (drafts, memories) or re-derived via tools.

## System prompt

Rebuilt every turn with live context:

- persona (warm, quick, a little playful), user's name, today's date/time
- the language the user just spoke (from STT)
- **reply rules for speech:** 1–3 sentences, no markdown/lists/URLs, numbers
  and dates said the way a person would, details go on screen not in speech
- **language rules:** reply in the user's language, in its native script;
  Hinglish stays mixed (Hindi in Devanagari, English in Latin) so TTS
  pronounces both correctly
- **work rules:** use tools instead of guessing, put cited files on screen
  (`show_file` with a verbatim `quote` to highlight), draft before sending,
  `remember` lasting preferences
- a listing of **all workspace files** (up to 120), so the model can usually
  go straight to `read_file` without a `list_files` round trip
- all saved **memories**
- **pending email drafts** with their ids, so "send it" in the next turn can be
  resolved without replaying earlier tool calls

The reply is post-processed (`cleanForSpeech`) to strip stray markdown or
`<think>` tags before display and TTS.

## Tools

| Tool | Does | Card |
|---|---|---|
| `list_files(dir)` | List a workspace directory | `folder` |
| `read_file(path)` | Text files read directly; PDFs/images via Sarvam Vision (cached) | `file` (loading → ready) |
| `show_file(path, quote?)` | Put a file on screen, highlighting `quote` | `file` with highlight |
| `search_files(query)` | Filename + content search, including OCR'd docs | `search` |
| `write_note(path, content)` | Create/overwrite a text file (default `Notes/`) | `note` |
| `find_contact(query)` | Search contacts by name/relation/email | `contacts` |
| `check_inbox(query?)` | Recent inbox mail, optional filter; marks read | `inbox` |
| `draft_email(to, subject, body, attachments?)` | Save a draft, show it for review | `email_draft` |
| `send_email(draft_id?)` | Send a draft (latest if omitted). Only after confirmation | `email_sent` (replaces the draft card) |
| `list_events(from, to)` | Calendar events in a date range | `events` |
| `create_event(title, start, end?, location?, attendees?)` | Add an event (default 1 h) | `event_created` |
| `translate_text(text, target_language)` | Sarvam Translate (Mayura, auto source, colloquial) | `translation` |
| `remember(fact)` | Persist a fact into the system prompt | `memory` |

Adding a tool = one `tool(...)` entry in `tools.ts` (spec + executor), a status
label in `agent.ts`, and, if it has its own card, a `UiEvent` variant in
`types.ts` plus a component in `Cards.tsx`.

## Streaming protocol

`POST /api/agent` body: `{ history: ChatTurn[], text: string, lang: string | null }`.
Response: `application/x-ndjson`, one `AgentChunk` per line:

```jsonc
{"t":"status","text":"Reading rent-agreement-2025.pdf with Sarvam Vision…"}
{"t":"ui","event":{"kind":"file","id":"a1b2c3d4","status":"loading", ...}}
{"t":"ui","event":{"kind":"file","id":"a1b2c3d4","status":"ready","preview":"..."}}
{"t":"reply","text":"Clause 4 says rent can go up by at most 5%.","lang":"en-IN"}
// or {"t":"error","message":"..."}
```

UI events are **upserted by `id`** on the client. That gives us loading
placeholders (same id, replaced later) and state transitions (`draft-7` goes
from `email_draft` to `email_sent` whether the user clicks Send or says
"bhej do").

## Language handling

- STT returns the detected language (`hi-IN`, `ta-IN`, …). It's passed to the
  agent and shown as a badge in the header.
- The TTS language is chosen from the **script of the reply**
  (`lang.ts:ttsLanguage`): Devanagari → `hi-IN` (or `mr-IN` if the user spoke
  Marathi), Tamil script → `ta-IN`, etc.; Latin → `en-IN`. This is more
  reliable than trusting the model to report its own language, and it handles
  typed input where there's no STT hint.
