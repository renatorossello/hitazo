import { NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/game/room-code";

// Config por defecto de la partida (sección 4 del PRD).
const DEFAULT_CONFIG = { turnTimerSec: 60, challengeWindowSec: 15, targetCards: 10 };

/**
 * POST /api/games/create
 * Crea una partida en estado lobby. Solo el host (con sesión de Spotify) puede.
 * Devuelve { roomCode }.
 */
export async function POST() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Reintenta ante colisión de room_code (unique violation = 23505).
  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode();
    const { data, error } = await supabase
      .from("ct_games")
      .insert({ room_code: roomCode, status: "lobby", config: DEFAULT_CONFIG })
      .select("room_code")
      .single();

    if (!error && data) {
      return NextResponse.json({ roomCode: data.room_code });
    }
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "room_code_collision" }, { status: 500 });
}
