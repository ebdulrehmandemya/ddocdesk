import { NextRequest, NextResponse } from "next/server";
import {
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  OIDC_NEXT_COOKIE,
  SESSION_COOKIE,
  generateSessionId,
  saveSession,
  getAppUrl,
  getKeycloakClientId,
  getTokenEndpoint,
  getUserinfoEndpoint,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const appUrl = getAppUrl();

  try {
    const url = new URL(request.url);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (error) {
      console.error("Keycloak returned auth error", error, errorDescription);
      return NextResponse.redirect(new URL(`/?auth_error=${error}`, appUrl));
    }

    const stateCookie = request.cookies.get(OIDC_STATE_COOKIE)?.value;
    const codeVerifier = request.cookies.get(OIDC_VERIFIER_COOKIE)?.value;

    if (!code) {
      return NextResponse.redirect(new URL("/?auth_error=missing_code", appUrl));
    }

    if (!stateCookie || !state || state !== stateCookie) {
      return NextResponse.redirect(new URL("/?auth_error=invalid_state", appUrl));
    }

    if (!codeVerifier) {
      return NextResponse.redirect(new URL("/?auth_error=missing_pkce_verifier", appUrl));
    }

    const tokenResponse = await fetch(getTokenEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appUrl}/api/auth/callback`,
        client_id: getKeycloakClientId(),
        code_verifier: codeVerifier,
      }),
      cache: "no-store",
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text().catch(() => "");
      console.error("Keycloak token exchange failed", tokenResponse.status, body);

      return NextResponse.redirect(
        new URL("/?auth_error=token_exchange_failed", appUrl)
      );
    }

    const tokens = await tokenResponse.json().catch(() => null);

    if (!tokens?.access_token) {
      console.error("No access_token returned from Keycloak", tokens);
      return NextResponse.redirect(new URL("/?auth_error=no_access_token", appUrl));
    }

    let profile: Record<string, unknown> = {};

    try {
      const userinfoResponse = await fetch(getUserinfoEndpoint(), {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
        cache: "no-store",
      });

      if (userinfoResponse.ok) {
        profile = await userinfoResponse.json();
      } else {
        console.error(
          "Userinfo request failed",
          userinfoResponse.status,
          await userinfoResponse.text().catch(() => "")
        );
      }
    } catch (userinfoError) {
      console.error("Userinfo request threw", userinfoError);
    }

    const parsedExpiresIn = Number(tokens.expires_in);
    const expiresInSeconds = Number.isFinite(parsedExpiresIn)
      ? parsedExpiresIn
      : 3600;

    const expiresAt = Date.now() + expiresInSeconds * 1000;

    const sessionId = generateSessionId();

    saveSession(sessionId, {
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token,
      user: {
        id: String(profile.sub ?? "unknown"),
        email: profile.email ? String(profile.email) : undefined,
        name: profile.name
          ? String(profile.name)
          : profile.preferred_username
            ? String(profile.preferred_username)
            : profile.email
              ? String(profile.email)
              : undefined,
      },
      expiresAt,
    });

    const nextCookie = request.cookies.get(OIDC_NEXT_COOKIE)?.value;
    const target =
      nextCookie && nextCookie.startsWith("/") && !nextCookie.startsWith("//")
        ? nextCookie
        : "/";

    const response = NextResponse.redirect(new URL(target, appUrl));

    response.cookies.set({
      name: SESSION_COOKIE,
      value: sessionId,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expiresInSeconds,
    });

    response.cookies.delete(OIDC_STATE_COOKIE);
    response.cookies.delete(OIDC_VERIFIER_COOKIE);
    response.cookies.delete(OIDC_NEXT_COOKIE);

    return response;
  } catch (error) {
    console.error("Auth callback failed", error);

    return NextResponse.redirect(
      new URL("/?auth_error=callback_exception", appUrl)
    );
  }
}
