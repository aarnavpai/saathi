import { textToSpeech } from "@/lib/sarvam";

export async function POST(req: Request) {
  try {
    const { text, lang } = (await req.json()) as { text: string; lang: string };
    return Response.json({ audio: await textToSpeech(text, lang || "en-IN") });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
