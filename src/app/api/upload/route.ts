import fs from "node:fs/promises";
import path from "node:path";
import { entryFor, kindOf, resolveSafe } from "@/lib/workspace";

// Drag-and-drop onto the page: files land in workspace/Uploads/.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "missing file" }, { status: 400 });
    }
    const name = path.basename(file.name).replace(/[^\w.\- ]+/g, "_");
    if (kindOf(name) === "other") {
      return Response.json(
        { error: "Unsupported file type (use PDF, image or text)" },
        { status: 415 },
      );
    }
    if (file.size > 20 * 1024 * 1024) {
      return Response.json(
        { error: "File too large (20 MB max)" },
        { status: 413 },
      );
    }
    const abs = resolveSafe(`Uploads/${name}`);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, Buffer.from(await file.arrayBuffer()));
    return Response.json({ entry: await entryFor(abs) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
