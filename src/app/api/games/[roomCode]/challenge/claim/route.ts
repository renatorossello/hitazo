import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getGameByRoom, getCurrentRound } from "@/lib/game/server";

/**
 * POST /api/games/:roomCode/challenge/claim  { teamId }
 * Reclama el cupo exclusivo de desafío. Arbitraje server-side: el update condicional
 * sobre challenger_id IS NULL hace que gane la PRIMERA escritura (resto → 409).
 * Gasta 1 ficha al reclamar (gane o pierda).
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
    return NextResponse.json({ error: "cannot_challenge_own_turn" }, { status: 403 });
  }
  if (round.declined_team_ids.includes(teamId)) {
    return NextResponse.json({ error: "already_declined" }, { status: 409 });
  }

  // El equipo debe existir en la partida y tener al menos 1 ficha.
  const { data: team } = await supabase
    .from("ct_teams")
    .select("id, tokens")
    .eq("id", teamId)
    .eq("game_id", game.id)
    .maybeSingle();
  if (!team) return NextResponse.json({ error: "team_not_found" }, { status: 404 });
  if (team.tokens < 1) return NextResponse.json({ error: "no_tokens" }, { status: 400 });

  // Claim atómico: solo prospera si challenger_id seguía en null. .select() devuelve
  // filas afectadas; 0 filas = otro equipo ganó el cupo.
  const { data: claimed } = await supabase
    .from("ct_rounds")
    .update({ challenger_id: teamId, challenge_claimed_at: new Date().toISOString() })
    .eq("id", round.id)
    .eq("phase", "challenge")
    .is("challenger_id", null)
    .select("id");

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }

  // Gasta la ficha (siempre, gane o pierda).
  await supabase.from("ct_teams").update({ tokens: team.tokens - 1 }).eq("id", teamId);

  return NextResponse.json({ ok: true });
}
