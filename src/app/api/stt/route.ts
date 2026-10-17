import { speechToText } from "@/lib/sarvam";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob))
      return Response.json({ error: "missing file" }, { status: 400 });
    return Response.json(await speechToText(file));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
