import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  deleteSession,
  getSessionById,
  getAppUrl,
  getLogoutEndpoint,
  getKeycloakClientId,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionId ? getSessionById(sessionId) : null;

  if (sessionId) {
    deleteSession(sessionId);
  }

  const response = NextResponse.redirect(new URL("/", appUrl));

  response.cookies.delete(SESSION_COOKIE);

  if (session?.idToken) {
    const logoutUrl = new URL(getLogoutEndpoint());

    logoutUrl.searchParams.set("id_token_hint", session.idToken);
    logoutUrl.searchParams.set("post_logout_redirect_uri", appUrl);
    logoutUrl.searchParams.set("client_id", getKeycloakClientId());

    return NextResponse.redirect(logoutUrl.toString());
  }

  return response;
}
