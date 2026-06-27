import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Estado autoritativo de la partida, leído desde Postgres. Lo consume el endpoint
 * GET /state y las rutas de mutación (para validar). El año/título/artista de la
 * carta EN JUEGO no se exponen hasta el reveal; el URI solo va para el host.
 */

export type TimelineCard = {
  cardId: string;
  year: number;
  position: number;
  isAnchor: boolean;
  title: string;
  artist: string;
  coverUrl: string | null;
};

export type StateTeam = {
  id: string;
  name: string;
  tokens: number;
  joinOrder: number;
  cards: TimelineCard[];
};

export type RoundReveal = {
  year: number;
  title: string;
  artist: string;
  coverUrl: string | null;
};

export type StateRound = {
  id: string;
  turnIndex: number;
  teamId: string | null;
  phase: string; // playing | challenge | closing | reveal | resolved
  played: boolean; // la carta ya empezó a sonar
  phaseStartedAt: string | null; // ISO; para countdowns sincronizados
  declinedTeamIds: string[]; // equipos sin turno que tocaron "NO desafío"
  cardUri: string | null; // solo para el host
  guessedMeta: boolean;
  placedPosition: number | null;
  placedCorrect: boolean | null;
  challengerId: string | null;
  challengePosition: number | null;
  challengeCorrect: boolean | null;
  cardWinnerId: string | null;
  metaAwarded: boolean | null;
  reveal: RoundReveal | null;
};

export type GameConfig = {
  turnTimerSec: number | null;
  challengeWindowSec: number;
  closeTurnSec: number;
  targetCards: number;
  // 'sdk' = host con Spotify, audio por Web Playback SDK. 'manual' = host sin API,
  // reproduce en su propio Spotify vía deep link (modo "público", sin allowlist).
  playbackMode: "sdk" | "manual";
};

export type GameState = {
  gameId: string;
  roomCode: string;
  status: string; // lobby | playing | finished
  currentTurn: number;
  config: GameConfig;
  filterIds: string[] | null;
  teams: StateTeam[];
  round: StateRound | null;
  winnerTeamId: string | null;
};

const DEFAULT_CONFIG: GameConfig = {
  turnTimerSec: null,
  challengeWindowSec: 30,
  closeTurnSec: 20,
  targetCards: 10,
  playbackMode: "sdk",
};

type EmbeddedCard = {
  title: string;
  artist: string;
  cover_url: string | null;
  release_year: number | null;
  spotify_uri: string;
};

export async function loadGameState(
  supabase: SupabaseClient,
  roomCode: string,
  opts: { includeCardUri: boolean }
): Promise<GameState | null> {
  const { data: game } = await supabase
    .from("ct_games")
    .select("id, room_code, status, current_turn, config, filter_ids")
    .eq("room_code", roomCode.toUpperCase())
    .single();
  if (!game) return null;

  const config: GameConfig = { ...DEFAULT_CONFIG, ...(game.config ?? {}) };

  // Equipos + sus líneas de tiempo (con metadata de la carta vía embed por FK).
  const { data: teamsRaw } = await supabase
    .from("ct_teams")
    .select("id, name, tokens, join_order")
    .eq("game_id", game.id)
    .order("join_order", { ascending: true });

  const teams: StateTeam[] = [];
  for (const t of teamsRaw ?? []) {
    const { data: cards } = await supabase
      .from("ct_team_cards")
      .select("card_id, release_year, position, is_anchor, ct_cards(title, artist, cover_url)")
      .eq("team_id", t.id)
      .order("position", { ascending: true });

    teams.push({
      id: t.id,
      name: t.name,
      tokens: t.tokens,
      joinOrder: t.join_order,
      cards: (cards ?? []).map((c) => {
        const meta = c.ct_cards as unknown as { title: string; artist: string; cover_url: string | null } | null;
        return {
          cardId: c.card_id as string,
          year: c.release_year as number,
          position: c.position as number,
          isAnchor: c.is_anchor as boolean,
          title: meta?.title ?? "",
          artist: meta?.artist ?? "",
          coverUrl: meta?.cover_url ?? null,
        };
      }),
    });
  }

  // Ronda en curso (turn_index = current_turn).
  let round: StateRound | null = null;
  let winnerTeamId: string | null = null;

  if (game.status !== "lobby") {
    const { data: r } = await supabase
      .from("ct_rounds")
      .select(
        "id, turn_index, team_id, phase, played, phase_started_at, declined_team_ids, guessed_meta, placed_position, placed_correct, challenger_id, challenge_position, challenge_correct, card_winner_id, meta_awarded, ct_cards(title, artist, cover_url, release_year, spotify_uri)"
      )
      .eq("game_id", game.id)
      .eq("turn_index", game.current_turn)
      .maybeSingle();

    if (r) {
      const card = (r.ct_cards as unknown as EmbeddedCard) ?? null;
      const revealed = r.phase === "reveal" || r.phase === "resolved";

      round = {
        id: r.id as string,
        turnIndex: r.turn_index as number,
        teamId: (r.team_id as string) ?? null,
        phase: r.phase as string,
        played: Boolean(r.played),
        phaseStartedAt: (r.phase_started_at as string) ?? null,
        declinedTeamIds: (r.declined_team_ids as string[] | null) ?? [],
        cardUri: opts.includeCardUri ? (card?.spotify_uri ?? null) : null,
        guessedMeta: Boolean(r.guessed_meta),
        placedPosition: (r.placed_position as number) ?? null,
        placedCorrect: (r.placed_correct as boolean) ?? null,
        challengerId: (r.challenger_id as string) ?? null,
        challengePosition: (r.challenge_position as number) ?? null,
        challengeCorrect: (r.challenge_correct as boolean) ?? null,
        cardWinnerId: (r.card_winner_id as string) ?? null,
        metaAwarded: (r.meta_awarded as boolean) ?? null,
        reveal:
          revealed && card
            ? {
                year: card.release_year ?? 0,
                title: card.title,
                artist: card.artist,
                coverUrl: card.cover_url,
              }
            : null,
      };
    }

    if (game.status === "finished") {
      // Ganador = equipo con más cartas (en empate, el de menor join_order).
      winnerTeamId =
        [...teams].sort((a, b) => b.cards.length - a.cards.length || a.joinOrder - b.joinOrder)[0]?.id ?? null;
    }
  }

  return {
    gameId: game.id,
    roomCode: game.room_code,
    status: game.status,
    currentTurn: game.current_turn,
    config,
    filterIds: (game.filter_ids as string[]) ?? null,
    teams,
    round,
    winnerTeamId,
  };
}
