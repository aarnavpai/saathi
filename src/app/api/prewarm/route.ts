import { after } from "next/server";
import { prewarm } from "@/lib/documents";

export const maxDuration = 120;

// Called on page load so PDFs are already OCR'd when the user asks about them.
// "?status" reports progress without queueing anything.
export async function POST(req: Request) {
  try {
    const kick = !new URL(req.url).searchParams.has("status");
    const { queued, cached, done } = await prewarm(kick);
    // Keeps a serverless function alive until the background OCR finishes.
    after(() => done);
    return Response.json({ queued, cached });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
