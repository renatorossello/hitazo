import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { searchTracks, importTracks, SpotifyAuthError, type SpotifyTrack } from "@/lib/deck-engine";
import { FAMOUS_SONGS } from "@/lib/game/famous-songs";

const FILTER_NAME = "Famosas";

/**
 * POST /api/admin/seed-famous
 * Siembra el set inicial de 50 canciones famosas: busca cada una en Spotify (top
 * match) y la importa al mazo "Famosas".
 *
 * A diferencia del flujo general (que resuelve años con MusicBrainz vía ISRC), el
 * seed usa los AÑOS CURADOS de la lista como 'manual'. Motivo: el top match de
 * Spotify suele ser un remaster cuyo ISRC MusicBrainz no tiene indexado, y caería
 * todo en needs_review. Como son temas conocidos, el año curado es confiable y deja
 * las 50 jugables al toque. Host-only. Idempotente (upsert por spotify_uri).
 */
export async function POST(req: NextRequest) {
  const { token, applyCookies } = await getValidAccessToken(req);
  if (!token) {
    const res = NextResponse.json({ error: "no_host_session" }, { status: 401 });
    applyCookies(res);
    return res;
  }

  const paired: { track: SpotifyTrack; year: number }[] = [];
  const notFound: string[] = [];

  try {
    for (const song of FAMOUS_SONGS) {
      const q = `track:"${song.title}" artist:"${song.artist}"`;
      const hits = await searchTracks(token, { text: q, max: 1 });
      if (hits.length > 0) {
        paired.push({ track: hits[0], year: song.year });
      } else {
        notFound.push(`${song.title} — ${song.artist}`);
      }
    }
  } catch (e) {
    if (e instanceof SpotifyAuthError) {
      return NextResponse.json({ error: "spotify_auth" }, { status: 401 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  const supabase = createServiceClient();

  // get-or-create del mazo "Famosas".
  let filterId: string;
  const { data: existing } = await supabase
    .from("ct_deck_filters")
    .select("id")
    .eq("name", FILTER_NAME)
    .limit(1)
    .maybeSingle();
  if (existing) {
    filterId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from("ct_deck_filters")
      .insert({ name: FILTER_NAME })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? "filter_create_failed" }, { status: 500 });
    }
    filterId = created.id;
  }

  // Importa los tracks (los vincula al mazo) y luego fija el año curado como 'manual'.
  try {
    await importTracks(supabase, paired.map((p) => p.track), filterId);

    let yearsSet = 0;
    for (const { track, year } of paired) {
      const { error } = await supabase
        .from("ct_cards")
        .update({ release_year: year, year_source: "manual", year_status: "manual" })
        .eq("spotify_uri", track.spotify_uri);
      if (!error) yearsSet++;
    }

    return NextResponse.json({
      total: FAMOUS_SONGS.length,
      found: paired.length,
      playable: yearsSet,
      notFound,
      filterName: FILTER_NAME,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
