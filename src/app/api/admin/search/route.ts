import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { searchTracks, SpotifyAuthError } from "@/lib/deck-engine";

/**
 * POST /api/admin/search  { yearFrom?, yearTo?, genre?, text?, max? }
 * Busca en Spotify con el token del host (preview, no escribe). Host-only.
 */
export async function POST(req: NextRequest) {
  const { token, applyCookies } = await getValidAccessToken(req);
  if (!token) {
    const res = NextResponse.json({ error: "no_host_session" }, { status: 401 });
    applyCookies(res);
    return res;
  }

  const body = await req.json().catch(() => ({}));
  try {
    const tracks = await searchTracks(token, {
      yearFrom: body.yearFrom,
      yearTo: body.yearTo,
      genre: body.genre,
      text: body.text,
      max: body.max ?? 50,
    });
    return NextResponse.json({ tracks });
  } catch (e) {
    if (e instanceof SpotifyAuthError) {
      return NextResponse.json({ error: "spotify_auth" }, { status: 401 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
