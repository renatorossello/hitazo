import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { parsePlaylistId, fetchPlaylistName, fetchPlaylistTracks, enrichWithGenres, importTracks, SpotifyAuthError } from "@/lib/deck-engine";

/**
 * POST /api/admin/playlist  { url, deckName?, max? }
 * Importa las canciones de una playlist de Spotify (de usuario) al pool, las enriquece
 * con género/región, y crea un MAZO con el nombre de la playlist vinculando esas cartas
 * (para poder elegirlo en el lobby). Host-only.
 */
export async function POST(req: NextRequest) {
  const { token, applyCookies } = await getValidAccessToken(req);
  if (!token) {
    const res = NextResponse.json({ error: "no_host_session" }, { status: 401 });
    applyCookies(res);
    return res;
  }

  const body = (await req.json().catch(() => ({}))) as { url?: string; deckName?: string; max?: number };
  const playlistId = parsePlaylistId(body.url ?? "");
  if (!playlistId) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  let tracks;
  let playlistName: string | null;
  try {
    playlistName = await fetchPlaylistName(token, playlistId);
    tracks = await fetchPlaylistTracks(token, playlistId, body.max ?? 1000);
    await enrichWithGenres(token, tracks);
  } catch (e) {
    if (e instanceof SpotifyAuthError) return NextResponse.json({ error: "spotify_auth" }, { status: 401 });
    if (String(e).includes("playlist_forbidden")) {
      return NextResponse.json({ error: "playlist_forbidden", detail: String(e).slice(0, 220) }, { status: 403 });
    }
    if (String(e).includes("playlist_not_found")) {
      return NextResponse.json({ error: "playlist_not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  if (tracks.length === 0) {
    return NextResponse.json({ error: "empty_playlist" }, { status: 400 });
  }

  const supabase = createServiceClient();
  await importTracks(supabase, tracks);

  // Mazo con el nombre de la playlist (o el que pasó el host).
  const deckName = (body.deckName?.trim() || playlistName || "Playlist").slice(0, 80);
  let filterId: string;
  const { data: existing } = await supabase.from("ct_deck_filters").select("id").eq("name", deckName).limit(1).maybeSingle();
  if (existing) {
    filterId = existing.id;
  } else {
    const { data: created, error } = await supabase.from("ct_deck_filters").insert({ name: deckName }).select("id").single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "deck_create_failed" }, { status: 500 });
    filterId = created.id;
  }

  // Vincular las cartas importadas al mazo.
  const uris = tracks.map((t) => t.spotify_uri);
  const { data: cards } = await supabase.from("ct_cards").select("id").in("spotify_uri", uris);
  const links = (cards ?? []).map((c) => ({ card_id: c.id, filter_id: filterId }));
  if (links.length) {
    await supabase.from("ct_card_filters").upsert(links, { onConflict: "card_id,filter_id" });
  }

  return NextResponse.json({ imported: tracks.length, deckName, linked: links.length });
}
