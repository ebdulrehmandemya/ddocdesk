import { NextRequest, NextResponse } from "next/server";

export default function proxy(request: NextRequest) {
  // Just pass through — locale is handled via cookies, not URL
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
