import { NextResponse } from "next/server";
import { generateCodeVerifier, deriveCodeChallenge, generateState } from "@/lib/spotify/pkce";
import { buildAuthorizeUrl, setPkceCookies } from "@/lib/spotify/auth";

/**
 * GET /api/auth/login
 * Inicia el OAuth Authorization Code + PKCE del host: genera verifier/challenge,
 * los guarda en cookies httpOnly (sobre la respuesta) y redirige a Spotify.
 */
export async function GET() {
  const verifier = generateCodeVerifier();
  const challenge = await deriveCodeChallenge(verifier);
  const state = generateState();

  const res = NextResponse.redirect(buildAuthorizeUrl(challenge, state));
  setPkceCookies(res, verifier, state);
  return res;
}
