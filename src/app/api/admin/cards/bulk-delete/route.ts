import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/cards/bulk-delete  { ids: string[] }
 * Borra varias cartas del pool. Los vínculos a mazos (ct_card_filters) caen por
 * cascade. Las cartas ya jugadas en alguna partida (ct_team_cards / ct_rounds) NO
 * tienen cascade: esas no se borran y se devuelven en `failed`. Host-only.
 */
export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "no_ids" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Camino feliz: borrado en bloque. Si una sola viola FK (carta ya jugada), el
  // statement entero falla → caemos al borrado uno por uno para aislar las que sí.
  const { error } = await supabase.from("ct_cards").delete().in("id", ids);
  if (!error) {
    return NextResponse.json({ deleted: ids.length, failed: [] });
  }

  let deleted = 0;
  const failed: string[] = [];
  for (const id of ids) {
    const { error: e } = await supabase.from("ct_cards").delete().eq("id", id);
    if (e) failed.push(id);
    else deleted++;
  }
  return NextResponse.json({ deleted, failed });
}
