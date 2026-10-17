import { db, getEmail, sendDraft } from "@/lib/db";

// Send / discard buttons on the draft card (the mock mail service).
export async function POST(req: Request) {
  const { action, id, edits } = (await req.json()) as {
    action: "send" | "discard";
    id: number;
    edits?: { to?: string; subject?: string; body?: string };
  };
  if (action === "discard") {
    db()
      .prepare("DELETE FROM emails WHERE id = ? AND folder = 'draft'")
      .run(id);
    return Response.json({ ok: true });
  }
  const email = sendDraft(id, edits);
  if (!email) {
    const existing = getEmail(id);
    return Response.json(
      { error: existing ? "Already sent" : "Draft not found", email: existing },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, email });
}
