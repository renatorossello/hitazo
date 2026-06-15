import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { getGameByRoom, getCurrentRound, advanceOrFinish } from "@/lib/game/server";

/**
 * POST /api/games/:roomCode/timeout  (host/board)
 * Venció el timer del turno sin que el equipo ubicara: turno perdido (carta
 * descartada, SIN ventana de desafío) y se pasa al siguiente turno.
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
  // Solo aplica si el turno seguía sonando (sin ubicar). Si ya ubicó, no hay timeout.
  if (round.phase !== "playing") {
    return NextResponse.json({ ok: true }); // idempotente / ya avanzó
  }

  await supabase
    .from("ct_rounds")
    .update({ placed_correct: false, card_winner_id: null, phase: "resolved" })
    .eq("id", round.id);

  await advanceOrFinish(supabase, game);

  return NextResponse.json({ ok: true });
}
