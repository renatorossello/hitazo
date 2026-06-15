import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mazo "vivo" de una partida: cartas jugables (year_status resolved|manual y
 * release_year no nulo) de los filtros elegidos, menos las ya usadas en la partida.
 */
export type DeckCard = {
  id: string;
  release_year: number;
  spotify_uri: string;
  title: string;
  artist: string;
  cover_url: string | null;
};

/** Todas las cartas jugables (opcionalmente acotadas a unos filtros/mazos). */
export async function getPlayableCards(
  supabase: SupabaseClient,
  filterIds: string[] | null
): Promise<DeckCard[]> {
  // Si hay filtros, primero resolvemos qué card_ids pertenecen a esos mazos.
  let restrictIds: string[] | null = null;
  if (filterIds && filterIds.length > 0) {
    const { data: links } = await supabase
      .from("ct_card_filters")
      .select("card_id")
      .in("filter_id", filterIds);
    restrictIds = (links ?? []).map((l) => l.card_id);
    if (restrictIds.length === 0) return [];
  }

  let query = supabase
    .from("ct_cards")
    .select("id, release_year, spotify_uri, title, artist, cover_url")
    .in("year_status", ["resolved", "manual"])
    .not("release_year", "is", null);

  if (restrictIds) query = query.in("id", restrictIds);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DeckCard[];
}

/** Cartas ya usadas en la partida (anclas, ubicadas, o jugadas en rondas). */
export async function getUsedCardIds(
  supabase: SupabaseClient,
  gameId: string
): Promise<Set<string>> {
  const used = new Set<string>();

  const { data: teams } = await supabase.from("ct_teams").select("id").eq("game_id", gameId);
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length > 0) {
    const { data: tc } = await supabase.from("ct_team_cards").select("card_id").in("team_id", teamIds);
    for (const r of tc ?? []) if (r.card_id) used.add(r.card_id);
  }

  const { data: rounds } = await supabase.from("ct_rounds").select("card_id").eq("game_id", gameId);
  for (const r of rounds ?? []) if (r.card_id) used.add(r.card_id);

  return used;
}

/** Mezcla Fisher-Yates con crypto (no usamos Math.random). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Devuelve `count` cartas jugables al azar que todavía no se usaron en la partida. */
export async function pickUnusedCards(
  supabase: SupabaseClient,
  gameId: string,
  filterIds: string[] | null,
  count: number
): Promise<DeckCard[]> {
  const playable = await getPlayableCards(supabase, filterIds);
  const used = await getUsedCardIds(supabase, gameId);
  const available = playable.filter((c) => !used.has(c.id));
  return shuffle(available).slice(0, count);
}

/** Cuántas cartas jugables quedan disponibles (para validar el setup / fin por mazo). */
export async function countAvailable(
  supabase: SupabaseClient,
  gameId: string,
  filterIds: string[] | null
): Promise<number> {
  const playable = await getPlayableCards(supabase, filterIds);
  const used = await getUsedCardIds(supabase, gameId);
  return playable.filter((c) => !used.has(c.id)).length;
}
