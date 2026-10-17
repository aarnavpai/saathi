# UI

Next.js 16 App Router, React 19, Tailwind v4, `motion` (Framer Motion) for
animation, `lucide-react` icons. One page: `src/components/Saathi.tsx`.

## Layout

```
┌ header: saathi · OCR progress chip · detected-language badge ─────────┐
│                                                                        │
│   [card]            ┌──────────────┐            [card]                 │
│   [card]  ← fly ←   │  character   │   → fly →  [card]                 │
│   [card]            │  status line │            [card]                 │
│                     └──────────────┘                                   │
│            "what you said"                                             │
│            Saathi's reply (large)                                      │
│            ( 🎙 )  [⌨]                                                 │
└────────────────────────────────────────────────────────────────────────┘
```

- Desktop (≥1024 px): a 3-column grid. Cards alternate left/right and spring
  out *from the character*: initial `x` is offset toward the centre and
  `scale: 0.3`, so each card appears to be thrown out of it. Columns scroll
  independently (scrollbars hidden) and auto-scroll to the newest card.
- Mobile: the character shrinks and sticks to the top, and cards stack below
  it, dropping in from above.
- At most 6 cards are kept per turn; a new question clears them with a blurred
  exit animation.
- The page is fixed to the viewport height so the mic dock never scrolls away.

## The character (`Character.tsx`)

A hand-built SVG: a glossy violet orb with a leaf sprout, eyes, cheeks and a
mouth. Everything reacts to a `phase` and a per-frame `getLevel()`:

| Phase | Colour | Behaviour |
|---|---|---|
| `idle` | violet | gentle float, blinking, pupils follow the cursor |
| `listening` | cyan | eyes widen, ripples pulse outward, aura grows with mic volume |
| `transcribing` / `thinking` | amber | eyes look up, sprout wiggles, three dots orbit |
| `speaking` | pink | mouth opens with the **real TTS amplitude** (Web Audio analyser), body pulses slightly |

The phase colour also tints the page's background glow, the header dot and the
mic button, so the whole screen tells you what state it's in.

Level → motion values via `useAnimationFrame` + `useSpring`, so 60 fps
animation never re-renders React.

## Cards (`Cards.tsx`)

All cards share a glass `Shell` (icon chip tinted per type, title, subtitle,
optional action and dismiss button, gradient top highlight).

| Kind | Content | Interaction |
|---|---|---|
| `folder` | Grid of file/folder tiles, staggered in | File → preview modal; folder → asks Saathi about it |
| `file` | Name, path, size; image thumbnail; text preview. `loading` state shows a scanning beam + "Sarvam Vision is reading…" | `highlight` is wrapped in `<mark>` and scrolled into view; open button → preview modal |
| `search` | Matching paths + matching line | Click → preview |
| `note` | Saved path + content | — |
| `email_draft` | Editable To / Subject / Body, attachment chips | **Send** / **Discard** call `/api/email` with your edits; card flips to `email_sent` |
| `email_sent` | Confirmation with check animation | — |
| `inbox` | Sender, subject, time, unread dot | Click to expand body |
| `events` / `event_created` | Date tile + title, time range, location | — |
| `contacts` | Avatar initial, name, relation, email, phone | — |
| `translation` | Original (dim) and translated text | — |
| `memory` | The remembered fact | — |

The preview modal renders images directly and everything else (PDF, text) in
an iframe from `/api/file`.

## Interaction model

- **Hold space** (when not typing in a field) or **hold the mic button** to
  talk; release to send. Taps under 0.5 s are ignored. A release that lands
  before the mic has finished starting is remembered and honoured.
- **Conversation mode** (waveform button): hands-free. Saathi listens,
  ends your turn after ~1.3 s of silence (simple RMS voice-activity check in
  `Recorder`), answers, then listens again. It switches itself off after 10 s
  with no speech, or on any error, so it can't loop forever.
- The mic button only stops on release/leave if the press began on it, so
  hovering across it never cuts off a spacebar or hands-free recording.
- **Esc** or starting to talk interrupts Saathi mid-sentence (barge-in).
- **Keyboard button** opens a text field; typed questions go through the same
  pipeline (no STT).
- **Drag and drop** any PDF, image or text file onto the page: it's saved to
  `workspace/Uploads/` (`/api/upload`, type/size checked, filename sanitised)
  and Saathi is immediately asked to read it and summarise what needs action.
- Suggestion chips on the empty state run sample questions in one click.
- Errors (missing key, mic denied, API failures) appear as a dismissible pill
  under the caption; the UI always returns to `idle`.
