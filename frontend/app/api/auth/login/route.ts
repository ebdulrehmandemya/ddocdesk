import { NextRequest, NextResponse } from "next/server";
import {
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  OIDC_NEXT_COOKIE,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  getAppUrl,
  getAuthorizationEndpoint,
  getKeycloakClientId,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();
  const redirectUri = `${appUrl}/api/auth/callback`;

  const url = new URL(request.url);
  const nextParam = url.searchParams.get("next") || "/";

  // Only allow local, relative paths — prevents open-redirect attacks
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const authorizationUrl = new URL(getAuthorizationEndpoint());
  authorizationUrl.searchParams.set("client_id", getKeycloakClientId());
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid profile email");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizationUrl.toString());
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set({
    name: OIDC_STATE_COOKIE, value: state, httpOnly: true, secure,
    sameSite: "lax", path: "/", maxAge: 60 * 10,
  });

  response.cookies.set({
    name: OIDC_VERIFIER_COOKIE, value: codeVerifier, httpOnly: true, secure,
    sameSite: "lax", path: "/", maxAge: 60 * 10,
  });

  response.cookies.set({
    name: OIDC_NEXT_COOKIE, value: safeNext, httpOnly: true, secure,
    sameSite: "lax", path: "/", maxAge: 60 * 10,
  });

  return response;
}
