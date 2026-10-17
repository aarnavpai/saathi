// Shared between the API routes and the browser.

export type FileKind = "text" | "doc" | "image" | "other";

export interface FileEntry {
  name: string;
  path: string; // relative to the workspace root, always "/"-separated
  type: "file" | "dir";
  kind: FileKind;
  size: number;
  mtime: number;
}

export interface Email {
  id: number;
  folder: "inbox" | "sent" | "draft";
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments: string[];
  createdAt: string;
  read: boolean;
}

export interface CalEvent {
  id: number;
  title: string;
  start: string; // local ISO, e.g. 2026-10-18T10:00
  end: string;
  location: string;
  attendees: string[];
  notes: string;
}

export interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  relation: string;
}

// Every UI event carries an id; the client upserts by id so a tool can send a
// "loading" card first and replace it with the finished one later.
export type UiEvent =
  | { kind: "folder"; id: string; dir: string; entries: FileEntry[] }
  | {
      kind: "file";
      id: string;
      file: FileEntry;
      status: "loading" | "ready" | "error";
      source: "text" | "vision";
      preview: string;
      highlight?: string;
    }
  | {
      kind: "search";
      id: string;
      query: string;
      results: { path: string; name: string; line?: string }[];
    }
  | { kind: "note"; id: string; path: string; content: string }
  | { kind: "email_draft"; id: string; email: Email }
  | { kind: "email_sent"; id: string; email: Email }
  | { kind: "inbox"; id: string; query: string; emails: Email[] }
  | { kind: "events"; id: string; range: string; events: CalEvent[] }
  | { kind: "event_created"; id: string; event: CalEvent }
  | { kind: "contacts"; id: string; contacts: Contact[] }
  | { kind: "memory"; id: string; fact: string }
  | {
      kind: "translation";
      id: string;
      source: string;
      target: string;
      lang: string;
    };

// NDJSON lines streamed by POST /api/agent.
export type AgentChunk =
  | { t: "status"; text: string }
  | { t: "ui"; event: UiEvent }
  | { t: "reply"; text: string; lang: string }
  | { t: "error"; message: string };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
