import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { importTracks, type SpotifyTrack } from "@/lib/deck-engine";

/**
 * POST /api/admin/import  { tracks: SpotifyTrack[] }
 * Importa los tracks seleccionados al pool global como cartas 'pending' (con géneros/
 * categoría/región si vienen enriquecidos). Los mazos se arman por criterios. Host-only.
 */
export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { tracks?: SpotifyTrack[] };
  const tracks = body.tracks ?? [];
  if (tracks.length === 0) return NextResponse.json({ imported: 0 });

  const supabase = createServiceClient();
  try {
    const result = await importTracks(supabase, tracks);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
