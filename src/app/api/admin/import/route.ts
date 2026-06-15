import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { importTracks, type SpotifyTrack } from "@/lib/deck-engine";

/**
 * POST /api/admin/import  { tracks: SpotifyTrack[], filterName?: string }
 * Importa los tracks seleccionados como cartas 'pending' y los vincula a un mazo
 * (filtro). Si el mazo no existe, lo crea. Host-only.
 */
export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    tracks?: SpotifyTrack[];
    filterName?: string;
  };
  const tracks = body.tracks ?? [];
  if (tracks.length === 0) {
    return NextResponse.json({ imported: 0 });
  }

  const supabase = createServiceClient();
  const name = (body.filterName ?? "Seed").trim() || "Seed";

  // get-or-create del mazo por nombre.
  let filterId: string;
  const { data: existing } = await supabase
    .from("ct_deck_filters")
    .select("id")
    .eq("name", name)
    .limit(1)
    .maybeSingle();

  if (existing) {
    filterId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from("ct_deck_filters")
      .insert({ name })
      .select("id")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? "filter_create_failed" }, { status: 500 });
    }
    filterId = created.id;
  }

  try {
    const result = await importTracks(supabase, tracks, filterId);
    return NextResponse.json({ ...result, filterId, filterName: name });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
