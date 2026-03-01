import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticatedRequest } from "@/lib/server-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type TypingBody = {
  sender?: string;
  isTyping?: boolean;
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

  const self = sanitizeName(request.nextUrl.searchParams.get("self") || "");
  const activeSince = new Date(Date.now() - 8_000).toISOString();

  let query = supabase
    .from("typing_status")
    .select("sender_name")
    .gte("updated_at", activeSince)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (self) {
    query = query.neq("sender_name", self);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    typing: (data ?? []).map((item) => item.sender_name),
  });
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

  let body: TypingBody;
  try {
    body = (await request.json()) as TypingBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sender = sanitizeName(body.sender || "");
  const isTyping = Boolean(body.isTyping);

  if (isTyping) {
    const { error } = await supabase.from("typing_status").upsert(
      {
        sender_name: sender,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sender_name" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("typing_status")
      .delete()
      .eq("sender_name", sender);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
