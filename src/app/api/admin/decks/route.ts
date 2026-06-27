import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/decks
 * Lista los mazos (ct_deck_filters) con cuántas cartas tienen y cuántas son jugables.
 * Lo usan el admin y el lobby (para elegir qué mazos jugar). Lectura no sensible (solo
 * nombres/conteos), SIN gate de Spotify: así el host en modo manual también ve los
 * mazos en el lobby. Las escrituras (import/borrar) siguen protegidas.
 */
export async function GET() {
  const supabase = createServiceClient();

  const { data: filters } = await supabase
    .from("ct_deck_filters")
    .select("id, name")
    .order("name", { ascending: true });

  const decks = [];
  for (const f of filters ?? []) {
    const { data: links } = await supabase.from("ct_card_filters").select("card_id").eq("filter_id", f.id);
    const cardIds = (links ?? []).map((l) => l.card_id);
    let playable = 0;
    if (cardIds.length) {
      const { count } = await supabase
        .from("ct_cards")
        .select("id", { count: "exact", head: true })
        .in("id", cardIds)
        .in("year_status", ["resolved", "manual"])
        .not("release_year", "is", null);
      playable = count ?? 0;
    }
    decks.push({ id: f.id, name: f.name, total: cardIds.length, playable });
  }

  return NextResponse.json({ decks });
}
