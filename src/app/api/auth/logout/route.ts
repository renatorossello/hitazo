import { NextRequest, NextResponse } from "next/server";
import { clearSpotifySession } from "@/lib/spotify/auth";

/** GET /api/auth/logout — corta la sesión de Spotify del host. */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/host", new URL(req.url).origin));
  clearSpotifySession(res);
  return res;
}
