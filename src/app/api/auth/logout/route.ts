import { NextRequest, NextResponse } from "next/server";
import { clearSpotifySession, appOrigin } from "@/lib/spotify/auth";

/** GET /api/auth/logout — corta la sesión de Spotify del host. */
export async function GET(req: NextRequest) {
  const origin = appOrigin() ?? new URL(req.url).origin;
  const res = NextResponse.redirect(new URL("/host", origin));
  clearSpotifySession(res);
  return res;
}
