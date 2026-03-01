import { NextResponse, type NextRequest } from "next/server";
import {
  createSessionToken,
  getSessionCookieOptions,
  verifySecretWord,
} from "@/lib/server-auth";

type LoginRequestBody = {
  passphrase?: string;
};

export async function POST(request: NextRequest) {
  const configuredWord = process.env.CHAT_SECRET_WORD?.trim();
  if (!configuredWord) {
    return NextResponse.json(
      { error: "Server is missing CHAT_SECRET_WORD configuration." },
      { status: 500 },
    );
  }

  let body: LoginRequestBody;
  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const passphrase = body.passphrase?.trim() || "";
  if (!passphrase) {
    return NextResponse.json({ error: "Secret word is required." }, { status: 400 });
  }

  if (!verifySecretWord(passphrase)) {
    return NextResponse.json({ error: "Wrong secret word." }, { status: 401 });
  }

  const token = createSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: "Server session secret is not configured." },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ ok: true });
  const cookie = getSessionCookieOptions();
  response.cookies.set({
    ...cookie,
    value: token,
  });

  return response;
}
