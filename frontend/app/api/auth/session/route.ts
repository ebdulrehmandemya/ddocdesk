import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  // Never expose tokens to the browser
  return NextResponse.json({
    authenticated: true,
    user: session.user,
  });
}
