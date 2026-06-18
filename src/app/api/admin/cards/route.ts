import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

/**
 * GET /api/admin/cards?q=&status=&bucket=&region=&missingYear=1&page=0
 * Lista de cartas del pool con filtros, para ver/curar lo que hay en la base. Host-only.
 */
export async function GET(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status")?.trim();
  const bucket = url.searchParams.get("bucket")?.trim();
  const region = url.searchParams.get("region")?.trim();
  const deck = url.searchParams.get("deck")?.trim();
  const missingYear = url.searchParams.get("missingYear") === "1";
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0));

  const supabase = createServiceClient();

  // Filtro por mazo: resolvemos qué cartas pertenecen a ese mazo.
  let deckCardIds: string[] | null = null;
  if (deck) {
    const { data: links } = await supabase.from("ct_card_filters").select("card_id").eq("filter_id", deck);
    deckCardIds = [...new Set((links ?? []).map((l) => l.card_id))];
    if (deckCardIds.length === 0) {
      return NextResponse.json({ cards: [], total: 0, page, pageSize: PAGE_SIZE });
    }
  }

  let query = supabase
    .from("ct_cards")
    .select(
      "id, title, artist, release_year, spotify_year, mb_candidates, year_status, genres, genre_buckets, region, cover_url",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (deckCardIds) query = query.in("id", deckCardIds);
  if (q) query = query.or(`title.ilike.%${q}%,artist.ilike.%${q}%`);
  if (status) query = query.eq("year_status", status);
  if (bucket) query = query.contains("genre_buckets", [bucket]);
  if (region) query = query.eq("region", region);
  if (missingYear) query = query.is("release_year", null);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ cards: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
