import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isGameHost } from "@/lib/game/host";
import { getGameByRoom, getCurrentRound, getTeamYears } from "@/lib/game/server";
import { isPlacementCorrect } from "@/lib/game/rules";

/**
 * POST /api/games/:roomCode/correct-year  { year }   (host/board)
 * Durante el reveal, el host corrige el año si está claramente mal. Esto:
 *  1) fija el año en la base (ct_cards, queda 'manual' para siempre),
 *  2) RECALCULA el resultado de la ronda (ubicó bien/mal y desafío bien/mal) con el
 *     año corregido, para que Adivinó/No adivinó resuelva sobre el dato correcto.
 * Solo se permite en fase 'reveal' (antes de resolver).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const body = (await req.json().catch(() => ({}))) as { year?: number };

  const supabase = createServiceClient();
  const game = await getGameByRoom(supabase, roomCode);
  if (!game || game.status !== "playing") {
    return NextResponse.json({ error: "game_not_playing" }, { status: 409 });
  }
  if (!(await isGameHost(game.host_token))) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const round = await getCurrentRound(supabase, game);
  if (!round) return NextResponse.json({ error: "no_round" }, { status: 409 });
  if (round.phase !== "reveal") {
    return NextResponse.json({ error: "wrong_phase" }, { status: 409 });
  }

  const year = Number(body.year);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return NextResponse.json({ error: "invalid_year" }, { status: 400 });
  }

  // 1) Año corregido a mano en la base (queda fijo).
  await supabase
    .from("ct_cards")
    .update({ release_year: year, year_source: "manual", year_status: "manual" })
    .eq("id", round.card_id);

  // 2) Recalcular el resultado de la ronda con el año corregido.
  const turnYears = await getTeamYears(supabase, round.team_id!);
  const placedCorrect =
    round.placed_position != null ? isPlacementCorrect(turnYears, round.placed_position, year) : false;
  let challengeCorrect: boolean | null = round.challenge_correct;
  if (round.challenger_id) {
    challengeCorrect =
      round.challenge_position != null ? isPlacementCorrect(turnYears, round.challenge_position, year) : false;
  }
  await supabase
    .from("ct_rounds")
    .update({ placed_correct: placedCorrect, challenge_correct: challengeCorrect })
    .eq("id", round.id);

  return NextResponse.json({ ok: true });
}
