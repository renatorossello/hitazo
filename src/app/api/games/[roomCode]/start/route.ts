import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isHostAuthenticated } from "@/lib/spotify/auth";
import { pickUnusedCards } from "@/lib/game/deck";

/**
 * POST /api/games/:roomCode/start  (host-only)
 * Setup: reparte 1 carta ancla revelada por equipo (con 1 ficha, ya por default),
 * fija el orden de turnos (join_order), elige la primera carta y arranca el turno 0.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ roomCode: string }> }) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "no_host_session" }, { status: 401 });
  }
  const { roomCode } = await params;
  const supabase = createServiceClient();

  const { data: game } = await supabase
    .from("ct_games")
    .select("id, status, filter_ids")
    .eq("room_code", roomCode.toUpperCase())
    .single();
  if (!game) return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  if (game.status !== "lobby") {
    return NextResponse.json({ error: "already_started" }, { status: 409 });
  }

  const { data: teams } = await supabase
    .from("ct_teams")
    .select("id, join_order")
    .eq("game_id", game.id)
    .order("join_order", { ascending: true });

  if (!teams || teams.length < 2) {
    return NextResponse.json({ error: "need_two_teams" }, { status: 400 });
  }

  const filterIds = (game.filter_ids as string[]) ?? null;

  // Anclas: 1 carta por equipo. Necesitamos además al menos 1 para el primer turno.
  const anchors = await pickUnusedCards(supabase, game.id, filterIds, teams.length);
  if (anchors.length < teams.length) {
    return NextResponse.json({ error: "not_enough_cards" }, { status: 400 });
  }

  const anchorRows = teams.map((t, i) => ({
    team_id: t.id,
    card_id: anchors[i].id,
    release_year: anchors[i].release_year,
    position: 0,
    is_anchor: true,
  }));
  const { error: anchorErr } = await supabase.from("ct_team_cards").insert(anchorRows);
  if (anchorErr) return NextResponse.json({ error: anchorErr.message }, { status: 500 });

  // Primera carta del juego (excluye las anclas recién insertadas).
  const [first] = await pickUnusedCards(supabase, game.id, filterIds, 1);
  if (!first) return NextResponse.json({ error: "not_enough_cards" }, { status: 400 });

  const { error: roundErr } = await supabase.from("ct_rounds").insert({
    game_id: game.id,
    turn_index: 0,
    team_id: teams[0].id, // turno 0 = menor join_order
    card_id: first.id,
    phase: "playing",
  });
  if (roundErr) return NextResponse.json({ error: roundErr.message }, { status: 500 });

  const { error: gameErr } = await supabase
    .from("ct_games")
    .update({ status: "playing", current_turn: 0 })
    .eq("id", game.id);
  if (gameErr) return NextResponse.json({ error: gameErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
