import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CalEvent, Contact, Email } from "./types";

// Single SQLite file backing the mock "online services" (mail, calendar,
// contacts), the assistant's long-term memory and the Doc AI OCR cache.

const DB_PATH = path.resolve(process.env.SAATHI_DB ?? "data/saathi.db");

const g = globalThis as unknown as { __saathiDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__saathiDb) return g.__saathiDb;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY, name TEXT, email TEXT, phone TEXT, relation TEXT);
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY, folder TEXT, from_addr TEXT, to_addr TEXT,
      subject TEXT, body TEXT, attachments TEXT DEFAULT '[]',
      created_at TEXT, read INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, title TEXT, start TEXT, end TEXT,
      location TEXT DEFAULT '', attendees TEXT DEFAULT '[]', notes TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY, fact TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS doc_cache (
      path TEXT PRIMARY KEY, mtime INTEGER, markdown TEXT, updated_at TEXT);
  `);
  seed(d);
  g.__saathiDb = d;
  return d;
}

export const USER_EMAIL = process.env.SAATHI_USER_EMAIL ?? "me@saathi.local";

// ---------- seed ----------

export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return localIso(d);
}

function seed(d: DatabaseSync) {
  const n = d.prepare("SELECT COUNT(*) AS n FROM contacts").get() as {
    n: number;
  };
  if (n.n > 0) return;

  const contact = d.prepare(
    "INSERT INTO contacts (name, email, phone, relation) VALUES (?, ?, ?, ?)",
  );
  for (const c of [
    [
      "Rajesh Kulkarni",
      "rajesh.kulkarni@gmail.com",
      "+91 98450 11223",
      "landlord",
    ],
    ["Priya Menon", "priya.menon@techwave.in", "+91 99000 45612", "manager"],
    ["Maa", "sunita.home@gmail.com", "+91 94480 77001", "mother"],
    [
      "Karthik Rao",
      "karthik.rao@gmail.com",
      "+91 97411 32019",
      "friend, Goa trip",
    ],
    [
      "Ananya Iyer",
      "ananya@hackblr.org",
      "+91 90080 55210",
      "hackathon organiser",
    ],
    ["HR Team", "hr@techwave.in", "", "employer HR"],
    [
      "Dr. Sameer Joshi",
      "clinic@joshihealth.in",
      "+91 80 4123 9988",
      "family doctor",
    ],
  ]) {
    contact.run(...c);
  }

  const email = d.prepare(
    "INSERT INTO emails (folder, from_addr, to_addr, subject, body, attachments, created_at, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const inbox: [string, string, string, number, number][] = [
    [
      "rajesh.kulkarni@gmail.com",
      "Rent revision from November",
      "Hi,\n\nAs per clause 4 of our agreement, I am revising the monthly rent by 5% from 1st November. Please confirm. Also, the plumber will visit on Tuesday.\n\nRegards,\nRajesh Kulkarni",
      -1,
      0,
    ],
    [
      "hr@techwave.in",
      "Payslip for September 2026",
      "Dear Employee,\n\nYour payslip for September 2026 is now available. Please reach out for any discrepancies before 25th October.\n\nHR Team, TechWave",
      -3,
      1,
    ],
    [
      "noreply@indigo-air.example",
      "Schedule change: 6E 6213 BLR → GOX",
      "Your flight 6E 6213 on 31 Oct has been rescheduled. New departure 07:40 (was 06:15). No action is needed if the new timing works for you.",
      0,
      0,
    ],
    [
      "sunita.home@gmail.com",
      "Diwali ka plan?",
      "Beta, Diwali pe ghar aa rahe ho na? Papa puch rahe the tickets kab book karoge. Aur woh dal makhani recipe bhi bhej dena jo tumne mujhe sunayi thi.",
      0,
      0,
    ],
    [
      "ananya@hackblr.org",
      "Vibeathon: final submission checklist",
      "Hi hackers! Submit your demo video + repo link by 6:30 PM today. Judging criteria: creativity, use of Sarvam APIs, polish.",
      0,
      1,
    ],
  ];
  for (const [from, subject, body, day, read] of inbox) {
    email.run(
      "inbox",
      from,
      USER_EMAIL,
      subject,
      body,
      "[]",
      at(day, 9 + Math.abs(day)),
      read,
    );
  }

  const ev = d.prepare(
    "INSERT INTO events (title, start, end, location, attendees, notes) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const e of [
    [
      "Vibeathon judging",
      at(0, 18, 30),
      at(0, 19, 30),
      "HackBLR, Koramangala",
      ["ananya@hackblr.org"],
      "",
    ],
    [
      "Sprint planning",
      at(2, 10),
      at(2, 11),
      "Google Meet",
      ["priya.menon@techwave.in"],
      "Bring Q4 roadmap",
    ],
    [
      "Plumber visit",
      at(3, 11),
      at(3, 12),
      "Home",
      ["rajesh.kulkarni@gmail.com"],
      "",
    ],
    [
      "Dentist – Dr. Joshi",
      at(5, 17),
      at(5, 17, 30),
      "Joshi Health, Indiranagar",
      [],
      "",
    ],
    [
      "Flight to Goa (6E 6213)",
      at(14, 7, 40),
      at(14, 9, 0),
      "Kempegowda Intl. T1",
      ["karthik.rao@gmail.com"],
      "",
    ],
  ] as const) {
    ev.run(e[0], e[1], e[2], e[3], JSON.stringify(e[4]), e[5]);
  }

  d.prepare("INSERT INTO memories (fact, created_at) VALUES (?, ?)").run(
    "Prefers short answers, and switches between Hindi and English.",
    new Date().toISOString(),
  );
}

// ---------- row mappers ----------

type Row = Record<string, unknown>;

export function toEmail(r: Row): Email {
  return {
    id: Number(r.id),
    folder: r.folder as Email["folder"],
    from: String(r.from_addr),
    to: String(r.to_addr),
    subject: String(r.subject),
    body: String(r.body),
    attachments: JSON.parse(String(r.attachments || "[]")),
    createdAt: String(r.created_at),
    read: Boolean(r.read),
  };
}

export function toEvent(r: Row): CalEvent {
  return {
    id: Number(r.id),
    title: String(r.title),
    start: String(r.start),
    end: String(r.end),
    location: String(r.location ?? ""),
    attendees: JSON.parse(String(r.attendees || "[]")),
    notes: String(r.notes ?? ""),
  };
}

export function toContact(r: Row): Contact {
  return {
    id: Number(r.id),
    name: String(r.name),
    email: String(r.email),
    phone: String(r.phone ?? ""),
    relation: String(r.relation ?? ""),
  };
}

export function getEmail(id: number): Email | null {
  const r = db().prepare("SELECT * FROM emails WHERE id = ?").get(id) as
    | Row
    | undefined;
  return r ? toEmail(r) : null;
}

export function sendDraft(
  id: number,
  edits?: Partial<Pick<Email, "to" | "subject" | "body">>,
): Email | null {
  const e = getEmail(id);
  if (!e || e.folder !== "draft") return null;
  db()
    .prepare(
      "UPDATE emails SET folder = 'sent', to_addr = ?, subject = ?, body = ?, created_at = ? WHERE id = ?",
    )
    .run(
      edits?.to ?? e.to,
      edits?.subject ?? e.subject,
      edits?.body ?? e.body,
      localIso(new Date()),
      id,
    );
  return getEmail(id);
}

export function nowLocalIso() {
  return localIso(new Date());
}
