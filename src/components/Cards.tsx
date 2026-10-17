"use client";

import {
  Brain,
  CalendarDays,
  CalendarPlus,
  Check,
  ExternalLink,
  File,
  FileImage,
  FileText,
  Folder,
  Inbox,
  Languages,
  type LucideIcon,
  Mail,
  MailCheck,
  NotebookPen,
  Paperclip,
  ScanText,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { CalEvent, Email, FileEntry, UiEvent } from "@/lib/types";

// ---------- helpers ----------

export const fileUrl = (p: string) => `/api/file?path=${encodeURIComponent(p)}`;

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtWhen(iso: string, withDay = true) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (!withDay) return time;
  return `${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · ${time}`;
}

export function FileIcon({
  entry,
  className,
}: {
  entry: Pick<FileEntry, "type" | "kind">;
  className?: string;
}) {
  const I =
    entry.type === "dir"
      ? Folder
      : entry.kind === "image"
        ? FileImage
        : entry.kind === "other"
          ? File
          : FileText;
  const color =
    entry.type === "dir"
      ? "text-amber-300"
      : entry.kind === "doc"
        ? "text-rose-300"
        : entry.kind === "image"
          ? "text-emerald-300"
          : "text-sky-300";
  return <I className={`${color} ${className ?? ""}`} />;
}

function Shell({
  icon: Icon,
  tint,
  title,
  subtitle,
  action,
  children,
  onDismiss,
}: {
  icon: LucideIcon;
  tint: string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className="group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#14131f]/80 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${tint}, transparent)`,
        }}
      />
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
        <div
          className="grid size-8 shrink-0 place-items-center rounded-lg"
          style={{ background: `${tint}22`, color: tint }}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{title}</div>
          {subtitle && (
            <div className="truncate text-xs text-white/45">{subtitle}</div>
          )}
        </div>
        {action}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-white/30 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {children && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ---------- individual cards ----------

function FolderCard({
  e,
  onOpen,
  onAsk,
}: {
  e: Extract<UiEvent, { kind: "folder" }>;
  onOpen: (f: FileEntry) => void;
  onAsk: (q: string) => void;
}) {
  return (
    <Shell
      icon={Folder}
      tint="#fbbf24"
      title={e.dir === "/" ? "Workspace" : e.dir}
      subtitle={`${e.entries.length} items`}
    >
      <div className="grid grid-cols-3 gap-2">
        {e.entries.map((f, i) => (
          <motion.button
            type="button"
            key={f.path}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            onClick={() =>
              f.type === "dir"
                ? onAsk(`What's in my ${f.path} folder?`)
                : onOpen(f)
            }
            className="flex flex-col items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.03] p-2.5 text-center transition hover:border-white/20 hover:bg-white/[0.07]"
          >
            <FileIcon entry={f} className="size-7" />
            <span className="line-clamp-2 w-full break-all text-[11px] leading-tight text-white/75">
              {f.name}
            </span>
          </motion.button>
        ))}
      </div>
    </Shell>
  );
}

function highlightText(text: string, quote?: string): ReactNode {
  if (!quote) return text;
  const lower = text.toLowerCase();
  let q = quote.trim().toLowerCase();
  let idx = lower.indexOf(q);
  // Models often paraphrase slightly; fall back to the first few words.
  if (idx < 0 && q.length > 24) {
    q = q.slice(0, 24);
    idx = lower.indexOf(q);
  }
  if (idx < 0) return text;
  const end =
    q.length === quote.trim().length
      ? idx + q.length
      : Math.min(text.length, idx + quote.trim().length);
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-300/90 px-0.5 text-black">
        {text.slice(idx, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function FileCard({
  e,
  onOpen,
  onDismiss,
}: {
  e: Extract<UiEvent, { kind: "file" }>;
  onOpen: (f: FileEntry) => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current
      ?.querySelector("mark")
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);
  const vision = e.source === "vision";
  return (
    <Shell
      icon={vision ? ScanText : FileText}
      tint={vision ? "#fb7185" : "#38bdf8"}
      title={e.file.name}
      subtitle={
        <>
          {e.file.path} · {fmtSize(e.file.size)}
          {vision && e.status === "ready" && (
            <span className="ml-1.5 text-rose-300/80">
              · read by Sarvam Vision
            </span>
          )}
        </>
      }
      action={
        <button
          type="button"
          onClick={() => onOpen(e.file)}
          className="rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
          aria-label="Open file"
        >
          <ExternalLink className="size-3.5" />
        </button>
      }
      onDismiss={onDismiss}
    >
      {e.file.kind === "image" && (
        // biome-ignore lint/performance/noImgElement: local dynamic preview
        <img
          src={fileUrl(e.file.path)}
          alt={e.file.name}
          className="mb-3 max-h-40 w-full rounded-lg bg-white object-cover object-top"
        />
      )}
      {e.status === "loading" ? (
        <div className="relative space-y-2 overflow-hidden rounded-lg bg-white/[0.03] p-3">
          {[90, 75, 85, 60, 80].map((w) => (
            <div
              key={w}
              className="h-2.5 rounded bg-white/10"
              style={{ width: `${w}%` }}
            />
          ))}
          <motion.div
            className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-rose-400/30 to-transparent"
            animate={{ top: ["-20%", "100%"] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          />
          <div className="pt-1 text-xs text-rose-200/80">
            Sarvam Vision is reading this document…
          </div>
        </div>
      ) : (
        <div
          ref={ref}
          className={`max-h-52 overflow-y-auto rounded-lg bg-black/30 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap ${e.status === "error" ? "text-rose-300" : "text-white/70"}`}
        >
          {highlightText(e.preview || "(empty)", e.highlight)}
        </div>
      )}
    </Shell>
  );
}

function SearchCard({
  e,
  onOpen,
}: {
  e: Extract<UiEvent, { kind: "search" }>;
  onOpen: (f: FileEntry) => void;
}) {
  return (
    <Shell
      icon={Search}
      tint="#818cf8"
      title={`“${e.query}”`}
      subtitle={`${e.results.length} matches`}
    >
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {e.results.length === 0 && (
          <div className="text-xs text-white/40">Nothing found.</div>
        )}
        {e.results.map((r) => (
          <button
            type="button"
            key={r.path + (r.line ?? "")}
            onClick={() =>
              onOpen({
                name: r.name,
                path: r.path,
                type: "file",
                kind: "text",
                size: 0,
                mtime: 0,
              })
            }
            className="block w-full rounded-lg bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.07]"
          >
            <div className="text-xs font-medium text-white/85">{r.path}</div>
            {r.line && (
              <div className="mt-0.5 truncate text-[11px] text-white/45">
                {r.line}
              </div>
            )}
          </button>
        ))}
      </div>
    </Shell>
  );
}

function NoteCard({ e }: { e: Extract<UiEvent, { kind: "note" }> }) {
  return (
    <Shell icon={NotebookPen} tint="#34d399" title="Saved" subtitle={e.path}>
      <div className="max-h-48 overflow-y-auto rounded-lg bg-emerald-400/[0.06] p-3 text-xs leading-relaxed whitespace-pre-wrap text-emerald-50/80">
        {e.content}
      </div>
    </Shell>
  );
}

function EmailDraftCard({
  email,
  onSent,
  onDismiss,
}: {
  email: Email;
  onSent: (e: Email) => void;
  onDismiss: () => void;
}) {
  const [to, setTo] = useState(email.to);
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function act(action: "send" | "discard") {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        id: email.id,
        edits: { to, subject, body },
      }),
    });
    const data = await r.json();
    setBusy(false);
    if (action === "discard") return onDismiss();
    if (!r.ok) return setErr(data.error ?? "Failed");
    onSent(data.email);
  }

  const field =
    "w-full bg-transparent text-white/90 outline-none placeholder:text-white/30";
  return (
    <Shell
      icon={Mail}
      tint="#60a5fa"
      title="Email draft"
      subtitle="Review, edit, then send — or just say “send it”"
    >
      <div className="space-y-2 rounded-xl bg-white/[0.03] p-3 text-xs">
        <label className="flex items-center gap-2 border-b border-white/5 pb-2">
          <span className="w-12 text-white/40">To</span>
          <input
            className={field}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 border-b border-white/5 pb-2">
          <span className="w-12 text-white/40">Subject</span>
          <input
            className={`${field} font-medium`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <textarea
          className={`${field} max-h-40 min-h-24 resize-y leading-relaxed`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {email.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {email.attachments.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/70"
              >
                <Paperclip className="size-3" />
                {a.split("/").pop()}
              </span>
            ))}
          </div>
        )}
      </div>
      {err && <div className="mt-2 text-xs text-rose-300">{err}</div>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => act("send")}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-400 disabled:opacity-50"
        >
          <Send className="size-3.5" /> Send
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("discard")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10 disabled:opacity-50"
        >
          <Trash2 className="size-3.5" /> Discard
        </button>
      </div>
    </Shell>
  );
}

function EmailSentCard({ email }: { email: Email }) {
  return (
    <Shell
      icon={MailCheck}
      tint="#4ade80"
      title={`Sent to ${email.to}`}
      subtitle={email.subject}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-2 rounded-lg bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200"
      >
        <Check className="size-4" /> Delivered via Saathi Mail (mock)
      </motion.div>
    </Shell>
  );
}

function InboxCard({ e }: { e: Extract<UiEvent, { kind: "inbox" }> }) {
  const [open, setOpen] = useState<number | null>(
    e.emails.length === 1 ? e.emails[0].id : null,
  );
  return (
    <Shell
      icon={Inbox}
      tint="#60a5fa"
      title="Inbox"
      subtitle={e.query ? `matching “${e.query}”` : `${e.emails.length} recent`}
    >
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {e.emails.length === 0 && (
          <div className="text-xs text-white/40">No emails.</div>
        )}
        {e.emails.map((m) => (
          <button
            type="button"
            key={m.id}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            className="block w-full rounded-lg bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.07]"
          >
            <div className="flex items-center gap-2">
              {!m.read && (
                <span className="size-1.5 shrink-0 rounded-full bg-blue-400" />
              )}
              <span className="truncate text-xs font-medium text-white/85">
                {m.subject}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-white/35">
                {fmtWhen(m.createdAt)}
              </span>
            </div>
            <div className="truncate text-[11px] text-white/45">{m.from}</div>
            {open === m.id && (
              <div className="mt-2 text-[11.5px] leading-relaxed whitespace-pre-wrap text-white/70">
                {m.body}
              </div>
            )}
          </button>
        ))}
      </div>
    </Shell>
  );
}

function EventRow({ ev }: { ev: CalEvent }) {
  const d = new Date(ev.start);
  return (
    <div className="flex gap-3 rounded-lg bg-white/[0.03] p-2.5">
      <div className="flex w-11 shrink-0 flex-col items-center rounded-md bg-violet-400/10 py-1 text-violet-200">
        <span className="text-[9px] uppercase">
          {d.toLocaleDateString("en-IN", { month: "short" })}
        </span>
        <span className="text-base leading-none font-semibold">
          {d.getDate()}
        </span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-white/90">
          {ev.title}
        </div>
        <div className="text-[11px] text-white/45">
          {fmtWhen(ev.start)} – {fmtWhen(ev.end, false)}
        </div>
        {ev.location && (
          <div className="truncate text-[11px] text-white/35">
            {ev.location}
          </div>
        )}
      </div>
    </div>
  );
}

function EventsCard({ e }: { e: Extract<UiEvent, { kind: "events" }> }) {
  return (
    <Shell
      icon={CalendarDays}
      tint="#a78bfa"
      title="Calendar"
      subtitle={e.range}
    >
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {e.events.length === 0 && (
          <div className="text-xs text-white/40">Nothing scheduled.</div>
        )}
        {e.events.map((ev) => (
          <EventRow key={ev.id} ev={ev} />
        ))}
      </div>
    </Shell>
  );
}

function EventCreatedCard({
  e,
}: {
  e: Extract<UiEvent, { kind: "event_created" }>;
}) {
  return (
    <Shell icon={CalendarPlus} tint="#4ade80" title="Added to calendar">
      <EventRow ev={e.event} />
    </Shell>
  );
}

function ContactsCard({ e }: { e: Extract<UiEvent, { kind: "contacts" }> }) {
  return (
    <Shell
      icon={Users}
      tint="#2dd4bf"
      title="Contacts"
      subtitle={`${e.contacts.length} found`}
    >
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {e.contacts.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-2"
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-400/15 text-xs font-semibold text-teal-200">
              {c.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-white/90">
                {c.name}{" "}
                <span className="font-normal text-white/40">
                  · {c.relation}
                </span>
              </div>
              <div className="truncate text-[11px] text-white/45">
                {c.email}
                {c.phone && ` · ${c.phone}`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

function TranslationCard({
  e,
}: {
  e: Extract<UiEvent, { kind: "translation" }>;
}) {
  return (
    <Shell
      icon={Languages}
      tint="#fb923c"
      title="Sarvam Translate"
      subtitle={`→ ${e.lang}`}
    >
      <div className="text-[11.5px] leading-relaxed text-white/40">
        {e.source}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-2 rounded-lg bg-orange-400/[0.08] p-3 text-sm leading-relaxed text-orange-50/90"
      >
        {e.target}
      </motion.div>
    </Shell>
  );
}

function MemoryCard({ e }: { e: Extract<UiEvent, { kind: "memory" }> }) {
  return (
    <Shell icon={Brain} tint="#f472b6" title="I'll remember that">
      <div className="text-xs text-white/70">{e.fact}</div>
    </Shell>
  );
}

// ---------- dispatcher ----------

export interface CardActions {
  onOpen: (f: FileEntry) => void;
  onAsk: (q: string) => void;
  onDismiss: (id: string) => void;
  onReplace: (e: UiEvent) => void;
}

export function Card({ e, actions }: { e: UiEvent; actions: CardActions }) {
  const dismiss = () => actions.onDismiss(e.id);
  switch (e.kind) {
    case "folder":
      return <FolderCard e={e} onOpen={actions.onOpen} onAsk={actions.onAsk} />;
    case "file":
      return <FileCard e={e} onOpen={actions.onOpen} onDismiss={dismiss} />;
    case "search":
      return <SearchCard e={e} onOpen={actions.onOpen} />;
    case "note":
      return <NoteCard e={e} />;
    case "email_draft":
      return (
        <EmailDraftCard
          email={e.email}
          onDismiss={dismiss}
          onSent={(email) =>
            actions.onReplace({ kind: "email_sent", id: e.id, email })
          }
        />
      );
    case "email_sent":
      return <EmailSentCard email={e.email} />;
    case "inbox":
      return <InboxCard e={e} />;
    case "events":
      return <EventsCard e={e} />;
    case "event_created":
      return <EventCreatedCard e={e} />;
    case "contacts":
      return <ContactsCard e={e} />;
    case "translation":
      return <TranslationCard e={e} />;
    case "memory":
      return <MemoryCard e={e} />;
  }
}
