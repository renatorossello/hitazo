import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isGameHost } from "@/lib/game/host";
import { getGameByRoom, getCurrentRound, advanceOrFinish } from "@/lib/game/server";

/**
 * POST /api/games/:roomCode/next-round  (host/board)
 * Arranca la próxima ronda (o termina la partida, fin justo). Separado del resolve
 * para que el host pueda hacer una pausa entre rondas. Idempotente: solo avanza si la
 * ronda actual está 'resolved'.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const supabase = createServiceClient();

  const game = await getGameByRoom(supabase, roomCode);
  if (!game || game.status !== "playing") {
    return NextResponse.json({ error: "game_not_playing" }, { status: 409 });
  }
  if (!(await isGameHost(game.host_token))) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const round = await getCurrentRound(supabase, game);
  if (!round || round.phase !== "resolved") {
    return NextResponse.json({ ok: true }); // todavía no se resolvió / ya avanzó
  }

  await advanceOrFinish(supabase, game);
  return NextResponse.json({ ok: true });
}
