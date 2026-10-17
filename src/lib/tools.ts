import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import {
  db,
  getEmail,
  localIso,
  sendDraft,
  toContact,
  toEmail,
  toEvent,
  USER_EMAIL,
} from "./db";
import { cachedDocument, readDocument } from "./documents";
import { type ToolSpec, translate } from "./sarvam";
import type { AgentChunk, FileEntry } from "./types";
import {
  entryFor,
  listDir,
  readText,
  resolveSafe,
  walk,
  writeText,
} from "./workspace";

type Emit = (c: AgentChunk) => void;
type Args = Record<string, unknown>;

interface Tool {
  spec: ToolSpec;
  run: (args: Args, emit: Emit) => Promise<unknown>;
}

const uid = () => randomUUID().slice(0, 8);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const MAX_TO_MODEL = 6000;

function tool(
  name: string,
  description: string,
  properties: Record<string, object>,
  required: string[],
  run: Tool["run"],
): Tool {
  return {
    spec: {
      type: "function",
      function: {
        name,
        description,
        parameters: { type: "object", properties, required },
      },
    },
    run,
  };
}

const S = (description: string) => ({ type: "string", description });

/** Text of any workspace file; PDFs/images go through Sarvam Vision OCR. */
async function fileText(
  entry: FileEntry,
  emit: Emit,
  cardId: string,
): Promise<string> {
  if (entry.kind === "text") return readText(entry.path);
  if (entry.kind === "doc" || entry.kind === "image") {
    if (cachedDocument(entry.path, entry.mtime) === null) {
      emit({ t: "status", text: `Reading ${entry.name} with Sarvam Vision…` });
      emit({
        t: "ui",
        event: {
          kind: "file",
          id: cardId,
          file: entry,
          status: "loading",
          source: "vision",
          preview: "",
        },
      });
    }
    return readDocument(entry.path);
  }
  throw new Error(`Can't read ${entry.name}: unsupported file type`);
}

const tools: Tool[] = [
  tool(
    "list_files",
    "List files and folders in a workspace directory. Use '' for the workspace root.",
    {
      dir: S(
        "Directory relative to the workspace root, e.g. '' or 'Documents'",
      ),
    },
    [],
    async (a, emit) => {
      const dir = str(a.dir);
      const entries = await listDir(dir);
      emit({
        t: "ui",
        event: { kind: "folder", id: uid(), dir: dir || "/", entries },
      });
      return entries.map((e) => ({
        name: e.name,
        path: e.path,
        type: e.type,
        size: e.size,
      }));
    },
  ),

  tool(
    "read_file",
    "Read a file's contents and show it to the user. Works for text, PDFs and images (scanned documents are OCR'd, including Indian languages).",
    { path: S("File path relative to the workspace root") },
    ["path"],
    async (a, emit) => {
      const entry = await entryFor(resolveSafe(str(a.path)));
      const id = uid();
      try {
        const text = await fileText(entry, emit, id);
        emit({
          t: "ui",
          event: {
            kind: "file",
            id,
            file: entry,
            status: "ready",
            source: entry.kind === "text" ? "text" : "vision",
            preview: text.slice(0, 4000),
          },
        });
        return {
          path: entry.path,
          content: text.slice(0, MAX_TO_MODEL),
          truncated: text.length > MAX_TO_MODEL,
        };
      } catch (e) {
        emit({
          t: "ui",
          event: {
            kind: "file",
            id,
            file: entry,
            status: "error",
            source: "vision",
            preview: (e as Error).message,
          },
        });
        throw e;
      }
    },
  ),

  tool(
    "show_file",
    "Put a file on screen, optionally highlighting the exact passage you are talking about. Use this when citing a specific line or figure.",
    {
      path: S("File path relative to the workspace root"),
      quote: S("Exact text from the file to highlight (copy it verbatim)"),
    },
    ["path"],
    async (a, emit) => {
      const entry = await entryFor(resolveSafe(str(a.path)));
      const id = uid();
      const text =
        entry.kind === "other" ? "" : await fileText(entry, emit, id);
      emit({
        t: "ui",
        event: {
          kind: "file",
          id,
          file: entry,
          status: "ready",
          source: entry.kind === "text" ? "text" : "vision",
          preview: text.slice(0, 4000),
          highlight: str(a.quote) || undefined,
        },
      });
      return { shown: entry.path };
    },
  ),

  tool(
    "search_files",
    "Search file names and contents across the whole workspace (including already-scanned PDFs).",
    { query: S("Words to look for") },
    ["query"],
    async (a, emit) => {
      const query = str(a.query).toLowerCase().trim();
      const words = query.split(/\s+/).filter((w) => w.length > 2);
      const matches = (s: string) => {
        const l = s.toLowerCase();
        return (
          l.includes(query) ||
          (words.length > 0 && words.every((w) => l.includes(w)))
        );
      };
      const results: { path: string; name: string; line?: string }[] = [];
      for (const e of await walk()) {
        if (results.length >= 12) break;
        if (matches(e.name) || matches(e.path)) {
          results.push({ path: e.path, name: e.name });
          continue;
        }
        let text: string | null = null;
        if (e.kind === "text" && e.size < 200_000)
          text = await fs.readFile(resolveSafe(e.path), "utf8");
        else if (e.kind === "doc" || e.kind === "image")
          text = cachedDocument(e.path, e.mtime);
        const line = text?.split("\n").find(matches);
        if (line)
          results.push({
            path: e.path,
            name: e.name,
            line: line.trim().slice(0, 160),
          });
      }
      emit({
        t: "ui",
        event: { kind: "search", id: uid(), query: str(a.query), results },
      });
      return results;
    },
  ),

  tool(
    "write_note",
    "Create or overwrite a text/markdown file in the workspace (default folder: Notes/).",
    {
      path: S("File path, e.g. 'Notes/goa-packing-list.md'"),
      content: S("Full file contents (markdown)"),
    },
    ["path", "content"],
    async (a, emit) => {
      let p = str(a.path);
      if (!p.includes("/")) p = `Notes/${p}`;
      const entry = await writeText(p, str(a.content));
      emit({
        t: "ui",
        event: {
          kind: "note",
          id: uid(),
          path: entry.path,
          content: str(a.content),
        },
      });
      return { saved: entry.path };
    },
  ),

  tool(
    "find_contact",
    "Look up people in the user's contacts by name or relation (e.g. 'landlord', 'maa', 'Priya'). Returns emails and phone numbers.",
    { query: S("Name, relation or email fragment; empty for all") },
    [],
    async (a, emit) => {
      const q = `%${str(a.query).toLowerCase()}%`;
      const contacts = (
        db()
          .prepare(
            "SELECT * FROM contacts WHERE lower(name) LIKE ? OR lower(relation) LIKE ? OR lower(email) LIKE ?",
          )
          .all(q, q, q) as Record<string, unknown>[]
      ).map(toContact);
      emit({ t: "ui", event: { kind: "contacts", id: uid(), contacts } });
      return contacts;
    },
  ),

  tool(
    "check_inbox",
    "Read the user's email inbox, optionally filtered by sender or subject words.",
    { query: S("Optional filter, e.g. 'rent' or 'hr'") },
    [],
    async (a, emit) => {
      const q = `%${str(a.query).toLowerCase()}%`;
      const emails = (
        db()
          .prepare(
            "SELECT * FROM emails WHERE folder = 'inbox' AND (lower(subject) LIKE ? OR lower(from_addr) LIKE ? OR lower(body) LIKE ?) ORDER BY created_at DESC LIMIT 8",
          )
          .all(q, q, q) as Record<string, unknown>[]
      ).map(toEmail);
      db().prepare("UPDATE emails SET read = 1 WHERE folder = 'inbox'").run();
      emit({
        t: "ui",
        event: { kind: "inbox", id: uid(), query: str(a.query), emails },
      });
      return emails.map(({ id, from, subject, body, createdAt, read }) => ({
        id,
        from,
        subject,
        body,
        createdAt,
        unread: !read,
      }));
    },
  ),

  tool(
    "draft_email",
    "Draft an email and show it to the user for review. Does NOT send. Look up the recipient with find_contact first if you only know a name.",
    {
      to: S("Recipient email address"),
      subject: S("Subject line"),
      body: S("Email body, plain text, signed with the user's name"),
      attachments: {
        type: "array",
        items: { type: "string" },
        description: "Workspace file paths to attach",
      },
    },
    ["to", "subject", "body"],
    async (a, emit) => {
      const attachments = Array.isArray(a.attachments)
        ? a.attachments.map(String)
        : [];
      for (const p of attachments) await entryFor(resolveSafe(p)); // throws if missing
      const r = db()
        .prepare(
          "INSERT INTO emails (folder, from_addr, to_addr, subject, body, attachments, created_at, read) VALUES ('draft', ?, ?, ?, ?, ?, datetime('now','localtime'), 1)",
        )
        .run(
          USER_EMAIL,
          str(a.to),
          str(a.subject),
          str(a.body),
          JSON.stringify(attachments),
        );
      const email = getEmail(Number(r.lastInsertRowid));
      if (!email) throw new Error("draft not saved");
      emit({
        t: "ui",
        event: { kind: "email_draft", id: `draft-${email.id}`, email },
      });
      return {
        draft_id: email.id,
        status: "shown to user, awaiting confirmation",
      };
    },
  ),

  tool(
    "send_email",
    "Send a previously drafted email. Only call this after the user has explicitly confirmed (e.g. 'send it', 'haan bhej do').",
    {
      draft_id: {
        type: "integer",
        description: "Draft id from draft_email; omit for the latest draft",
      },
    },
    [],
    async (a, emit) => {
      let id = Number(a.draft_id);
      if (!id) {
        const row = db()
          .prepare(
            "SELECT id FROM emails WHERE folder = 'draft' ORDER BY id DESC LIMIT 1",
          )
          .get() as { id: number } | undefined;
        if (!row) throw new Error("No pending draft");
        id = row.id;
      }
      const email = sendDraft(id);
      if (!email) throw new Error(`Draft ${id} not found or already sent`);
      emit({
        t: "ui",
        event: { kind: "email_sent", id: `draft-${id}`, email },
      });
      return { sent: true, to: email.to, subject: email.subject };
    },
  ),

  tool(
    "list_events",
    "List calendar events between two dates (inclusive).",
    { from: S("Start date YYYY-MM-DD"), to: S("End date YYYY-MM-DD") },
    ["from", "to"],
    async (a, emit) => {
      const from = str(a.from);
      const to = str(a.to) || from;
      const events = (
        db()
          .prepare(
            "SELECT * FROM events WHERE substr(start,1,10) BETWEEN ? AND ? ORDER BY start",
          )
          .all(from, to) as Record<string, unknown>[]
      ).map(toEvent);
      emit({
        t: "ui",
        event: {
          kind: "events",
          id: uid(),
          range: from === to ? from : `${from} → ${to}`,
          events,
        },
      });
      return events;
    },
  ),

  tool(
    "create_event",
    "Add an event to the user's calendar.",
    {
      title: S("Event title"),
      start: S("Local start time, YYYY-MM-DDTHH:MM"),
      end: S(
        "Local end time, YYYY-MM-DDTHH:MM (default: one hour after start)",
      ),
      location: S("Optional location"),
      attendees: {
        type: "array",
        items: { type: "string" },
        description: "Attendee emails",
      },
    },
    ["title", "start"],
    async (a, emit) => {
      const start = str(a.start);
      let end = str(a.end);
      if (!end) {
        const d = new Date(start);
        d.setHours(d.getHours() + 1);
        end = Number.isNaN(d.getTime()) ? start : localIso(d);
      }
      const attendees = Array.isArray(a.attendees)
        ? a.attendees.map(String)
        : [];
      const r = db()
        .prepare(
          "INSERT INTO events (title, start, end, location, attendees) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          str(a.title),
          start,
          end,
          str(a.location),
          JSON.stringify(attendees),
        );
      const event = toEvent(
        db()
          .prepare("SELECT * FROM events WHERE id = ?")
          .get(Number(r.lastInsertRowid)) as Record<string, unknown>,
      );
      emit({ t: "ui", event: { kind: "event_created", id: uid(), event } });
      return event;
    },
  ),

  tool(
    "translate_text",
    "Translate text into another Indian language with Sarvam Translate (e.g. a message or summary for someone who prefers Marathi). Shows the translation on screen.",
    {
      text: S("Text to translate (max ~1000 characters)"),
      target_language: S(
        "Target language code: en-IN, hi-IN, bn-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, pa-IN or od-IN",
      ),
    },
    ["text", "target_language"],
    async (a, emit) => {
      const target = str(a.target_language, "hi-IN");
      const translated = await translate(str(a.text), target);
      emit({
        t: "ui",
        event: {
          kind: "translation",
          id: uid(),
          source: str(a.text),
          target: translated,
          lang: target,
        },
      });
      return { translated };
    },
  ),

  tool(
    "remember",
    "Save a long-term fact or preference about the user so you remember it in future conversations.",
    { fact: S("The fact, in one short sentence") },
    ["fact"],
    async (a, emit) => {
      db()
        .prepare("INSERT INTO memories (fact, created_at) VALUES (?, ?)")
        .run(str(a.fact), new Date().toISOString());
      emit({
        t: "ui",
        event: { kind: "memory", id: uid(), fact: str(a.fact) },
      });
      return { saved: true };
    },
  ),
];

export const toolSpecs = tools.map((t) => t.spec);

export async function runTool(
  name: string,
  rawArgs: string,
  emit: Emit,
): Promise<string> {
  const t = tools.find((x) => x.spec.function.name === name);
  if (!t) return JSON.stringify({ error: `Unknown tool ${name}` });
  let args: Args = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return JSON.stringify({ error: "Arguments were not valid JSON" });
  }
  try {
    return JSON.stringify(await t.run(args, emit));
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message });
  }
}
