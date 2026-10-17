# Sarvam API usage

All calls are server-side in `src/lib/sarvam.ts`, authenticated with the
`api-subscription-key` header. Base URL `https://api.sarvam.ai`.

| Capability | Endpoint | Model | Used for |
|---|---|---|---|
| Chat completions | `POST /v1/chat/completions` | `sarvam-105b` | The agent, with native tool calling |
| Speech to text | `POST /speech-to-text` (multipart) | `saaras:v4` | Transcribing the user + language detection |
| Text to speech | `POST /text-to-speech` | `bulbul:v4-flash`, fallback `bulbul:v3` | Saathi's voice |
| Translate | `POST /translate` | `mayura:v1` | `translate_text` tool (e.g. a message for Maa in Marathi) |
| Document Intelligence | `POST /doc-ai/v1/job/digitise` → `/status` → `/download-url` | Sarvam Vision | OCR of PDFs and images, incl. Indic scripts |

## Chat

- `tools` + `tool_choice: "auto"`; responses with `finish_reason: "tool_calls"`
  carry `message.tool_calls[].function.arguments` as a JSON **string**.
- `reasoning_effort: null` disables thinking. With reasoning on, thinking
  tokens count toward `max_tokens`, and a low budget can return empty content
  with `finish_reason: "length"`.
- Sarvam-M is deprecated; v2 chat needs per-key whitelisting, so we stay on v1.

## Speech to text

- Sync REST accepts up to **30 s**; the recorder auto-stops at 29 s.
- We send 16 kHz mono 16-bit WAV encoded in the browser.
- Response: `{ transcript, language_code }`. `language_code` may be `null`.
- `SARVAM_STT_MODE` can be set to `codemix` / `translit` / `translate` to
  experiment; the default is `transcribe`.

## Text to speech

- Max 2,500 characters per REST request (we clip at 2,400; replies are short
  anyway). The response is `{ audios: [base64 WAV, ...] }`, which we join and
  hand to the browser.
- **One persona across languages.** Bulbul v4 Flash voice ids look like
  `<name>_<lang>_<style>`, and no single v4 voice covers every language. We use
  "Ishita" everywhere:
  - `ishita_enhi_customer` for English, Hindi and Hinglish
  - `ishita_mr_conversational` for Marathi
  - Bulbul v3 `ishita` (available in all 11 languages) for everything else,
    and as the automatic fallback if a v4 call fails
- Note: Bulbul v3 reaches end of life on Sarvam's *Voice Agents* product on
  10 Nov 2026; the REST fallback may need revisiting after that.

## Translate

- `source_language_code: "auto"`, `mode: "modern-colloquial"` (sounds like a
  person, not a government form). Mayura caps input at 1,000 characters.
- Response field: `translated_text`.
- Only used when the user asks for a translation for someone else; the agent's
  own replies are already generated in the user's language.

## Document Intelligence

- `digitise` uploads the file and creates the job in one multipart call
  (`file`, `output_format=md`). Omitting `language` defaults to Indic.
- Poll `GET /job/{id}/status` until `completed`, `partially_completed`,
  `failed` or `rejected`.
- `GET /job/{id}/download-url` returns `{ url, method, headers }` for a
  presigned download of a **ZIP** (main `.md`, per-page metadata, manifest). We
  unzip with `fflate` and concatenate the `.md` files.
- Limits: PDF/PNG/JPG/ZIP, ≤10 pages, ≤200 MB.
- It takes several seconds per document, hence the SQLite cache and the
  prewarm-on-load (see [architecture.md](architecture.md#document-pipeline)).

## Not used (yet)

- **Voice cloning:** would let users give Saathi a custom voice; the TTS layer
  is already isolated in `textToSpeech()`.
- **Dubbing:** no natural fit for a personal-assistant flow.
- **Streaming TTS/STT (WebSocket):** would cut latency further; the REST
  versions were chosen for simplicity.
