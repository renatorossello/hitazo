import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { parsePlaylistId, fetchPlaylistViaEmbed, enrichWithGenres } from "@/lib/deck-engine";

/**
 * POST /api/admin/playlist  { url }
 * Lee una playlist desde su página embed pública (la API de playlists está bloqueada
 * en Dev Mode) y devuelve sus temas con género (Deezer), como PREVIEW para que el host
 * elija cuáles importar. No requiere token de Spotify (embed + Deezer son públicos).
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

  try {
    const { name, tracks } = await fetchPlaylistViaEmbed(playlistId);
    if (tracks.length === 0) {
      return NextResponse.json({ error: "empty_playlist" }, { status: 400 });
    }
    await enrichWithGenres(tracks); // género por Deezer
    return NextResponse.json({ tracks, deckName: name ?? "Playlist" });
  } catch (e) {
    if (String(e).includes("playlist_not_found")) {
      return NextResponse.json({ error: "playlist_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
