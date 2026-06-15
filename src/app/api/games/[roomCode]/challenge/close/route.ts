import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { getGameByRoom, getCurrentRound, phaseUpdate } from "@/lib/game/server";

/**
 * POST /api/games/:roomCode/challenge/close  (host/board)
 * Cierra la ventana de desafío al vencer el timer (challenge → closing). Idempotente.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const { roomCode } = await params;
  const supabase = createServiceClient();

  const game = await getGameByRoom(supabase, roomCode);
  if (!game || game.status !== "playing") {
    return NextResponse.json({ error: "game_not_playing" }, { status: 409 });
  }
  const round = await getCurrentRound(supabase, game);
  if (!round) return NextResponse.json({ error: "no_round" }, { status: 409 });
  if (round.phase !== "challenge") {
    return NextResponse.json({ ok: true }); // ya avanzó
  }

  await supabase.from("ct_rounds").update(phaseUpdate("closing")).eq("id", round.id);
  return NextResponse.json({ ok: true });
}
