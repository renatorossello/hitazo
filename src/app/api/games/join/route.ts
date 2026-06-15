import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/games/join  { roomCode, teamName }
 * Un jugador entra a una partida en lobby con el código y el nombre de su equipo.
 * Inserta el equipo (persistente, para join_order/turnos) y devuelve su identidad,
 * que el cliente guarda en localStorage del celular (sin login, según el PRD).
 */
export async function POST(req: NextRequest) {
  let body: { roomCode?: string; teamName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const roomCode = (body.roomCode ?? "").trim().toUpperCase();
  const teamName = (body.teamName ?? "").trim();

  if (!roomCode || !teamName) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (teamName.length > 40) {
    return NextResponse.json({ error: "name_too_long" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: game, error: gameErr } = await supabase
    .from("ct_games")
    .select("id, status")
    .eq("room_code", roomCode)
    .single();

  if (gameErr || !game) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  if (game.status !== "lobby") {
    return NextResponse.json({ error: "game_not_in_lobby" }, { status: 409 });
  }

  // join_order = siguiente en la partida. Suficiente para el MVP (sin contención alta).
  const { data: last } = await supabase
    .from("ct_teams")
    .select("join_order")
    .eq("game_id", game.id)
    .order("join_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const joinOrder = (last?.join_order ?? 0) + 1;

  const { data: team, error: teamErr } = await supabase
    .from("ct_teams")
    .insert({ game_id: game.id, name: teamName, join_order: joinOrder })
    .select("id, name, join_order")
    .single();

  if (teamErr || !team) {
    return NextResponse.json({ error: teamErr?.message ?? "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({
    teamId: team.id,
    teamName: team.name,
    joinOrder: team.join_order,
    roomCode,
  });
}
