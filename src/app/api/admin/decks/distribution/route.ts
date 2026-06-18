import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlayableCards, songKey } from "@/lib/game/deck";

const BUCKET = 5; // franja de años

/**
 * POST /api/admin/decks/distribution  { filterIds?: string[] }
 * Distribución de años de las canciones JUGABLES de los mazos elegidos (o del pool
 * completo si no se elige ninguno), agrupadas en franjas de 5 años. Cuenta canciones
 * únicas (dedup por identidad de canción, igual que el sorteo de la partida), así
 * refleja lo que realmente se puede jugar. Host-only.
 */
export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { filterIds?: string[] };
  const filterIds = Array.isArray(body.filterIds) && body.filterIds.length > 0 ? body.filterIds : null;

  const supabase = createServiceClient();
  const playable = await getPlayableCards(supabase, filterIds);

  // Dedup por canción (no por carta): el mismo tema por dos cartas cuenta una vez.
  const seen = new Set<string>();
  const years: number[] = [];
  for (const c of playable) {
    const key = songKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    if (c.release_year != null) years.push(c.release_year);
  }

  if (years.length === 0) {
    return NextResponse.json({ buckets: [], total: 0, min: null, max: null });
  }

  const min = Math.min(...years);
  const max = Math.max(...years);
  const firstStart = Math.floor(min / BUCKET) * BUCKET;
  const lastStart = Math.floor(max / BUCKET) * BUCKET;

  // Franjas contiguas (con ceros en los huecos) para ver bien la forma de la distribución.
  const counts = new Map<number, number>();
  for (const y of years) {
    const start = Math.floor(y / BUCKET) * BUCKET;
    counts.set(start, (counts.get(start) ?? 0) + 1);
  }

  const buckets: { start: number; end: number; count: number }[] = [];
  for (let s = firstStart; s <= lastStart; s += BUCKET) {
    buckets.push({ start: s, end: s + BUCKET - 1, count: counts.get(s) ?? 0 });
  }

  return NextResponse.json({ buckets, total: years.length, min, max });
}
