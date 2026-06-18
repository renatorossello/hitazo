import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * DELETE /api/admin/decks/:id
 * Borra el mazo (ct_deck_filters). Sus vínculos a cartas (ct_card_filters) caen por
 * cascade; las CARTAS quedan en el pool (un mazo es solo una agrupación). Las partidas
 * viejas guardan filter_ids como uuid[] (no FK), así que no se rompe nada. Host-only.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createServiceClient();

  const { error } = await supabase.from("ct_deck_filters").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
