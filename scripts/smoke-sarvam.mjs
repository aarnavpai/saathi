#!/usr/bin/env node
// Checks every Sarvam API Saathi uses, with the key from .env.local.
//   node --env-file=.env.local scripts/smoke-sarvam.mjs

import fs from "node:fs";

const KEY = process.env.SARVAM_API_KEY;
if (!KEY) {
  console.error("SARVAM_API_KEY not set");
  process.exit(1);
}
const H = { "api-subscription-key": KEY };
const J = { ...H, "Content-Type": "application/json" };
const B = "https://api.sarvam.ai";

async function step(name, fn) {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(
      `✓ ${name} (${Date.now() - t} ms) ${String(out).slice(0, 140)}`,
    );
    return out;
  } catch (e) {
    console.log(`✗ ${name}: ${e.message.slice(0, 400)}`);
  }
}
async function json(res) {
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  return JSON.parse(body);
}

await step("chat + tool call", async () => {
  const d = await json(
    await fetch(`${B}/v1/chat/completions`, {
      method: "POST",
      headers: J,
      body: JSON.stringify({
        model: "sarvam-105b",
        reasoning_effort: null,
        messages: [{ role: "user", content: "What's in my Documents folder?" }],
        tools: [
          {
            type: "function",
            function: {
              name: "list_files",
              description: "List files in a directory",
              parameters: {
                type: "object",
                properties: { dir: { type: "string" } },
              },
            },
          },
        ],
      }),
    }),
  );
  const m = d.choices[0].message;
  return m.tool_calls
    ? `tool_calls: ${JSON.stringify(m.tool_calls[0].function)}`
    : `NO TOOL CALL: ${m.content}`;
});

let wav;
for (const [model, speaker] of [
  ["bulbul:v4-flash", "ishita_enhi_customer"],
  ["bulbul:v3", "ishita"],
]) {
  const audio = await step(`tts ${model}/${speaker}`, async () => {
    const d = await json(
      await fetch(`${B}/text-to-speech`, {
        method: "POST",
        headers: J,
        body: JSON.stringify({
          text: "नमस्ते! मैं साथी हूँ, आपकी personal assistant.",
          language_code: "hi-IN",
          speaker,
          model,
        }),
      }),
    );
    return d.audios.join("");
  });
  wav ??= audio;
}

if (wav) {
  await step("stt (round-trip of the TTS audio)", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.from(wav, "base64")], { type: "audio/wav" }),
      "a.wav",
    );
    form.append("model", "saaras:v4");
    form.append("mode", "transcribe");
    const d = await json(
      await fetch(`${B}/speech-to-text`, {
        method: "POST",
        headers: H,
        body: form,
      }),
    );
    return `[${d.language_code}] ${d.transcript}`;
  });
}

await step("translate", async () => {
  const d = await json(
    await fetch(`${B}/translate`, {
      method: "POST",
      headers: J,
      body: JSON.stringify({
        input: "I'll be home for Diwali on the 7th.",
        source_language_code: "auto",
        target_language_code: "mr-IN",
        model: "mayura:v1",
        mode: "modern-colloquial",
      }),
    }),
  );
  return d.translated_text;
});

await step("doc ai digitise (society-notice.png)", async () => {
  const form = new FormData();
  form.append(
    "file",
    new Blob([fs.readFileSync("workspace/Documents/society-notice.png")], {
      type: "image/png",
    }),
    "society-notice.png",
  );
  form.append("output_format", "md");
  const { job_id } = await json(
    await fetch(`${B}/doc-ai/v1/job/digitise`, {
      method: "POST",
      headers: H,
      body: form,
    }),
  );
  let status = "pending";
  while (
    !["completed", "partially_completed", "failed", "rejected"].includes(status)
  ) {
    await new Promise((r) => setTimeout(r, 1500));
    status = (
      await json(
        await fetch(`${B}/doc-ai/v1/job/${job_id}/status`, { headers: H }),
      )
    ).status.toLowerCase();
  }
  const dl = await json(
    await fetch(`${B}/doc-ai/v1/job/${job_id}/download-url`, { headers: H }),
  );
  const zip = await fetch(dl.url, {
    method: dl.method ?? "GET",
    headers: dl.headers ?? {},
  });
  return `${status}, zip ${(await zip.arrayBuffer()).byteLength} bytes`;
});
