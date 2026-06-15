import type { SupabaseClient } from "@supabase/supabase-js";
import { pickUnusedCards } from "@/lib/game/deck";

/**
 * Helpers server-side compartidos por las rutas del loop. Toda la lógica autoritativa
 * (validación de turno, avance, resolución) vive en el servidor; los clientes mandan
 * intenciones con su teamId (sin auth fuerte: es un juego presencial entre amigos).
 */

export type GameRow = {
  id: string;
  status: string;
  current_turn: number;
  config: { turnTimerSec: number | null; challengeWindowSec: number; targetCards: number };
  filter_ids: string[] | null;
};

export type RoundRow = {
  id: string;
  turn_index: number;
  team_id: string | null;
  phase: string;
  guessed_meta: boolean;
  placed_position: number | null;
  placed_correct: boolean | null;
  challenger_id: string | null;
  challenge_position: number | null;
  challenge_correct: boolean | null;
  card_winner_id: string | null;
  meta_awarded: boolean | null;
  card_id: string;
  card_year: number;
};

const DEFAULT_CONFIG = { turnTimerSec: 60, challengeWindowSec: 15, targetCards: 10 };

export async function getGameByRoom(supabase: SupabaseClient, roomCode: string): Promise<GameRow | null> {
  const { data } = await supabase
    .from("ct_games")
    .select("id, status, current_turn, config, filter_ids")
    .eq("room_code", roomCode.toUpperCase())
    .single();
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    current_turn: data.current_turn,
    config: { ...DEFAULT_CONFIG, ...(data.config ?? {}) },
    filter_ids: (data.filter_ids as string[]) ?? null,
  };
}

/** Ronda en curso (turn_index = current_turn) con el año de la carta. */
export async function getCurrentRound(supabase: SupabaseClient, game: GameRow): Promise<RoundRow | null> {
  const { data } = await supabase
    .from("ct_rounds")
    .select(
      "id, turn_index, team_id, phase, guessed_meta, placed_position, placed_correct, challenger_id, challenge_position, challenge_correct, card_winner_id, meta_awarded, card_id, ct_cards(release_year)"
    )
    .eq("game_id", game.id)
    .eq("turn_index", game.current_turn)
    .maybeSingle();
  if (!data) return null;
  const card = data.ct_cards as unknown as { release_year: number } | null;
  return {
    id: data.id,
    turn_index: data.turn_index,
    team_id: data.team_id,
    phase: data.phase,
    guessed_meta: Boolean(data.guessed_meta),
    placed_position: data.placed_position,
    placed_correct: data.placed_correct,
    challenger_id: data.challenger_id,
    challenge_position: data.challenge_position,
    challenge_correct: data.challenge_correct,
    card_winner_id: data.card_winner_id,
    meta_awarded: data.meta_awarded,
    card_id: data.card_id,
    card_year: card?.release_year ?? 0,
  };
}

/** Años de la línea de tiempo de un equipo, ordenados ascendente. */
export async function getTeamYears(supabase: SupabaseClient, teamId: string): Promise<number[]> {
  const { data } = await supabase.from("ct_team_cards").select("release_year").eq("team_id", teamId);
  return (data ?? []).map((c) => c.release_year as number).sort((a, b) => a - b);
}

export async function teamsInOrder(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ id: string; join_order: number; tokens: number }[]> {
  const { data } = await supabase
    .from("ct_teams")
    .select("id, join_order, tokens")
    .eq("game_id", gameId)
    .order("join_order", { ascending: true });
  return (data ?? []) as { id: string; join_order: number; tokens: number }[];
}

/** Inserta la carta ganada y renumera la línea del equipo por año ascendente. */
export async function addCardToTimeline(
  supabase: SupabaseClient,
  teamId: string,
  cardId: string,
  year: number
): Promise<number> {
  await supabase.from("ct_team_cards").insert({
    team_id: teamId,
    card_id: cardId,
    release_year: year,
    position: 9999, // temporal; se renumera abajo
  });
  // Renumerar por año.
  const { data: cards } = await supabase
    .from("ct_team_cards")
    .select("id, release_year")
    .eq("team_id", teamId)
    .order("release_year", { ascending: true });
  const rows = cards ?? [];
  for (let i = 0; i < rows.length; i++) {
    await supabase.from("ct_team_cards").update({ position: i }).eq("id", rows[i].id);
  }
  return rows.length;
}

export async function getTeamCardCount(supabase: SupabaseClient, teamId: string): Promise<number> {
  const { count } = await supabase
    .from("ct_team_cards")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  return count ?? 0;
}

/**
 * Avanza al siguiente turno o termina la partida.
 *
 * Fin "justo": todos los equipos juegan la MISMA cantidad de turnos. La partida solo
 * puede terminar al cierre de una vuelta completa (cuando jugó el último del orden).
 * En ese cierre, si algún equipo llegó a targetCards y hay un ÚNICO líder en cartas,
 * gana. Si hay empate arriba, se sigue otra vuelta hasta que uno quede solo adelante.
 * También termina si se agota el mazo (gana el de más cartas, lo resuelve el estado).
 */
export async function advanceOrFinish(supabase: SupabaseClient, game: GameRow): Promise<void> {
  const teams = await teamsInOrder(supabase, game.id);
  const n = teams.length;
  const lapComplete = (game.current_turn + 1) % n === 0;

  if (lapComplete) {
    const counts = await Promise.all(teams.map((t) => getTeamCardCount(supabase, t.id)));
    const max = Math.max(...counts);
    const leaders = counts.filter((c) => c === max).length;
    if (max >= game.config.targetCards && leaders === 1) {
      await supabase.from("ct_games").update({ status: "finished" }).eq("id", game.id);
      return;
    }
  }

  const nextTurn = game.current_turn + 1;
  const nextTeam = teams[nextTurn % n];

  const [card] = await pickUnusedCards(supabase, game.id, game.filter_ids, 1);
  if (!card) {
    await supabase.from("ct_games").update({ status: "finished" }).eq("id", game.id);
    return;
  }

  await supabase.from("ct_rounds").insert({
    game_id: game.id,
    turn_index: nextTurn,
    team_id: nextTeam.id,
    card_id: card.id,
    phase: "playing",
  });
  await supabase.from("ct_games").update({ current_turn: nextTurn }).eq("id", game.id);
}
