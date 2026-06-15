/**
 * deck-engine.ts — Motor de armado de mazos para Cronotema
 * --------------------------------------------------------
 * Va en `lib/deck-engine.ts`. Lo consumen las rutas del admin (server-side):
 *
 *   POST   /api/admin/search            -> searchTracks()        (preview, no escribe)
 *   POST   /api/admin/import            -> importTracks()        (guarda como 'pending')
 *   POST   /api/admin/resolve           -> resolvePendingBatch() (MusicBrainz, 1/seg, por lotes)
 *   GET    /api/admin/resolve/progress  -> getProgress()
 *   PATCH  /api/admin/cards/:id         -> setManualYear()
 *
 * Reglas duras que respeta:
 *   - Spotify metadata con TOKEN DE USUARIO del host (client-credentials ya no sirve, feb-2026).
 *   - MusicBrainz: 1 request/seg + User-Agent identificable (obligatorio).
 *   - El año sale de MusicBrainz vía ISRC, NO de Spotify (release_date no es confiable).
 *
 * No lee env al importarse: las rutas le pasan el supabase client, el token y el user-agent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ----------------------------- Tipos ---------------------------------------
export type SpotifyTrack = {
  spotify_id: string;
  spotify_uri: string;
  title: string;
  artist: string;
  isrc: string | null;
  cover_url: string | null;
  spotify_year: number | null;
};

export type SearchParams = {
  yearFrom?: number;
  yearTo?: number;
  genre?: string;
  text?: string; // texto libre opcional
  max?: number;  // tope de resultados (default 50, máx útil 1000 por límite de Spotify)
};

// Formas mínimas de las respuestas JSON externas (lo que consumimos, nada más).
type SpotifySearchItem = {
  id: string;
  uri: string;
  name: string;
  artists?: { name: string }[];
  external_ids?: { isrc?: string };
  album?: { images?: { url: string }[]; release_date?: string };
};

type MusicBrainzRecording = { "first-release-date"?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseYear(date?: string | null): number | null {
  if (!date) return null;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

// ----------------------------- 1) Spotify Search ---------------------------
/** Busca tracks en Spotify. Para la pantalla "Buscar e importar" (preview). */
export async function searchTracks(
  token: string,
  params: SearchParams
): Promise<SpotifyTrack[]> {
  const max = params.max ?? 50;
  const parts: string[] = [];
  if (params.text) parts.push(params.text);
  if (params.yearFrom && params.yearTo) parts.push(`year:${params.yearFrom}-${params.yearTo}`);
  if (params.genre) parts.push(`genre:${params.genre}`);
  const q = encodeURIComponent(parts.join(" ").trim());

  const out: SpotifyTrack[] = [];
  let offset = 0;
  // Spotify redujo el máximo de `limit` de Search a 10 (default 5); antes era 50.
  // Paginamos de a `pageSize` respetando ese tope. Para el seed (max=1) → limit=1.
  const SPOTIFY_SEARCH_LIMIT = 10;
  const pageSize = Math.min(SPOTIFY_SEARCH_LIMIT, max);

  while (out.length < max) {
    const url = `https://api.spotify.com/v1/search?type=track&limit=${pageSize}&offset=${offset}&q=${q}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 401) throw new SpotifyAuthError("Token de Spotify vencido o inválido.");
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "2");
      await sleep((retry + 1) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Spotify search ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const items: SpotifySearchItem[] = data.tracks?.items ?? [];
    if (items.length === 0) break;

    for (const t of items) {
      out.push({
        spotify_id: t.id,
        spotify_uri: t.uri,
        title: t.name,
        artist: (t.artists ?? []).map((a) => a.name).join(", "),
        isrc: t.external_ids?.isrc ?? null,
        cover_url: t.album?.images?.[0]?.url ?? null,
        spotify_year: parseYear(t.album?.release_date),
      });
      if (out.length >= max) break;
    }

    offset += pageSize;
    if (offset >= 1000) break; // límite de paginación de Spotify Search
  }

  return out;
}

export class SpotifyAuthError extends Error {} // las rutas la pueden catchear p/ refrescar token

// ----------------------------- 2) Import -----------------------------------
/** Guarda tracks seleccionados como cartas 'pending' y las vincula a un mazo. */
export async function importTracks(
  supabase: SupabaseClient,
  tracks: SpotifyTrack[],
  filterId: string
): Promise<{ imported: number }> {
  if (tracks.length === 0) return { imported: 0 };

  const rows = tracks.map((t) => ({
    spotify_uri: t.spotify_uri,
    spotify_id: t.spotify_id,
    isrc: t.isrc,
    title: t.title,
    artist: t.artist,
    spotify_year: t.spotify_year,
    cover_url: t.cover_url,
    year_status: "pending" as const,
  }));

  const { data, error } = await supabase
    .from("ct_cards")
    .upsert(rows, { onConflict: "spotify_uri", ignoreDuplicates: false })
    .select("id");
  if (error) throw error;

  // vincular al filtro/mazo
  const links = (data ?? []).map((c) => ({ card_id: c.id, filter_id: filterId }));
  if (links.length) {
    await supabase.from("ct_card_filters").upsert(links, { onConflict: "card_id,filter_id" });
  }

  return { imported: data?.length ?? 0 };
}

// ----------------------------- 3) MusicBrainz ------------------------------
/** Año original (primer lanzamiento) por ISRC. Devuelve también los candidatos. */
export async function getOriginalYear(
  isrc: string,
  userAgent: string
): Promise<{ year: number | null; candidates: number[] }> {
  const url = `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}?inc=recordings&fmt=json`;
  const res = await fetch(url, { headers: { "User-Agent": userAgent } });

  if (res.status === 404) return { year: null, candidates: [] };
  if (res.status === 503) {
    await sleep(2000);
    return getOriginalYear(isrc, userAgent);
  }
  if (!res.ok) return { year: null, candidates: [] };

  const data = await res.json();
  const recordings: MusicBrainzRecording[] = data.recordings ?? [];
  const candidates = recordings
    .map((r) => parseYear(r["first-release-date"]))
    .filter((y): y is number => y !== null)
    .sort((a, b) => a - b);

  return { year: candidates.length ? candidates[0] : null, candidates: [...new Set(candidates)] };
}

// ----------------------------- 4) Resolución por lotes ----------------------
/**
 * Toma hasta `limit` cartas 'pending', las resuelve contra MusicBrainz respetando
 * 1 req/seg, y las pasa a 'resolved' o 'needs_review'. Idempotente y reanudable
 * (el estado vive en la DB). Llamar en loop desde la UI hasta que no queden 'pending'.
 */
export async function resolvePendingBatch(
  supabase: SupabaseClient,
  userAgent: string,
  limit = 10
): Promise<{ processed: number; resolved: number; review: number; remaining: number }> {
  const { data: pending, error } = await supabase
    .from("ct_cards")
    .select("id, isrc")
    .eq("year_status", "pending")
    .limit(limit);
  if (error) throw error;

  let resolved = 0;
  let review = 0;

  for (const card of pending ?? []) {
    if (!card.isrc) {
      await supabase.from("ct_cards").update({ year_status: "needs_review" }).eq("id", card.id);
      review++;
      continue;
    }

    const { year, candidates } = await getOriginalYear(card.isrc, userAgent);
    await sleep(1100); // rate limit MusicBrainz: 1 req/seg

    if (year !== null) {
      await supabase
        .from("ct_cards")
        .update({ release_year: year, year_source: "musicbrainz", year_status: "resolved", mb_candidates: candidates })
        .eq("id", card.id);
      resolved++;
    } else {
      await supabase
        .from("ct_cards")
        .update({ year_status: "needs_review", mb_candidates: candidates })
        .eq("id", card.id);
      review++;
    }
  }

  const { count: remaining } = await supabase
    .from("ct_cards")
    .select("id", { count: "exact", head: true })
    .eq("year_status", "pending");

  return { processed: pending?.length ?? 0, resolved, review, remaining: remaining ?? 0 };
}

// ----------------------------- 5) Progreso ---------------------------------
export async function getProgress(supabase: SupabaseClient): Promise<Record<string, number>> {
  const statuses = ["pending", "resolving", "resolved", "needs_review", "manual"];
  const out: Record<string, number> = {};
  for (const s of statuses) {
    const { count } = await supabase
      .from("ct_cards")
      .select("id", { count: "exact", head: true })
      .eq("year_status", s);
    out[s] = count ?? 0;
  }
  return out;
}

// ----------------------------- 6) Edición manual ----------------------------
/** El admin fija el año a mano desde la pantalla de revisión. */
export async function setManualYear(
  supabase: SupabaseClient,
  cardId: string,
  year: number
): Promise<void> {
  const { error } = await supabase
    .from("ct_cards")
    .update({ release_year: year, year_source: "manual", year_status: "manual" })
    .eq("id", cardId);
  if (error) throw error;
}

/* ----------------------------------------------------------------------------
 * Ejemplo de route handler (Next.js App Router) — POST /api/admin/resolve
 * ----------------------------------------------------------------------------
 * import { createClient } from "@supabase/supabase-js";
 * import { resolvePendingBatch } from "@/lib/deck-engine";
 *
 * export async function POST() {
 *   const supabase = createClient(
 *     process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *     process.env.SUPABASE_SERVICE_ROLE_KEY!,        // service role: escribe sin RLS
 *     { auth: { persistSession: false } }
 *   );
 *   const result = await resolvePendingBatch(supabase, process.env.MUSICBRAINZ_USER_AGENT!, 10);
 *   return Response.json(result);
 * }
 *
 * La UI llama a esto en loop mientras result.remaining > 0, y hace polling de
 * /api/admin/resolve/progress para la barra de progreso.
 * -------------------------------------------------------------------------- */
