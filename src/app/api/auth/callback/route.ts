import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, readPkceFromRequest, clearPkceCookies } from "@/lib/spotify/auth";

/**
 * GET /api/auth/callback?code=...&state=...
 * Spotify redirige acá tras el login. Validamos state, cambiamos el code por
 * tokens (PKCE) y volvemos al board. Las cookies se setean sobre la respuesta.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/host?error=${encodeURIComponent(error)}`, origin));
  }

  const { verifier, state: savedState } = readPkceFromRequest(req);

  if (!code || !verifier || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/host?error=oauth_state", origin));
  }

  try {
    const res = NextResponse.redirect(new URL("/board", origin));
    await exchangeCodeForTokens(res, code, verifier);
    clearPkceCookies(res);
    return res;
  } catch {
    const res = NextResponse.redirect(new URL("/host?error=token_exchange", origin));
    clearPkceCookies(res);
    return res;
  }
}
