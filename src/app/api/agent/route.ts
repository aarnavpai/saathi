import { runAgent } from "@/lib/agent";
import type { AgentChunk, ChatTurn } from "@/lib/types";

export const maxDuration = 120;

// Streams NDJSON: status lines and UI cards while tools run, then the reply.
export async function POST(req: Request) {
  const { history, text, lang } = (await req.json()) as {
    history: ChatTurn[];
    text: string;
    lang: string | null;
  };
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (c: AgentChunk) =>
        controller.enqueue(enc.encode(`${JSON.stringify(c)}\n`));
      try {
        await runAgent(history ?? [], text, lang, emit);
      } catch (e) {
        emit({ t: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
