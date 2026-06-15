import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { getGameByRoom, getCurrentRound, getTeamYears } from "@/lib/game/server";
import { isPlacementCorrect } from "@/lib/game/rules";

/**
 * POST /api/games/:roomCode/reveal  (host/board)
 * Cierra la ventana de desafío: calcula si el turno (y el desafiante, si ubicó)
 * acertaron, y pasa a fase 'reveal' (recién acá se exponen año/título/artista).
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
  if (round.phase === "reveal" || round.phase === "resolved") {
    return NextResponse.json({ ok: true }); // idempotente
  }
  if (round.phase !== "challenge") {
    return NextResponse.json({ error: "wrong_phase" }, { status: 409 });
  }

  // Correctitud del turno (su línea NO incluye aún la carta en juego).
  const turnYears = await getTeamYears(supabase, round.team_id!);
  const placedCorrect =
    round.placed_position != null
      ? isPlacementCorrect(turnYears, round.placed_position, round.card_year)
      : false;

  // Correctitud del desafiante: su propuesta es un hueco en la MISMA línea (la del
  // equipo en turno), por eso se evalúa contra turnYears.
  let challengeCorrect: boolean | null = null;
  if (round.challenger_id) {
    challengeCorrect =
      round.challenge_position != null
        ? isPlacementCorrect(turnYears, round.challenge_position, round.card_year)
        : false; // reclamó pero no ubicó a tiempo
  }

  const { error } = await supabase
    .from("ct_rounds")
    .update({ placed_correct: placedCorrect, challenge_correct: challengeCorrect, phase: "reveal" })
    .eq("id", round.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
