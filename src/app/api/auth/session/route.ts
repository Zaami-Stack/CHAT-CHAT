import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticatedRequest } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    authenticated: isAuthenticatedRequest(request),
  });
}
