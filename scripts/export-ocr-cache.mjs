#!/usr/bin/env node
// Writes the local OCR cache (data/saathi.db → doc_cache) to seed/ocr-cache.json,
// which deployments load so the demo documents never need re-reading.
// Run the app locally until the header says "N docs indexed", then:
//   node scripts/export-ocr-cache.mjs

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(process.env.WORKSPACE_DIR ?? "workspace");
const db = new DatabaseSync(
  path.resolve(process.env.SAATHI_DB ?? "data/saathi.db"),
);
const rows = db
  .prepare("SELECT path, markdown FROM doc_cache ORDER BY path")
  .all();

const out = [];
for (const r of rows) {
  const abs = path.join(root, r.path);
  if (!fs.existsSync(abs) || r.path.startsWith("Uploads/")) continue;
  out.push({ path: r.path, size: fs.statSync(abs).size, markdown: r.markdown });
}
fs.mkdirSync("seed", { recursive: true });
fs.writeFileSync("seed/ocr-cache.json", `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${out.length} documents to seed/ocr-cache.json`);
