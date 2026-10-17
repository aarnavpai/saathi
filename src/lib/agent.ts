import { db, nowLocalIso } from "./db";
import { LANG_NAMES, ttsLanguage } from "./lang";
import { type ChatMessage, chat } from "./sarvam";
import { runTool, toolSpecs } from "./tools";
import type { AgentChunk, ChatTurn } from "./types";
import { walk } from "./workspace";

const MAX_STEPS = 6;
const USER_NAME = process.env.SAATHI_USER_NAME ?? "friend";

const STATUS: Record<string, (a: Record<string, unknown>) => string> = {
  list_files: (a) => `Opening ${a.dir || "your files"}…`,
  read_file: (a) => `Reading ${a.path}…`,
  show_file: (a) => `Pulling up ${a.path}…`,
  search_files: (a) => `Searching for “${a.query}”…`,
  write_note: (a) => `Writing ${a.path}…`,
  find_contact: (a) => `Looking up ${a.query || "contacts"}…`,
  check_inbox: () => "Checking your inbox…",
  draft_email: () => "Drafting the email…",
  send_email: () => "Sending…",
  list_events: () => "Checking your calendar…",
  create_event: () => "Adding it to your calendar…",
  remember: () => "Noting that down…",
  translate_text: () => "Translating with Sarvam Translate…",
};

async function systemPrompt(lang: string | null): Promise<string> {
  const files = (await walk(120))
    .map((f) => `- ${f.path} (${f.kind}, ${f.size} B)`)
    .join("\n");
  const memories = (
    db().prepare("SELECT fact FROM memories ORDER BY id").all() as {
      fact: string;
    }[]
  )
    .map((m) => `- ${m.fact}`)
    .join("\n");
  const drafts = (
    db()
      .prepare(
        "SELECT id, to_addr, subject FROM emails WHERE folder = 'draft' ORDER BY id",
      )
      .all() as {
      id: number;
      to_addr: string;
      subject: string;
    }[]
  )
    .map((d) => `- draft ${d.id}: to ${d.to_addr}, “${d.subject}”`)
    .join("\n");
  const now = new Date();
  const spoken = lang ? (LANG_NAMES[lang] ?? lang) : "unknown (typed)";

  return `You are Saathi, ${USER_NAME}'s personal assistant. You are warm, quick and a little playful, like a capable friend. You talk out loud through a voice interface, and you can see ${USER_NAME}'s files, email, calendar and contacts through tools.

NOW: ${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, local time ${nowLocalIso().slice(11)}. Today's date is ${nowLocalIso().slice(0, 10)}.
LANGUAGE THE USER JUST SPOKE: ${spoken}

HOW TO REPLY
- Your reply is read aloud. Keep it to 1-3 short, natural sentences. No markdown, bullet points, emoji, URLs or file paths read out character by character.
- If the user asks you to speak a particular language ("talk to me in Tamil", "Kannada mein bolo"), switch to it and keep using it until they ask otherwise, even if they keep speaking another language. Otherwise, reply in the same language the user used. Write Indian languages in their native script (Hindi in Devanagari, Tamil in Tamil script, ...). If the user mixes Hindi and English, reply in the same mix, with Hindi words in Devanagari and English words in Latin.
- Details belong on screen, not in speech: the user sees a card for every tool you call. Say "I've put it on screen" rather than reading long content.
- Your voice is female: use feminine Hindi verb forms ("main kar deti hoon", "मैं देख लेती हूँ").
- Say amounts and dates the way a person would ("forty-five thousand rupees", "this Tuesday").

HOW TO WORK
- Use tools instead of guessing. When you refer to a specific file, make sure it is on screen (read_file, or show_file with a verbatim quote to highlight the passage you mean).
- PDFs and images are read by OCR via read_file. It may take a few seconds; that's fine.
- Email: always draft_email first. Only call send_email after the user clearly confirms. Use find_contact to get addresses.
- If the user tells you a lasting preference or fact about themselves, call remember.
- Everything outside the tools (real web, real Gmail) is unavailable; say so briefly if asked.

WORKSPACE FILES
${files || "(empty)"}

MEMORIES ABOUT ${USER_NAME.toUpperCase()}
${memories || "(none yet)"}

PENDING EMAIL DRAFTS
${drafts || "(none)"}`;
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/\*\*|__|`|#+\s/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .trim();
}

export async function runAgent(
  history: ChatTurn[],
  userText: string,
  lang: string | null,
  emit: (c: AgentChunk) => void,
) {
  const messages: ChatMessage[] = [
    { role: "system", content: await systemPrompt(lang) },
    ...history
      .slice(-12)
      .map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
    { role: "user", content: userText },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const { message } = await chat(messages, toolSpecs);
    const calls = message?.tool_calls ?? [];
    if (calls.length === 0) {
      const text =
        cleanForSpeech(message?.content ?? "") ||
        "Hmm, I didn't catch that. Try again?";
      emit({ t: "reply", text, lang: ttsLanguage(text, lang) });
      return;
    }
    messages.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: calls,
    });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {}
      emit({
        t: "status",
        text: STATUS[call.function.name]?.(args) ?? "Working on it…",
      });
      const result = await runTool(
        call.function.name,
        call.function.arguments,
        emit,
      );
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  const text =
    "That took more steps than I expected. Everything I found is on screen.";
  emit({ t: "reply", text, lang: ttsLanguage(text, lang) });
}
