import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated, getValidAccessToken } from "@/lib/spotify/auth";
import {
  parsePlaylistId,
  fetchPlaylistViaEmbed,
  fetchPlaylistTracks,
  fetchPlaylistName,
  enrichWithGenres,
  type SpotifyTrack,
} from "@/lib/deck-engine";

/**
 * POST /api/admin/playlist  { url }
 * Lee una playlist y devuelve sus temas (con género/carátula vía Deezer) como PREVIEW
 * para que el host elija cuáles importar.
 *
 * Estrategia: primero intenta la Web API con el token del host (trae TODOS los temas,
 * con ISRC y carátula). Si Spotify la bloquea (403 de Dev Mode) o no hay token, cae a
 * la página embed pública (que corta en ~100 temas).
 */
export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const playlistId = parsePlaylistId(body.url ?? "");
  if (!playlistId) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const { token, applyCookies } = await getValidAccessToken(req);

  let name: string | null = null;
  let tracks: SpotifyTrack[] = [];
  let source: "api" | "embed" = "embed";

  // 1) Web API con el token de usuario: trae la playlist completa (paginada) + ISRC.
  if (token) {
    try {
      tracks = await fetchPlaylistTracks(token, playlistId, 1000);
      name = await fetchPlaylistName(token, playlistId).catch(() => null);
      source = "api";
    } catch {
      tracks = []; // 403 (Dev Mode) o auth: probamos el embed abajo.
    }
  }

  // 2) Fallback: página embed pública (sin token), tope ~100 temas.
  if (tracks.length === 0) {
    try {
      const r = await fetchPlaylistViaEmbed(playlistId);
      name = r.name;
      tracks = r.tracks;
      source = "embed";
    } catch (e) {
      if (String(e).includes("playlist_not_found")) {
        return NextResponse.json({ error: "playlist_not_found" }, { status: 404 });
      }
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  if (tracks.length === 0) {
    return NextResponse.json({ error: "empty_playlist" }, { status: 400 });
  }

  await enrichWithGenres(tracks); // género/carátula por Deezer (rellena lo que falte)

  const res = NextResponse.json({
    tracks,
    deckName: name ?? "Playlist",
    source,
    count: tracks.length,
  });
  applyCookies(res); // por si hubo refresh del token
  return res;
}
