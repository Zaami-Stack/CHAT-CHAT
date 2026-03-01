import crypto from "node:crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "lovechat_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  iat: number;
};

function getSessionSecret() {
  const fromEnv = process.env.APP_SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    return fromEnv;
  }
  const fromWord = process.env.CHAT_SECRET_WORD?.trim();
  if (fromWord && fromWord.length >= 6) {
    return fromWord;
  }
  return null;
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPart(dataPart: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(dataPart).digest("base64url");
}

function safeEqualString(left: string, right: string) {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

export function verifySecretWord(input: string) {
  const expected = process.env.CHAT_SECRET_WORD?.trim();
  if (!expected) {
    return false;
  }
  return safeEqualString(input.trim(), expected);
}

export function createSessionToken() {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }
  const payload: SessionPayload = { iat: Math.floor(Date.now() / 1000) };
  const dataPart = toBase64Url(JSON.stringify(payload));
  const signaturePart = signPart(dataPart, secret);
  return `${dataPart}.${signaturePart}`;
}

export function isAuthenticatedRequest(request: NextRequest) {
  const secret = getSessionSecret();
  if (!secret) {
    return false;
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return false;
  }

  const [dataPart, signaturePart] = token.split(".");
  if (!dataPart || !signaturePart) {
    return false;
  }

  const expectedSignature = signPart(dataPart, secret);
  if (!safeEqualString(signaturePart, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(fromBase64Url(dataPart)) as SessionPayload;
    if (typeof payload.iat !== "number") {
      return false;
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.iat > now + 60) {
      return false;
    }
    if (now - payload.iat > SESSION_TTL_SECONDS) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function getSessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
