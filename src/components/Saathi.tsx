"use client";

import {
  ArrowUp,
  AudioLines,
  Keyboard,
  Loader2,
  Mic,
  ScanText,
  Square,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Player, Recorder } from "@/lib/client/audio";
import type { AgentChunk, ChatTurn, FileEntry, UiEvent } from "@/lib/types";
import { Card, type CardActions, FileIcon, fileUrl } from "./Cards";
import { Character, PHASE_COLOR, type Phase } from "./Character";

const MAX_CARDS = 6;

const SUGGESTIONS = [
  "What's in my Documents folder?",
  "Society notice mein kya likha hai?",
  "What's on my calendar this week?",
  "Landlord ka mail padho aur agreement check karo",
];

const LANG_LABEL: Record<string, string> = {
  "en-IN": "English",
  "hi-IN": "हिन्दी",
  "bn-IN": "বাংলা",
  "ta-IN": "தமிழ்",
  "te-IN": "తెలుగు",
  "kn-IN": "ಕನ್ನಡ",
  "ml-IN": "മലയാളം",
  "mr-IN": "मराठी",
  "gu-IN": "ગુજરાતી",
  "pa-IN": "ਪੰਜਾਬੀ",
  "od-IN": "ଓଡ଼ିଆ",
};

function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export function Saathi() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [cards, setCards] = useState<UiEvent[]>([]);
  const [status, setStatus] = useState("");
  const [userLine, setUserLine] = useState("");
  const [reply, setReply] = useState("");
  const [lang, setLang] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [typing, setTyping] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const handsFreeRef = useRef(false);
  handsFreeRef.current = handsFree;
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<FileEntry | null>(null);
  const [docInfo, setDocInfo] = useState<{
    queued: number;
    cached: number;
  } | null>(null);

  const history = useRef<ChatTurn[]>([]);
  const turn = useRef<AbortController | null>(null);
  const demoStarted = useRef(false);
  const recorder = useRef<Recorder | null>(null);
  const player = useRef<Player | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const holding = useRef(false);
  const tapMode = useRef(false);
  phaseRef.current = phase;
  const wide = useIsWide();

  useEffect(() => {
    player.current = new Player();
    // Start OCR of all documents, then poll until Sarvam Vision is done.
    let stop = false;
    let url = "/api/prewarm";
    const tick = async (n: number) => {
      try {
        const d = await (await fetch(url, { method: "POST" })).json();
        url = "/api/prewarm?status";
        if (stop || !d.queued) return;
        setDocInfo({ queued: d.queued.length, cached: d.cached.length });
        if (d.queued.length && n < 60) setTimeout(() => tick(n + 1), 4000);
      } catch {}
    };
    void tick(0);
    return () => {
      stop = true;
    };
  }, []);

  const upsert = useCallback((e: UiEvent) => {
    setCards((cs) => {
      const i = cs.findIndex((c) => c.id === e.id);
      if (i >= 0) return cs.map((c, j) => (j === i ? e : c));
      return [...cs, e].slice(-MAX_CARDS);
    });
  }, []);

  const speak = useCallback(async (text: string, replyLang: string) => {
    setPhase("speaking");
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: replyLang }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (phaseRef.current !== "speaking") return; // interrupted while fetching
      await player.current?.play(data.audio);
    } catch (e) {
      setError(`Voice: ${(e as Error).message}`);
    }
    if (phaseRef.current === "speaking") setPhase("idle");
  }, []);

  const ask = useCallback(
    async (
      text: string,
      spokenLang: string | null,
      endpoint = "/api/agent",
    ) => {
      if (!text.trim()) return;
      // A new question supersedes any turn still streaming.
      turn.current?.abort();
      const ctl = new AbortController();
      turn.current = ctl;
      player.current?.unlock();
      player.current?.stop();
      setError("");
      setUserLine(text);
      setReply("");
      setStatus("Thinking…");
      setCards([]);
      setPhase("thinking");

      let finalText = "";
      let finalLang = "en-IN";
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          signal: ctl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history: history.current,
            text,
            lang: spokenLang,
          }),
        });
        if (!res.body) throw new Error("No response stream");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl = buf.indexOf("\n");
          while (nl >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            nl = buf.indexOf("\n");
            if (!line) continue;
            const c = JSON.parse(line) as AgentChunk;
            if (c.t === "status") setStatus(c.text);
            else if (c.t === "ui") upsert(c.event);
            else if (c.t === "reply") {
              finalText = c.text;
              finalLang = c.lang;
            } else if (c.t === "error") throw new Error(c.message);
          }
        }
      } catch (e) {
        if (ctl.signal.aborted) return;
        setError((e as Error).message);
        setStatus("");
        setPhase("idle");
        return;
      }
      if (ctl.signal.aborted) return;
      setStatus("");
      if (!finalText) return setPhase("idle");
      history.current = [
        ...history.current,
        { role: "user" as const, content: text },
        { role: "assistant" as const, content: finalText },
      ].slice(-16);
      setReply(finalText);
      await speak(finalText, finalLang);
    },
    [speak, upsert],
  );

  // /?demo replays a scripted turn (real tools, no LLM) — see api/demo.
  useEffect(() => {
    if (demoStarted.current) return;
    demoStarted.current = true;
    if (new URLSearchParams(window.location.search).has("demo")) {
      void ask(
        "Landlord ka mail padho aur reply draft karo",
        "hi-IN",
        "/api/demo",
      );
    }
  }, [ask]);

  const startListening = useCallback(async () => {
    if (phaseRef.current === "listening" || phaseRef.current === "transcribing")
      return;
    holding.current = true;
    player.current?.unlock();
    player.current?.stop(); // barge-in
    setError("");
    try {
      const rec = new Recorder();
      recorder.current = rec;
      await rec.start();
      phaseRef.current = "listening";
      setPhase("listening");
      setStatus("Listening…");
      // Released before the mic finished starting.
      if (!holding.current) void stopRef.current();
    } catch (e) {
      setError(`Microphone: ${(e as Error).message}`);
      setPhase("idle");
    }
  }, []);

  const stopListening = useCallback(async () => {
    holding.current = false;
    tapMode.current = false;
    const rec = recorder.current;
    if (!rec || phaseRef.current !== "listening") return;
    recorder.current = null;
    setPhase("transcribing");
    setStatus("Transcribing…");
    const { wav, seconds } = await rec.stop();
    if (seconds < 0.5) {
      setStatus("");
      setPhase("idle");
      return;
    }
    try {
      const form = new FormData();
      form.append("file", wav, "speech.wav");
      const r = await fetch("/api/stt", { method: "POST", body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (!data.transcript?.trim()) {
        setStatus("");
        setPhase("idle");
        setError("Didn't catch that — try again?");
        return;
      }
      setLang(data.lang);
      await ask(data.transcript, data.lang);
    } catch (e) {
      setError((e as Error).message);
      setStatus("");
      setPhase("idle");
    }
  }, [ask]);

  // Drop a file anywhere: upload to workspace/Uploads and ask about it.
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      const form = new FormData();
      form.append("file", file);
      try {
        const r = await fetch("/api/upload", { method: "POST", body: form });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        void ask(
          `I just added ${data.entry.path}. Read it and tell me briefly what it is and anything I need to act on.`,
          lang,
        );
      } catch (err) {
        setError(`Upload: ${(err as Error).message}`);
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [ask, lang]);

  const stopRef = useRef(stopListening);
  stopRef.current = stopListening;

  // Hold space to talk (unless typing in a field); Esc stops speech.
  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        player.current?.stop();
        if (phaseRef.current === "speaking") setPhase("idle");
      }
      if (e.code !== "Space" || e.repeat || isField(e.target)) return;
      e.preventDefault();
      void startListening();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isField(e.target)) return;
      e.preventDefault();
      void stopListening();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startListening, stopListening]);

  useEffect(() => {
    const rec = recorder.current;
    if (!rec) return;
    rec.onAutoStop = () => void stopListening();
    rec.onSilence = () => {
      if (handsFreeRef.current || tapMode.current) void stopListening();
    };
    rec.onNoSpeech = () => {
      if (!handsFreeRef.current && !tapMode.current) return;
      setHandsFree(false); // nobody's talking; stop the loop
      void stopListening();
    };
  });

  // Hands-free: whenever Saathi is idle again, start listening.
  useEffect(() => {
    if (!handsFree || phase !== "idle" || error) return;
    const t = setTimeout(() => void startListening(), 350);
    return () => clearTimeout(t);
  }, [handsFree, phase, error, startListening]);

  // Mic button: only a press that began on it counts, not a hover-out.
  // A quick tap toggles listening (auto-stops on a pause); a hold is push-to-talk.
  const pointerHeld = useRef(false);
  const pointerDownAt = useRef(0);

  const getLevel = useCallback(
    () =>
      phaseRef.current === "listening"
        ? (recorder.current?.level ?? 0)
        : (player.current?.level() ?? 0),
    [],
  );

  const actions: CardActions = {
    onOpen: setPreview,
    onAsk: (q) => void ask(q, null),
    onDismiss: (id) => setCards((cs) => cs.filter((c) => c.id !== id)),
    onReplace: upsert,
  };

  // Keep the newest card in view when a column overflows.
  const newest = cards.at(-1)?.id;
  useEffect(() => {
    if (!newest) return;
    const t = setTimeout(() => {
      document
        .querySelector(`[data-card="${newest}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 350);
    return () => clearTimeout(t);
  }, [newest]);

  const left = wide ? cards.filter((_, i) => i % 2 === 0) : [];
  const right = wide ? cards.filter((_, i) => i % 2 === 1) : [];
  const busy = phase === "thinking" || phase === "transcribing";
  const color = PHASE_COLOR[phase];

  const column = (list: UiEvent[], side: "left" | "right" | "below") => (
    <AnimatePresence mode="popLayout">
      {list.map((c) => (
        <motion.div
          key={c.id}
          data-card={c.id}
          layout
          initial={{
            opacity: 0,
            scale: 0.3,
            x: side === "left" ? 260 : side === "right" ? -260 : 0,
            y: side === "below" ? -120 : 40,
          }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, filter: "blur(6px)" }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="w-full"
        >
          <Card e={c} actions={actions} />
        </motion.div>
      ))}
    </AnimatePresence>
  );

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[#07060d] text-white">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute top-1/3 left-1/2 size-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.12] blur-[120px]"
          animate={{ backgroundColor: color }}
          transition={{ duration: 1 }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      {/* header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div
            className="size-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 12px ${color}` }}
          />
          <span className="text-lg font-semibold tracking-tight">saathi</span>
          <span className="hidden text-xs text-white/35 sm:inline">
            your files · mail · calendar, by voice
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/50">
          {docInfo && (
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 sm:inline-flex">
              <ScanText className="size-3.5 text-rose-300" />
              {docInfo.queued > 0
                ? `Sarvam Vision reading ${docInfo.queued} docs`
                : `${docInfo.cached} docs indexed`}
            </span>
          )}
          {lang && (
            <span className="rounded-full border border-white/10 px-2.5 py-1">
              {LANG_LABEL[lang] ?? lang}
            </span>
          )}
        </div>
      </header>

      {/* stage */}
      <main className="relative z-10 mx-auto grid min-h-0 w-full max-w-[1400px] flex-1 grid-cols-1 items-center gap-6 overflow-y-auto px-4 lg:overflow-visible lg:grid-cols-[minmax(0,1fr)_320px_minmax(0,1fr)] lg:px-8">
        <div className="hidden h-full min-h-0 flex-col items-end overflow-y-auto py-2 [scrollbar-width:none] lg:flex">
          <div className="my-auto flex w-full max-w-md flex-col gap-4">
            {column(left, "left")}
          </div>
        </div>

        <div className="sticky top-0 z-20 flex flex-col items-center justify-center bg-[#07060d]/70 py-4 backdrop-blur-md lg:static lg:bg-transparent lg:backdrop-blur-none">
          <Character
            phase={phase}
            getLevel={getLevel}
            size={wide ? 260 : 130}
          />
          <div className="mt-3 h-6 text-center text-sm lg:mt-6">
            <AnimatePresence mode="wait">
              {status && (
                <motion.div
                  key={status}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="inline-flex items-center gap-2 text-white/60"
                >
                  {busy && <Loader2 className="size-3.5 animate-spin" />}
                  {status}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="hidden h-full min-h-0 flex-col items-start overflow-y-auto py-2 [scrollbar-width:none] lg:flex">
          <div className="my-auto flex w-full max-w-md flex-col gap-4">
            {column(right, "right")}
          </div>
        </div>

        {!wide && (
          <div className="flex flex-col gap-4">{column(cards, "below")}</div>
        )}
      </main>

      {/* dock */}
      <footer className="relative z-10 mx-auto w-full max-w-3xl px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 min-h-16 text-center">
          {userLine && (
            <div className="mb-1.5 text-sm text-white/40">“{userLine}”</div>
          )}
          <AnimatePresence mode="wait">
            {reply && (
              <motion.p
                key={reply}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-lg leading-snug text-white/90 text-balance"
              >
                {reply}
              </motion.p>
            )}
          </AnimatePresence>
          {!userLine && !reply && phase === "idle" && (
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => void ask(s, null)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-white/60 transition hover:border-white/25 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {error && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200">
              {error}
              <button
                type="button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3">
          <AnimatePresence initial={false} mode="popLayout">
            {typing ? (
              <motion.form
                key="type"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "100%" }}
                exit={{ opacity: 0, width: 0 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(draft, null);
                  setDraft("");
                }}
                className="flex max-w-xl flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1.5 pr-1.5 pl-5 backdrop-blur"
              >
                <input
                  ref={(el) => el?.focus()}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask Saathi anything…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
                />
                <button
                  type="submit"
                  className="grid size-9 place-items-center rounded-full bg-white text-black disabled:opacity-40"
                  disabled={!draft.trim() || busy}
                >
                  <ArrowUp className="size-4" />
                </button>
              </motion.form>
            ) : null}
          </AnimatePresence>

          <motion.button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              if (phaseRef.current === "listening" && tapMode.current) {
                void stopListening(); // second tap ends the turn
                return;
              }
              pointerHeld.current = true;
              pointerDownAt.current = performance.now();
              if (phase === "speaking") {
                player.current?.stop();
                setPhase("idle");
              }
              void startListening();
            }}
            onPointerUp={() => {
              if (!pointerHeld.current) return;
              pointerHeld.current = false;
              if (performance.now() - pointerDownAt.current < 400) {
                tapMode.current = true;
                holding.current = true; // keep the mic open after release
                return;
              }
              void stopListening();
            }}
            onPointerLeave={() => {
              if (!pointerHeld.current) return;
              pointerHeld.current = false;
              void stopListening();
            }}
            whileTap={{ scale: 0.92 }}
            disabled={busy}
            className="relative grid size-16 shrink-0 place-items-center rounded-full text-black shadow-lg transition disabled:opacity-60"
            style={{ background: color, boxShadow: `0 0 40px ${color}66` }}
            aria-label="Hold to talk"
          >
            {phase === "listening" ? (
              <Square className="size-5 fill-current" />
            ) : busy ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <Mic className="size-6" />
            )}
          </motion.button>

          <button
            type="button"
            onClick={() => {
              player.current?.unlock();
              setError("");
              setHandsFree((h) => !h);
            }}
            className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${handsFree ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-200" : "border-white/10 text-white/60 hover:text-white"}`}
            aria-label={
              handsFree ? "Stop conversation mode" : "Conversation mode"
            }
            aria-pressed={handsFree}
            title="Conversation mode: just talk, no buttons"
          >
            <AudioLines className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => setTyping((t) => !t)}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 text-white/60 transition hover:text-white"
            aria-label={typing ? "Close keyboard" : "Type instead"}
          >
            {typing ? (
              <X className="size-4" />
            ) : (
              <Keyboard className="size-4" />
            )}
          </button>
        </div>
        <div className="mt-3 text-center text-[11px] text-white/30">
          Hold{" "}
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono">
            space
          </kbd>{" "}
          or the mic to talk (or tap it once) ·{" "}
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono">
            esc
          </kbd>{" "}
          to interrupt ·{" "}
          {handsFree ? (
            <span className="text-cyan-300/80">
              conversation mode on — just talk
            </span>
          ) : (
            <>
              <AudioLines className="inline size-3" /> for hands-free
            </>
          )}
        </div>
      </footer>

      {/* drop overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            className="pointer-events-none fixed inset-4 z-40 grid place-items-center rounded-3xl border-2 border-dashed border-violet-300/60 bg-violet-500/10 backdrop-blur-sm"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex flex-col items-center gap-3 text-violet-100">
              <Upload className="size-10" />
              <div className="text-lg font-medium">
                Drop to hand this to Saathi
              </div>
              <div className="text-sm text-violet-200/60">
                PDFs, photos and scans are read by Sarvam Vision
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* file preview */}
      <AnimatePresence>
        {preview && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreview(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#14131f]"
            >
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                <FileIcon entry={preview} className="size-5" />
                <span className="flex-1 truncate text-sm">{preview.path}</span>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
                  aria-label="Close preview"
                >
                  <X className="size-4" />
                </button>
              </div>
              {preview.kind === "image" ? (
                // biome-ignore lint/performance/noImgElement: local dynamic preview
                <img
                  src={fileUrl(preview.path)}
                  alt={preview.name}
                  className="min-h-0 flex-1 bg-white object-contain"
                />
              ) : (
                <iframe
                  title={preview.name}
                  src={fileUrl(preview.path)}
                  className="min-h-0 flex-1 bg-white"
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
