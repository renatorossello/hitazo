import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getGameByRoom, getCurrentRound, getTeamYears } from "@/lib/game/server";

/**
 * POST /api/games/:roomCode/challenge/place  { teamId, position }
 * El desafiante (ya con el cupo reclamado) ubica la carta en la línea de tiempo del
 * EQUIPO EN TURNO, en un hueco DISTINTO al que eligió el turno (si elige el mismo no
 * sería un desafío). Si el turno falló y acá acierta, se lleva la carta a su línea.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const body = (await req.json().catch(() => ({}))) as { teamId?: string; position?: number };

  const supabase = createServiceClient();
  const game = await getGameByRoom(supabase, roomCode);
  if (!game || game.status !== "playing") {
    return NextResponse.json({ error: "game_not_playing" }, { status: 409 });
  }
  const round = await getCurrentRound(supabase, game);
  if (!round || round.phase !== "challenge") {
    return NextResponse.json({ error: "wrong_phase" }, { status: 409 });
  }
  if (!body.teamId || body.teamId !== round.challenger_id) {
    return NextResponse.json({ error: "not_challenger" }, { status: 403 });
  }

  // El desafío es sobre la línea del equipo EN TURNO.
  const years = await getTeamYears(supabase, round.team_id!);
  const position = Number(body.position);
  if (!Number.isInteger(position) || position < 0 || position > years.length) {
    return NextResponse.json({ error: "invalid_position" }, { status: 400 });
  }
  if (position === round.placed_position) {
    return NextResponse.json({ error: "same_as_turn" }, { status: 400 });
  }

  const { error } = await supabase
    .from("ct_rounds")
    .update({ challenge_position: position })
    .eq("id", round.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
