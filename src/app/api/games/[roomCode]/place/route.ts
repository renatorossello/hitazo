import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getGameByRoom, getCurrentRound, getTeamYears, teamsInOrder, phaseUpdate } from "@/lib/game/server";

/**
 * POST /api/games/:roomCode/place  { teamId, position }
 * El equipo en turno ubica la carta en un hueco de SU línea de tiempo. Abre la
 * ventana de desafío (phase -> challenge). El "adivinó título/artista" ya no se
 * declara acá: lo decide el host en el reveal.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    teamId?: string;
    position?: number;
  };

  const supabase = createServiceClient();
  const game = await getGameByRoom(supabase, roomCode);
  if (!game || game.status !== "playing") {
    return NextResponse.json({ error: "game_not_playing" }, { status: 409 });
  }
  const round = await getCurrentRound(supabase, game);
  if (!round || round.phase !== "playing") {
    return NextResponse.json({ error: "wrong_phase" }, { status: 409 });
  }
  if (!body.teamId || body.teamId !== round.team_id) {
    return NextResponse.json({ error: "not_your_turn" }, { status: 403 });
  }

  const years = await getTeamYears(supabase, round.team_id);
  const position = Number(body.position);
  if (!Number.isInteger(position) || position < 0 || position > years.length) {
    return NextResponse.json({ error: "invalid_position" }, { status: 400 });
  }

  // Si ningún equipo SIN turno tiene fichas, no hay desafío posible → saltamos la
  // ventana e vamos directo a 'closing' (el turno cierra cuando quiera, sin esperar).
  const teams = await teamsInOrder(supabase, game.id);
  const someoneCanChallenge = teams.some((t) => t.id !== round.team_id && t.tokens >= 1);
  const nextPhase = someoneCanChallenge ? "challenge" : "closing";

  const { error } = await supabase
    .from("ct_rounds")
    .update({ placed_position: position, ...phaseUpdate(nextPhase) })
    .eq("id", round.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
