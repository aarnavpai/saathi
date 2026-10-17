import { nowLocalIso } from "@/lib/db";
import { runTool } from "@/lib/tools";
import type { AgentChunk } from "@/lib/types";

// Scripted turn that runs real tools without the LLM: a no-key preview of every
// card type, and a fallback for the live demo if the network dies. Open /?demo.

const today = nowLocalIso().slice(0, 10);
const weekOut = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
})();

const SCRIPT: [string, object, string][] = [
  ["list_files", { dir: "Documents" }, "Opening Documents…"],
  ["check_inbox", { query: "rent" }, "Checking your inbox…"],
  [
    "show_file",
    { path: "Notes/todo.md", quote: "Reply to landlord about rent revision" },
    "Pulling up Notes/todo.md…",
  ],
  ["list_events", { from: today, to: weekOut }, "Checking your calendar…"],
  ["find_contact", { query: "landlord" }, "Looking up landlord…"],
  [
    "draft_email",
    {
      to: "rajesh.kulkarni@gmail.com",
      subject: "Re: Rent revision from November",
      body: "Hi Rajesh ji,\n\nThanks for the heads-up. A 5% revision is in line with clause 4 of our agreement, so that works for me from 1st November.\n\nTuesday works for the plumber too.\n\nRegards",
      attachments: ["Documents/rent-agreement-2025.pdf"],
    },
    "Drafting the email…",
  ],
];

export async function POST() {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (c: AgentChunk) =>
        controller.enqueue(enc.encode(`${JSON.stringify(c)}\n`));
      for (const [name, args, status] of SCRIPT) {
        emit({ t: "status", text: status });
        await new Promise((r) => setTimeout(r, 450));
        await runTool(name, JSON.stringify(args), emit);
      }
      emit({
        t: "reply",
        text: "Rajesh ji ने rent 5% बढ़ाने का mail भेजा है, जो agreement के clause 4 के हिसाब से ठीक है। मैंने reply draft कर दिया है — भेज दूँ?",
        lang: "hi-IN",
      });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
