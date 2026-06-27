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
  const hasFilter = Array.isArray(filterIds) && filterIds.length > 0;

  // Filtramos por los filter_id (pocos) vía inner join, NO por una lista de ~100
  // card_id: eso armaba un .in("id", [100 uuids]) con una URL gigante que en prod
  // hacía fallar el fetch a Supabase ("fetch failed") con mazos grandes.
  const cols = "id, release_year, spotify_uri, title, artist, cover_url";
  let query = supabase
    .from("ct_cards")
    .select(hasFilter ? `${cols}, ct_card_filters!inner(filter_id)` : cols)
    .in("year_status", ["resolved", "manual"])
    .not("release_year", "is", null);

  if (hasFilter) query = query.in("ct_card_filters.filter_id", filterIds!);

  const { data, error } = await query;
  if (error) throw error;

  // El inner join repite una carta si está en varios mazos elegidos → dedup por id.
  const seen = new Set<string>();
  const out: DeckCard[] = [];
  for (const c of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const id = c.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      release_year: c.release_year as number,
      spotify_uri: c.spotify_uri as string,
      title: c.title as string,
      artist: c.artist as string,
      cover_url: (c.cover_url as string | null) ?? null,
    });
  }
  return out;
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

  // Cartas salteadas por el host en esta partida.
  const { data: game } = await supabase
    .from("ct_games")
    .select("skipped_card_ids")
    .eq("id", gameId)
    .maybeSingle();
  for (const id of (game?.skipped_card_ids as string[] | null) ?? []) used.add(id);

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

/**
 * Identidad de CANCIÓN (no de carta) para no repetir el mismo tema en una partida
 * cuando entra por dos cartas distintas (otra playlist, remaster, otro URI de Spotify).
 * Normaliza título+artista: saca acentos, paréntesis/corchetes y sufijos con guion
 * ("- 2013 Remaster", "- Live", "- Mono"), y se queda con el primer artista.
 */
export function songKey(card: { title: string; artist: string }): string {
  const deburr = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const base = deburr(card.title);
  const strippedTitle = base
    .replace(/\(.*?\)|\[.*?\]/g, " ") // quita "(feat. ...)", "(Radio Edit)", etc.
    .replace(/\s-\s.*$/, " ") // quita "- Remaster", "- Live", "- Mono", "- ... Version"
    .replace(/[^a-z0-9]+/g, "");
  const title = strippedTitle || base.replace(/[^a-z0-9]+/g, ""); // fallback si quedó vacío
  const artist = deburr(card.artist.split(/[,&]|feat/i)[0]).replace(/[^a-z0-9]+/g, "");
  return `${title}|${artist}`;
}

/**
 * Pool de cartas disponibles para la partida: jugables, menos las ya usadas, y
 * deduplicado por identidad de canción (una sola carta por tema, descartando las
 * cuyo tema ya se jugó o ya entró al pool). Es la fuente única para sortear y contar.
 */
async function availablePool(
  supabase: SupabaseClient,
  gameId: string,
  filterIds: string[] | null
): Promise<DeckCard[]> {
  const playable = await getPlayableCards(supabase, filterIds);
  const used = await getUsedCardIds(supabase, gameId);

  // Temas ya usados en la partida (por si el "gemelo" entró por otra carta).
  const seen = new Set<string>(playable.filter((c) => used.has(c.id)).map(songKey));

  const out: DeckCard[] = [];
  for (const c of playable) {
    if (used.has(c.id)) continue;
    const key = songKey(c);
    if (seen.has(key)) continue; // mismo tema que uno ya jugado o ya elegido
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Devuelve `count` cartas jugables al azar que todavía no se usaron en la partida. */
export async function pickUnusedCards(
  supabase: SupabaseClient,
  gameId: string,
  filterIds: string[] | null,
  count: number
): Promise<DeckCard[]> {
  const available = await availablePool(supabase, gameId, filterIds);
  return shuffle(available).slice(0, count);
}

/** Cuántas cartas jugables quedan disponibles (para validar el setup / fin por mazo). */
export async function countAvailable(
  supabase: SupabaseClient,
  gameId: string,
  filterIds: string[] | null
): Promise<number> {
  return (await availablePool(supabase, gameId, filterIds)).length;
}
