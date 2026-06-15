import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { loadGameState } from "@/lib/game/state";

/**
 * GET /api/games/:roomCode/state
 * Estado autoritativo de la partida. El URI de la carta en juego solo se incluye
 * para el host (lo necesita para reproducir); los players no lo reciben.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const isHost = await isHostAuthenticated();
  const supabase = createServiceClient();

  const state = await loadGameState(supabase, roomCode, { includeCardUri: isHost });
  if (!state) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  return NextResponse.json(state);
}
