import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { getGameByRoom, getCurrentRound } from "@/lib/game/server";

/**
 * POST /api/games/:roomCode/play  (host/board)
 * Marca que la carta de la ronda ya empezó a sonar. Recién entonces el jugador en
 * turno ve el selector de ubicación (antes confunde porque no suena nada).
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

  await supabase.from("ct_rounds").update({ played: true }).eq("id", round.id);
  return NextResponse.json({ ok: true });
}
