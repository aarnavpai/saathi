import { unzipSync } from "fflate";

const BASE = "https://api.sarvam.ai";

export const CHAT_MODEL = process.env.SARVAM_CHAT_MODEL ?? "sarvam-105b";
export const STT_MODEL = process.env.SARVAM_STT_MODEL ?? "saaras:v4";

function key(): string {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new Error("SARVAM_API_KEY is not set (add it to .env.local)");
  return k;
}

async function check(res: Response, what: string): Promise<Response> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Sarvam ${what} failed (${res.status}): ${body.slice(0, 400)}`,
    );
  }
  return res;
}

// ---------- Chat ----------

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: object };
}

export async function chat(messages: ChatMessage[], tools: ToolSpec[]) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "api-subscription-key": key(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 1200,
      // Voice agent: no silent thinking time.
      reasoning_effort: null,
    }),
  });
  await check(res, "chat");
  const data = await res.json();
  const choice = data.choices?.[0];
  return {
    message: choice?.message as {
      content: string | null;
      tool_calls?: ToolCall[];
    },
    finish: choice?.finish_reason as string,
  };
}

// ---------- Speech to text ----------

export async function speechToText(audio: Blob) {
  const form = new FormData();
  form.append("file", audio, "speech.wav");
  form.append("model", STT_MODEL);
  form.append("mode", process.env.SARVAM_STT_MODE ?? "transcribe");
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "api-subscription-key": key() },
    body: form,
  });
  await check(res, "speech-to-text");
  const data = await res.json();
  return {
    transcript: (data.transcript as string) ?? "",
    lang: (data.language_code as string | null) ?? null,
  };
}

// ---------- Text to speech ----------

// One persona ("Ishita") across languages. Bulbul v4 Flash only has Ishita for
// en/hi/mr, so other languages fall back to Bulbul v3's multilingual "ishita".
const V4_VOICES: Record<string, string> = {
  "en-IN": "ishita_enhi_customer",
  "hi-IN": "ishita_enhi_customer",
  "mr-IN": "ishita_mr_conversational",
};

async function ttsOnce(
  text: string,
  lang: string,
  model: string,
  speaker: string,
) {
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: {
      "api-subscription-key": key(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, language_code: lang, speaker, model }),
  });
  await check(res, `text-to-speech (${model}/${speaker})`);
  const data = await res.json();
  return (data.audios as string[]).join("");
}

/** Returns base64 WAV. */
export async function textToSpeech(
  text: string,
  lang: string,
): Promise<string> {
  const clipped = text.slice(0, 2400);
  const v4 = V4_VOICES[lang];
  if (v4) {
    try {
      return await ttsOnce(clipped, lang, "bulbul:v4-flash", v4);
    } catch (e) {
      console.warn(
        "[tts] v4 failed, falling back to v3:",
        (e as Error).message,
      );
    }
  }
  return ttsOnce(clipped, lang, "bulbul:v3", "ishita");
}

// ---------- Document Intelligence (Sarvam Vision) ----------

const TERMINAL = new Set([
  "completed",
  "partially_completed",
  "failed",
  "rejected",
]);

/** OCRs a PDF/PNG/JPG and returns Markdown. Takes several seconds. */
export async function digitise(file: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("output_format", "md");
  const created = await fetch(`${BASE}/doc-ai/v1/job/digitise`, {
    method: "POST",
    headers: { "api-subscription-key": key() },
    body: form,
  });
  await check(created, "doc-ai digitise");
  const { job_id } = await created.json();

  const deadline = Date.now() + 180_000;
  let status = "pending";
  while (!TERMINAL.has(status)) {
    if (Date.now() > deadline) throw new Error("Doc AI job timed out");
    await new Promise((r) => setTimeout(r, 1500));
    const s = await fetch(`${BASE}/doc-ai/v1/job/${job_id}/status`, {
      headers: { "api-subscription-key": key() },
    });
    await check(s, "doc-ai status");
    status = String((await s.json()).status).toLowerCase();
  }
  if (status === "failed" || status === "rejected") {
    throw new Error(`Doc AI job ${status}`);
  }

  const dl = await fetch(`${BASE}/doc-ai/v1/job/${job_id}/download-url`, {
    headers: { "api-subscription-key": key() },
  });
  await check(dl, "doc-ai download-url");
  const { url, method, headers } = await dl.json();
  const zipRes = await fetch(url, {
    method: method ?? "GET",
    headers: headers ?? {},
  });
  await check(zipRes, "doc-ai download");
  const buf = new Uint8Array(await zipRes.arrayBuffer());

  // Output is a ZIP containing the main .md plus metadata.
  const files = unzipSync(buf);
  const md = Object.keys(files)
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((n) => new TextDecoder().decode(files[n]))
    .join("\n\n");
  return md.trim();
}

// ---------- Translate (Mayura) ----------

export async function translate(
  text: string,
  target: string,
  mode = "modern-colloquial",
): Promise<string> {
  const res = await fetch(`${BASE}/translate`, {
    method: "POST",
    headers: {
      "api-subscription-key": key(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text.slice(0, 1000),
      source_language_code: "auto",
      target_language_code: target,
      model: "mayura:v1",
      mode,
    }),
  });
  await check(res, "translate");
  return (await res.json()).translated_text as string;
}
