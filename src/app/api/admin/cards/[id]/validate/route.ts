import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getOriginalYear, getYearByTitleArtist, getDeezerYear } from "@/lib/deck-engine";

/**
 * GET /api/admin/cards/:id/validate
 * Vuelve a consultar el año en varias fuentes (MusicBrainz por ISRC y/o por
 * título+artista, y Deezer) para que el host elija el correcto. Host-only.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: card } = await supabase
    .from("ct_cards")
    .select("title, artist, isrc")
    .eq("id", id)
    .maybeSingle();
  if (!card) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const userAgent = process.env.MUSICBRAINZ_USER_AGENT ?? "Hitazo/1.0";
  const mbCandidates = new Set<number>();

  if (card.isrc) {
    const r = await getOriginalYear(card.isrc, userAgent);
    r.candidates.forEach((y) => mbCandidates.add(y));
  }
  const r2 = await getYearByTitleArtist(card.title, card.artist, userAgent);
  r2.candidates.forEach((y) => mbCandidates.add(y));

  const deezerYear = await getDeezerYear(card.title, card.artist);

  return NextResponse.json({
    mbCandidates: [...mbCandidates].sort((a, b) => a - b),
    deezerYear,
  });
}
