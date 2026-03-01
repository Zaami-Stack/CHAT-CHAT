import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticatedRequest } from "@/lib/server-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type SeenBody = {
  reader?: string;
  messageIds?: number[];
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function sanitizeName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "You";
  }
  return cleaned.slice(0, 40);
}

function normalizeMessageIds(input: number[] | undefined) {
  if (!Array.isArray(input)) {
    return [];
  }
  const unique = new Set<number>();
  input.forEach((value) => {
    if (Number.isInteger(value) && value > 0) {
      unique.add(value);
    }
  });
  return Array.from(unique).slice(0, 300);
}

export async function POST(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return unauthorized();
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server is missing Supabase configuration." },
      { status: 500 },
    );
  }

  let body: SeenBody;
  try {
    body = (await request.json()) as SeenBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const reader = sanitizeName(body.reader || "");
  const messageIds = normalizeMessageIds(body.messageIds);

  if (messageIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const nowIso = new Date().toISOString();
  const rows = messageIds.map((messageId) => ({
    message_id: messageId,
    reader_name: reader,
    seen_at: nowIso,
  }));

  const { error } = await supabase
    .from("message_reads")
    .upsert(rows, { onConflict: "message_id,reader_name" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
