import { prewarm } from "@/lib/documents";

// Called on page load so PDFs are already OCR'd when the user asks about them.
// "?status" reports progress without queueing anything.
export async function POST(req: Request) {
  try {
    const kick = !new URL(req.url).searchParams.has("status");
    return Response.json(await prewarm(kick));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
