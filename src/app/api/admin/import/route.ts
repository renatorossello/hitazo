import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { importTracks, type SpotifyTrack } from "@/lib/deck-engine";

/**
 * POST /api/admin/import  { tracks: SpotifyTrack[], deckName? }
 * Importa los tracks seleccionados al pool (con género/región). Si viene `deckName`,
 * crea/usa ese mazo y vincula las cartas (para playlists). Host-only.
 */
export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { tracks?: SpotifyTrack[]; deckName?: string };
  const tracks = body.tracks ?? [];
  if (tracks.length === 0) return NextResponse.json({ imported: 0 });

  const supabase = createServiceClient();
  try {
    const result = await importTracks(supabase, tracks);

    let deckName: string | null = null;
    if (body.deckName?.trim()) {
      deckName = body.deckName.trim().slice(0, 80);
      let filterId: string;
      const { data: existing } = await supabase
        .from("ct_deck_filters")
        .select("id")
        .eq("name", deckName)
        .limit(1)
        .maybeSingle();
      if (existing) {
        filterId = existing.id;
      } else {
        const { data: created } = await supabase
          .from("ct_deck_filters")
          .insert({ name: deckName })
          .select("id")
          .single();
        filterId = created!.id;
      }
      const { data: cards } = await supabase
        .from("ct_cards")
        .select("id")
        .in("spotify_uri", tracks.map((t) => t.spotify_uri));
      const links = (cards ?? []).map((c) => ({ card_id: c.id, filter_id: filterId }));
      if (links.length) {
        await supabase.from("ct_card_filters").upsert(links, { onConflict: "card_id,filter_id" });
      }
    }

    return NextResponse.json({ ...result, deckName });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
