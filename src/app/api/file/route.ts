import fs from "node:fs/promises";
import path from "node:path";
import { resolveSafe } from "@/lib/workspace";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/plain; charset=utf-8",
  ".json": "application/json",
};

// Raw workspace file, for previews in the UI.
export async function GET(req: Request) {
  const rel = new URL(req.url).searchParams.get("path") ?? "";
  try {
    const abs = resolveSafe(rel);
    const bytes = await fs.readFile(abs);
    return new Response(bytes, {
      headers: {
        "Content-Type":
          TYPES[path.extname(abs).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
