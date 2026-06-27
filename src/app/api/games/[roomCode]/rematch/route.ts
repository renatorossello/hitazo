import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isGameHost } from "@/lib/game/host";
import { getGameByRoom } from "@/lib/game/server";

/**
 * POST /api/games/:roomCode/rematch  (host/board)
 * Reinicia la MISMA partida con los mismos equipos: limpia líneas de tiempo y rondas,
 * resetea fichas y vuelve al lobby (el host vuelve a "Empezar"). Los jugadores siguen
 * conectados sin reingresar.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const supabase = createServiceClient();

  const game = await getGameByRoom(supabase, roomCode);
  if (!game) return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  if (!(await isGameHost(game.host_token))) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }

  const { data: teams } = await supabase.from("ct_teams").select("id").eq("game_id", game.id);
  const teamIds = (teams ?? []).map((t) => t.id);

  if (teamIds.length > 0) {
    await supabase.from("ct_team_cards").delete().in("team_id", teamIds);
  }
  await supabase.from("ct_rounds").delete().eq("game_id", game.id);
  await supabase.from("ct_teams").update({ tokens: 1 }).eq("game_id", game.id);
  await supabase
    .from("ct_games")
    .update({ status: "lobby", current_turn: 0, skipped_card_ids: [] })
    .eq("id", game.id);

  return NextResponse.json({ ok: true });
}
