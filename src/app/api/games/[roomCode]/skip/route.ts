import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isGameHost } from "@/lib/game/host";
import { getGameByRoom, getCurrentRound, phaseUpdate } from "@/lib/game/server";
import { pickUnusedCards } from "@/lib/game/deck";

/**
 * POST /api/games/:roomCode/skip  (host/board)
 * Saltea el tema del turno actual (p. ej. ya salió en una partida anterior) y lo
 * cambia por otro, SIN cambiar el turno. Solo si todavía no lo ubicaron (fase
 * 'playing'). El tema salteado no vuelve a aparecer en esta partida.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
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
  if (round.phase !== "playing") {
    return NextResponse.json({ error: "already_placed" }, { status: 409 });
  }

  // Recordar la carta salteada (para que no reaparezca en esta partida).
  const { data: g } = await supabase
    .from("ct_games")
    .select("skipped_card_ids")
    .eq("id", game.id)
    .single();
  const skipped = [...((g?.skipped_card_ids as string[] | null) ?? []), round.card_id];
  await supabase.from("ct_games").update({ skipped_card_ids: skipped }).eq("id", game.id);

  // Nueva carta (excluye usadas + salteadas) para el mismo turno.
  const [card] = await pickUnusedCards(supabase, game.id, game.filter_ids, 1);
  if (!card) {
    return NextResponse.json({ error: "no_more_cards" }, { status: 400 });
  }

  await supabase
    .from("ct_rounds")
    .update({ card_id: card.id, played: false, ...phaseUpdate("playing") })
    .eq("id", round.id);

  return NextResponse.json({ ok: true });
}
