import { cpSync, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { FileEntry, FileKind } from "./types";

// The workspace shipped with the app. Serverless filesystems (Vercel) are
// read-only except /tmp, so there it is copied to /tmp on first use and the
// assistant works on the copy (per instance, reset on cold start).
const BUNDLED = path.resolve("workspace");
export const ON_SERVERLESS = Boolean(process.env.VERCEL);

// Every file the assistant touches is confined to this directory.
export const ROOT = path.resolve(
  process.env.WORKSPACE_DIR ??
    (ON_SERVERLESS ? "/tmp/saathi/workspace" : "workspace"),
);

if (ROOT !== BUNDLED && !existsSync(ROOT) && existsSync(BUNDLED)) {
  cpSync(BUNDLED, ROOT, { recursive: true });
}

const TEXT_EXT = new Set([
  ".md",
  ".txt",
  ".csv",
  ".json",
  ".log",
  ".yaml",
  ".yml",
  ".ts",
  ".js",
  ".py",
  ".html",
]);
const DOC_EXT = new Set([".pdf"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function kindOf(name: string): FileKind {
  const ext = path.extname(name).toLowerCase();
  if (TEXT_EXT.has(ext)) return "text";
  if (DOC_EXT.has(ext)) return "doc";
  if (IMAGE_EXT.has(ext)) return "image";
  return "other";
}

/** Resolve a workspace-relative path, refusing anything that escapes ROOT. */
export function resolveSafe(rel: string): string {
  const cleaned = (rel ?? "")
    .replace(/^[/\\]+/, "")
    .replace(/^workspace[/\\]/, "");
  const abs = path.resolve(ROOT, cleaned);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    throw new Error(`Path is outside the workspace: ${rel}`);
  }
  return abs;
}

export function toRel(abs: string): string {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

export async function entryFor(abs: string): Promise<FileEntry> {
  const st = await fs.stat(abs);
  const name = path.basename(abs);
  return {
    name,
    path: toRel(abs),
    type: st.isDirectory() ? "dir" : "file",
    kind: st.isDirectory() ? "other" : kindOf(name),
    size: st.size,
    mtime: Math.floor(st.mtimeMs),
  };
}

export async function listDir(rel: string): Promise<FileEntry[]> {
  const abs = resolveSafe(rel);
  const names = (await fs.readdir(abs)).filter((n) => !n.startsWith("."));
  const entries = await Promise.all(
    names.map((n) => entryFor(path.join(abs, n))),
  );
  return entries.sort((a, b) =>
    a.type === b.type
      ? a.name.localeCompare(b.name)
      : a.type === "dir"
        ? -1
        : 1,
  );
}

export async function walk(limit = 500): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  async function rec(abs: string) {
    for (const n of await fs.readdir(abs)) {
      if (n.startsWith(".") || out.length >= limit) continue;
      const child = path.join(abs, n);
      const e = await entryFor(child);
      if (e.type === "dir") await rec(child);
      else out.push(e);
    }
  }
  await rec(ROOT);
  return out;
}

export async function readText(rel: string, max = 200_000): Promise<string> {
  const buf = await fs.readFile(resolveSafe(rel));
  return buf.subarray(0, max).toString("utf8");
}

/** Creates or overwrites a text file; refuses to clobber non-text files. */
export async function writeText(
  rel: string,
  content: string,
): Promise<FileEntry> {
  if (kindOf(rel) !== "text")
    throw new Error("Can only write text files (.md, .txt, ...)");
  const abs = resolveSafe(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  return entryFor(abs);
}
