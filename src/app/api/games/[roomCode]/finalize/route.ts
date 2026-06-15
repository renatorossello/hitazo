import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { getGameByRoom, getCurrentRound, getTeamYears, phaseUpdate } from "@/lib/game/server";
import { isPlacementCorrect } from "@/lib/game/rules";

/**
 * POST /api/games/:roomCode/finalize  { teamId? }
 * Cierra el turno y pasa a reveal (calcula aciertos; recién acá se expone año/título).
 * La dispara: el jugador EN TURNO ("Finalizar ronda", solo en 'closing'), el timer de
 * cierre del board, o el host ("Forzar fin de ronda", desde 'challenge' o 'closing').
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const body = (await req.json().catch(() => ({}))) as { teamId?: string };

  const supabase = createServiceClient();
  const game = await getGameByRoom(supabase, roomCode);
  if (!game || game.status !== "playing") {
    return NextResponse.json({ error: "game_not_playing" }, { status: 409 });
  }
  const round = await getCurrentRound(supabase, game);
  if (!round) return NextResponse.json({ error: "no_round" }, { status: 409 });
  if (round.phase === "reveal" || round.phase === "resolved") {
    return NextResponse.json({ ok: true }); // idempotente
  }
  if (round.phase !== "challenge" && round.phase !== "closing") {
    return NextResponse.json({ error: "wrong_phase" }, { status: 409 });
  }

  // Autorización: el host siempre (timer/forzar); el jugador en turno solo en 'closing'.
  const isHost = await isHostAuthenticated();
  const isTurnPlayer = Boolean(body.teamId) && body.teamId === round.team_id;
  if (!isHost && !(isTurnPlayer && round.phase === "closing")) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  // Correctitud sobre la línea del equipo EN TURNO.
  const turnYears = await getTeamYears(supabase, round.team_id!);
  const placedCorrect =
    round.placed_position != null
      ? isPlacementCorrect(turnYears, round.placed_position, round.card_year)
      : false;

  let challengeCorrect: boolean | null = null;
  if (round.challenger_id) {
    challengeCorrect =
      round.challenge_position != null
        ? isPlacementCorrect(turnYears, round.challenge_position, round.card_year)
        : false;
  }

  const { error } = await supabase
    .from("ct_rounds")
    .update({ placed_correct: placedCorrect, challenge_correct: challengeCorrect, ...phaseUpdate("reveal") })
    .eq("id", round.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
