import { NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { resolvePendingBatch } from "@/lib/deck-engine";

/**
 * POST /api/admin/resolve
 * Toma un lote de cartas 'pending' y resuelve sus años contra MusicBrainz (1/seg).
 * Idempotente y reanudable: la UI lo llama en loop hasta remaining === 0. Host-only.
 */
export async function POST() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const userAgent = process.env.MUSICBRAINZ_USER_AGENT;
  if (!userAgent) {
    return NextResponse.json({ error: "missing_user_agent" }, { status: 500 });
  }

  const supabase = createServiceClient();
  try {
    const result = await resolvePendingBatch(supabase, userAgent, 10);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
