import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { generateRoomCode } from "@/lib/game/room-code";
import { HOST_COOKIE, hostCookieOptions } from "@/lib/game/host";

// Config por defecto de la partida. turnTimerSec null = sin límite para ubicar.
// playbackMode: 'sdk' (host con Spotify, audio por Web Playback SDK) | 'manual'
// (host sin API: reproduce en su propio Spotify vía deep link).
const DEFAULT_CONFIG = {
  turnTimerSec: null,
  challengeWindowSec: 30,
  closeTurnSec: 20,
  targetCards: 10,
};

/**
 * POST /api/games/create  { mode?: 'sdk' | 'manual' }
 * Crea una partida en lobby. En modo 'sdk' exige sesión de Spotify (como siempre).
 * En modo 'manual' NO exige Spotify (host sin allowlist): genera un host_token y lo
 * deja en cookie httpOnly para que ese browser sea la autoridad del board.
 * Devuelve { roomCode, mode }.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { mode?: "sdk" | "manual" };
  const mode: "sdk" | "manual" = body.mode === "manual" ? "manual" : "sdk";

  if (mode === "sdk" && !(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const hostToken = crypto.randomUUID();
  const config = { ...DEFAULT_CONFIG, playbackMode: mode };

  // Reintenta ante colisión de room_code (unique violation = 23505).
  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode();
    const { data, error } = await supabase
      .from("ct_games")
      .insert({ room_code: roomCode, status: "lobby", config, host_token: hostToken })
      .select("room_code")
      .single();

    if (!error && data) {
      const res = NextResponse.json({ roomCode: data.room_code, mode });
      // Este browser queda como host/board de la partida (vale aun sin Spotify).
      res.cookies.set(HOST_COOKIE, hostToken, hostCookieOptions());
      return res;
    }
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "room_code_collision" }, { status: 500 });
}
