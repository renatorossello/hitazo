import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getGameByRoom, getCurrentRound, teamsInOrder, phaseUpdate } from "@/lib/game/server";

/**
 * POST /api/games/:roomCode/decline  { teamId }
 * Un equipo sin turno declara "NO desafío". Si TODOS los equipos sin turno declinan,
 * se cierra la ventana de desafío antes de tiempo (→ fase 'closing'). Si no, la cierra
 * el timer de desafío del board.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const body = (await req.json().catch(() => ({}))) as { teamId?: string };
  const teamId = body.teamId;

  const supabase = createServiceClient();
  const game = await getGameByRoom(supabase, roomCode);
  if (!game || game.status !== "playing") {
    return NextResponse.json({ error: "game_not_playing" }, { status: 409 });
  }
  const round = await getCurrentRound(supabase, game);
  if (!round || round.phase !== "challenge") {
    return NextResponse.json({ error: "wrong_phase" }, { status: 409 });
  }
  if (!teamId || teamId === round.team_id) {
    return NextResponse.json({ error: "turn_team_cannot_decline" }, { status: 403 });
  }

  const declined = round.declined_team_ids.includes(teamId)
    ? round.declined_team_ids
    : [...round.declined_team_ids, teamId];

  // Si todos los equipos sin turno declinaron, cerramos la ventana ya.
  const teams = await teamsInOrder(supabase, game.id);
  const nonTurnCount = teams.filter((t) => t.id !== round.team_id).length;
  const allDeclined = !round.challenger_id && declined.length >= nonTurnCount;

  const update = allDeclined
    ? { declined_team_ids: declined, ...phaseUpdate("closing") }
    : { declined_team_ids: declined };

  const { error } = await supabase.from("ct_rounds").update(update).eq("id", round.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
