import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { getGameByRoom, getCurrentRound, teamsInOrder, addCardToTimeline } from "@/lib/game/server";
import { resolveCard } from "@/lib/game/rules";

/**
 * POST /api/games/:roomCode/resolve  { metaAwarded }  (host/board)
 * Resuelve la ronda: matriz de resolución (quién se queda la carta), ficha al equipo
 * en turno si el host marcó que adivinó título/artista, fin de juego o siguiente turno.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const { roomCode } = await params;
  const body = (await req.json().catch(() => ({}))) as { metaAwarded?: boolean };
  const supabase = createServiceClient();

  const game = await getGameByRoom(supabase, roomCode);
  if (!game || game.status !== "playing") {
    return NextResponse.json({ error: "game_not_playing" }, { status: 409 });
  }
  const round = await getCurrentRound(supabase, game);
  if (!round) return NextResponse.json({ error: "no_round" }, { status: 409 });
  if (round.phase === "resolved") return NextResponse.json({ ok: true }); // idempotente
  if (round.phase !== "reveal") {
    return NextResponse.json({ error: "wrong_phase" }, { status: 409 });
  }

  const challenged = Boolean(round.challenger_id);
  const outcome = resolveCard({
    turnCorrect: Boolean(round.placed_correct),
    challenged,
    challengeCorrect: Boolean(round.challenge_correct),
  });
  const cardWinnerId =
    outcome === "turn" ? round.team_id : outcome === "challenger" ? round.challenger_id : null;

  // La carta entra en la línea del ganador (renumerada por año).
  if (cardWinnerId) {
    await addCardToTimeline(supabase, cardWinnerId, round.card_id, round.card_year);
  }

  // Ficha por título/artista: la decide el host (escuchó al equipo decirlo en voz alta).
  const awarded = Boolean(body.metaAwarded);
  if (awarded && round.team_id) {
    const teams = await teamsInOrder(supabase, game.id);
    const turnTeam = teams.find((t) => t.id === round.team_id);
    if (turnTeam) {
      await supabase.from("ct_teams").update({ tokens: turnTeam.tokens + 1 }).eq("id", round.team_id);
    }
  }

  await supabase
    .from("ct_rounds")
    .update({ card_winner_id: cardWinnerId, meta_awarded: awarded, phase: "resolved" })
    .eq("id", round.id);

  // No avanzamos acá: el host arranca la próxima ronda con "Iniciar ronda"
  // (POST /next-round) → da tiempo a una pausa entre rondas.
  return NextResponse.json({ ok: true });
}
