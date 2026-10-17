import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { digitise } from "./sarvam";
import { entryFor, resolveSafe, walk } from "./workspace";

// OCR results from Sarvam Vision, cached in SQLite by (path, mtime) so each
// document is only sent once, even across restarts.

const g = globalThis as unknown as {
  __saathiInflight?: Map<string, Promise<string>>;
};
if (!g.__saathiInflight) g.__saathiInflight = new Map();
const inflight = g.__saathiInflight;

export function cachedDocument(rel: string, mtime: number): string | null {
  const row = db()
    .prepare("SELECT markdown FROM doc_cache WHERE path = ? AND mtime = ?")
    .get(rel, mtime) as { markdown: string } | undefined;
  return row?.markdown ?? null;
}

export async function readDocument(rel: string): Promise<string> {
  const abs = resolveSafe(rel);
  const entry = await entryFor(abs);
  const hit = cachedDocument(entry.path, entry.mtime);
  if (hit !== null) return hit;

  const key = `${entry.path}@${entry.mtime}`;
  let job = inflight.get(key);
  if (!job) {
    job = (async () => {
      const bytes = await fs.readFile(abs);
      const ext = path.extname(abs).toLowerCase();
      const type =
        ext === ".pdf"
          ? "application/pdf"
          : ext === ".png"
            ? "image/png"
            : "image/jpeg";
      const md = await digitise(new Blob([bytes], { type }), entry.name);
      db()
        .prepare(
          "INSERT OR REPLACE INTO doc_cache (path, mtime, markdown, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run(entry.path, entry.mtime, md, new Date().toISOString());
      return md;
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}

/**
 * OCR every uncached PDF/image, one at a time. Returns immediately; `done`
 * resolves when the background work finishes (pass it to `after()`).
 */
export async function prewarm(kick = true): Promise<{
  queued: string[];
  cached: string[];
  done: Promise<void>;
}> {
  const docs = (await walk()).filter(
    (e) => e.kind === "doc" || e.kind === "image",
  );
  const queued: string[] = [];
  const cached: string[] = [];
  for (const e of docs) {
    (cachedDocument(e.path, e.mtime) === null ? queued : cached).push(e.path);
  }
  const done =
    kick && queued.length
      ? (async () => {
          for (const p of queued) {
            try {
              await readDocument(p);
              console.log(`[prewarm] read ${p}`);
            } catch (err) {
              console.warn(`[prewarm] ${p}:`, (err as Error).message);
            }
          }
        })()
      : Promise.resolve();
  return { queued, cached, done };
}
