import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticatedRequest } from "@/lib/server-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type CreateMessageBody = {
  content?: string;
  sender?: string;
  replyToId?: number | null;
};

type UpdateMessageBody = {
  id?: number;
  sender?: string;
  action?: "edit" | "delete" | "pin";
  content?: string;
  pinned?: boolean;
};

const MESSAGE_SELECT = `
  id,
  content,
  sender_email,
  reply_to_id,
  is_pinned,
  pinned_at,
  edited_at,
  is_deleted,
  created_at,
  message_reads(reader_name, seen_at)
`;

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

function normalizeMessageId(input: number | undefined) {
  if (!Number.isInteger(input) || !input || input <= 0) {
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
    .select(MESSAGE_SELECT)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
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
    .select(MESSAGE_SELECT)
    .single();

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "The replied-to message does not exist anymore." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}

export async function PATCH(request: NextRequest) {
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

  let body: UpdateMessageBody;
  try {
    body = (await request.json()) as UpdateMessageBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: "Action is required." }, { status: 400 });
  }

  const messageId = normalizeMessageId(body.id);
  if (!messageId) {
    return NextResponse.json({ error: "Valid message id is required." }, { status: 400 });
  }

  const actor = sanitizeName(body.sender || "");
  const nowIso = new Date().toISOString();

  if (action === "pin") {
    const shouldPin = Boolean(body.pinned);
    const { data, error } = await supabase
      .from("messages")
      .update({
        is_pinned: shouldPin,
        pinned_at: shouldPin ? nowIso : null,
      })
      .eq("id", messageId)
      .select(MESSAGE_SELECT)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Message not found." }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: data });
  }

  const { data: existing, error: existingError } = await supabase
    .from("messages")
    .select("id, sender_email, is_deleted")
    .eq("id", messageId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  if (sanitizeName(existing.sender_email) !== actor) {
    return NextResponse.json(
      { error: "You can only modify your own messages." },
      { status: 403 },
    );
  }

  if (action === "delete") {
    const { data, error } = await supabase
      .from("messages")
      .update({
        content: "[message deleted]",
        is_deleted: true,
        edited_at: nowIso,
      })
      .eq("id", messageId)
      .select(MESSAGE_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: data });
  }

  if (existing.is_deleted) {
    return NextResponse.json(
      { error: "Deleted messages cannot be edited." },
      { status: 400 },
    );
  }

  const content = body.content?.trim() || "";
  if (!content) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }
  if (content.length > 1000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .update({
      content,
      edited_at: nowIso,
    })
    .eq("id", messageId)
    .select(MESSAGE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}
