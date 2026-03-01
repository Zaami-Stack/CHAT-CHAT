import { NextResponse } from "next/server";
import { getSessionCookieOptions } from "@/lib/server-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cookie = getSessionCookieOptions();
  response.cookies.set({
    ...cookie,
    value: "",
    maxAge: 0,
  });
  return response;
}
