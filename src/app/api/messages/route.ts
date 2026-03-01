import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticatedRequest } from "@/lib/server-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type CreateMessageBody = {
  content?: string;
  sender?: string;
  replyToId?: number | null;
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

function normalizeReplyToId(input: number | null | undefined) {
  if (input == null) {
    return null;
  }
  if (!Number.isInteger(input) || input <= 0) {
    return null;
  }
  return input;
}

export async function GET(request: NextRequest) {
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

  const { data, error } = await supabase
    .from("messages")
    .select("id, content, sender_email, reply_to_id, created_at")
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "The replied-to message does not exist anymore." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? [] });
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

  let body: CreateMessageBody;
  try {
    body = (await request.json()) as CreateMessageBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const content = body.content?.trim() || "";
  if (!content) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }
  if (content.length > 1000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const sender = sanitizeName(body.sender || "");
  const replyToId = normalizeReplyToId(body.replyToId);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      content,
      sender_email: sender,
      reply_to_id: replyToId,
    })
    .select("id, content, sender_email, reply_to_id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}
