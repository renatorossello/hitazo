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
  artist_id: string | null; // artista principal (para traer géneros)
  isrc: string | null;
  cover_url: string | null;
  spotify_year: number | null;
  genres?: string[]; // crudos del artista
  genreBuckets?: string[]; // categorías amplias derivadas
  region?: string; // idioma/región aprox
};

export type SearchParams = {
  yearFrom?: number;
  yearTo?: number;
  genre?: string;
  artist?: string;
  text?: string; // texto libre opcional
  max?: number;  // tope de resultados (default 50, máx útil 1000 por límite de Spotify)
};

// Formas mínimas de las respuestas JSON externas (lo que consumimos, nada más).
type SpotifySearchItem = {
  id: string;
  uri: string;
  name: string;
  artists?: { id: string; name: string }[];
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
  if (params.artist) parts.push(`artist:${params.artist}`);
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
        artist_id: t.artists?.[0]?.id ?? null,
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

// ------------------------- 1b) Géneros / región ----------------------------
// Spotify da géneros a nivel ARTISTA y muy granulares. Los traemos y derivamos
// categorías amplias + una región/idioma aproximado (editable a mano después).

const BUCKET_KEYWORDS: Record<string, string[]> = {
  Pop: ["pop"],
  Rock: ["rock", "punk", "grunge", "britpop"],
  Metal: ["metal"],
  "Rap/Hip-hop": ["hip hop", "rap", "trap", "drill"],
  "R&B/Soul": ["r&b", "rnb", "soul", "funk", "motown"],
  Electrónica: ["edm", "house", "techno", "trance", "electro", "dance", "dubstep", "drum and bass", "synth"],
  Latino: ["latin", "reggaeton", "tango", "cumbia", "salsa", "bachata", "merengue", "ranchera", "mariachi", "bolero", "vallenato", "norteñ", "banda", "corrido", "flamenco", "español", "argentin", "mexican", "cuarteto"],
  Reggae: ["reggae", "ska", "dancehall"],
  "Folk/Country": ["folk", "country", "americana", "bluegrass"],
  "Jazz/Blues": ["jazz", "blues", "swing"],
  "Indie/Alt": ["indie", "alternative", "alt "],
  Clásica: ["classical", "orchestra", "opera", "soundtrack"],
};

const REGION_KEYWORDS: { region: string; kw: string[] }[] = [
  { region: "Latino", kw: ["latin", "reggaeton", "tango", "cumbia", "salsa", "bachata", "merengue", "ranchera", "mariachi", "bolero", "vallenato", "norteñ", "banda", "corrido", "español", "argentin", "mexican", "chilean", "colombian", "cuarteto", "rock en espanol", "rock nacional"] },
  { region: "Brasil", kw: ["brazil", "mpb", "bossa", "samba", "sertanejo", "pagode", "forró", "axé", "funk carioca"] },
  { region: "K-pop", kw: ["k-pop", "korean"] },
  { region: "J-pop", kw: ["j-pop", "japanese", "j-rock", "anime"] },
  { region: "Francés", kw: ["french", "chanson", "française", "variété"] },
  { region: "Italiano", kw: ["italian", "italo"] },
  { region: "Alemán", kw: ["german", "deutsch", "schlager"] },
];

export function deriveBuckets(genres: string[]): string[] {
  const lower = genres.map((g) => g.toLowerCase());
  const buckets: string[] = [];
  for (const [bucket, kws] of Object.entries(BUCKET_KEYWORDS)) {
    if (lower.some((g) => kws.some((k) => g.includes(k)))) buckets.push(bucket);
  }
  return buckets.length ? buckets : ["Otros"];
}

export function deriveRegion(genres: string[]): string {
  const lower = genres.map((g) => g.toLowerCase());
  for (const { region, kw } of REGION_KEYWORDS) {
    if (lower.some((g) => kw.some((k) => g.includes(k)))) return region;
  }
  return genres.length ? "Anglo" : "Desconocido";
}

/**
 * Trae el género desde DEEZER (API pública, sin key) — Spotify bloquea /artists en
 * Dev Mode. Busca el tema y toma los géneros del álbum. Cachea por artista (un género
 * por artista alcanza para el bucket) para no spamear Deezer.
 */
export async function enrichWithGenres(tracks: SpotifyTrack[]): Promise<void> {
  const cache = new Map<string, string[]>();
  const albumGenreCache = new Map<number, string[]>();

  for (const t of tracks) {
    const firstArtist = t.artist.split(",")[0].trim();
    const key = firstArtist.toLowerCase();
    let genres = cache.get(key);

    if (genres === undefined) {
      genres = [];
      try {
        const q = `artist:"${firstArtist}" track:"${t.title}"`;
        const s = await fetch(`https://api.deezer.com/search?limit=1&q=${encodeURIComponent(q)}`);
        const sb = await s.json().catch(() => ({}));
        const albumId: number | undefined = sb?.data?.[0]?.album?.id;
        if (albumId) {
          if (albumGenreCache.has(albumId)) {
            genres = albumGenreCache.get(albumId)!;
          } else {
            const al = await fetch(`https://api.deezer.com/album/${albumId}`);
            const alb = await al.json().catch(() => ({}));
            genres = ((alb?.genres?.data ?? []) as { name: string }[]).map((g) => g.name);
            albumGenreCache.set(albumId, genres);
          }
        }
      } catch {
        /* sin género si Deezer falla */
      }
      cache.set(key, genres);
      await sleep(120); // respetar el rate limit de Deezer
    }

    t.genres = genres;
    t.genreBuckets = deriveBuckets(genres);
    t.region = deriveRegion(genres);
  }
}

// ------------------------- 1d) Playlist por embed --------------------------
type EmbedTrack = { uri?: string; title?: string; subtitle?: string };

/**
 * Lee los temas de una playlist desde su página EMBED pública (open.spotify.com/embed),
 * porque la API de playlists está bloqueada en Dev Mode. Devuelve título/artista/uri
 * (sin ISRC: el año se resuelve por título+artista).
 */
export async function fetchPlaylistViaEmbed(
  playlistId: string
): Promise<{ name: string | null; tracks: SpotifyTrack[] }> {
  const res = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (res.status === 404) throw new Error("playlist_not_found");
  if (!res.ok) throw new Error(`embed ${res.status}`);

  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("embed_parse_failed");

  const data = JSON.parse(m[1]);
  const entity = data?.props?.pageProps?.state?.data?.entity;
  const list: EmbedTrack[] = entity?.trackList ?? [];

  const tracks: SpotifyTrack[] = [];
  for (const it of list) {
    const id = it.uri?.split(":").pop();
    if (!id || !it.uri) continue;
    tracks.push({
      spotify_id: id,
      spotify_uri: it.uri,
      title: it.title ?? "",
      artist: it.subtitle ?? "",
      artist_id: null,
      isrc: null,
      cover_url: null,
      spotify_year: null,
    });
  }

  return { name: entity?.title ?? entity?.name ?? null, tracks };
}

// ------------------------- 1c) Playlists -----------------------------------
/** Extrae el ID de playlist de una URL, URI o ID pelado. */
export function parsePlaylistId(input: string): string | null {
  const m = input.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9]{16,}$/.test(input.trim())) return input.trim();
  return null;
}

export async function fetchPlaylistName(token: string, playlistId: string): Promise<string | null> {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new SpotifyAuthError("Token de Spotify vencido o inválido.");
  if (!res.ok) return null;
  return (await res.json())?.name ?? null;
}

type PlaylistItem = { track: SpotifySearchItem | null };

/** Trae los tracks de una playlist (de usuario; las editoriales de Spotify están restringidas). */
export async function fetchPlaylistTracks(
  token: string,
  playlistId: string,
  max = 1000
): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  const fields = "items(track(id,uri,name,artists(id,name),external_ids(isrc),album(images,release_date))),next";
  let offset = 0;

  while (out.length < max) {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&offset=${offset}&fields=${encodeURIComponent(fields)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw new SpotifyAuthError("Token de Spotify vencido o inválido.");
    if (res.status === 403) throw new Error(`playlist_forbidden: ${(await res.text()).slice(0, 200)}`);
    if (res.status === 404) throw new Error("playlist_not_found");
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "2");
      await sleep((retry + 1) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Spotify playlist ${res.status}: ${await res.text()}`);

    const data = await res.json();
    const items: PlaylistItem[] = data.items ?? [];
    if (items.length === 0) break;

    for (const it of items) {
      const t = it.track;
      if (!t?.id) continue; // tracks locales / no disponibles
      out.push({
        spotify_id: t.id,
        spotify_uri: t.uri,
        title: t.name,
        artist: (t.artists ?? []).map((a) => a.name).join(", "),
        artist_id: t.artists?.[0]?.id ?? null,
        isrc: t.external_ids?.isrc ?? null,
        cover_url: t.album?.images?.[0]?.url ?? null,
        spotify_year: parseYear(t.album?.release_date),
      });
      if (out.length >= max) break;
    }

    if (!data.next) break;
    offset += 100;
  }

  return out;
}

// ----------------------------- 2) Import -----------------------------------
/**
 * Guarda tracks como cartas 'pending' en el pool global (con géneros/categoría/región
 * si vienen enriquecidos). Los mazos se arman por criterios, no por vínculo manual.
 */
export async function importTracks(
  supabase: SupabaseClient,
  tracks: SpotifyTrack[]
): Promise<{ imported: number }> {
  if (tracks.length === 0) return { imported: 0 };

  // OJO: NO incluir year_status. En cartas nuevas cae al default ('pending'); en
  // cartas que ya existían, NO lo pisamos (mantiene 'resolved'/'manual' y su año).
  const rows = tracks.map((t) => ({
    spotify_uri: t.spotify_uri,
    spotify_id: t.spotify_id,
    isrc: t.isrc,
    title: t.title,
    artist: t.artist,
    spotify_year: t.spotify_year,
    cover_url: t.cover_url,
    genres: t.genres ?? null,
    genre_buckets: t.genreBuckets ?? null,
    region: t.region ?? null,
  }));

  const { data, error } = await supabase
    .from("ct_cards")
    .upsert(rows, { onConflict: "spotify_uri", ignoreDuplicates: false })
    .select("id");
  if (error) throw error;

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

/** Año original por búsqueda de recording (título + artista) cuando no hay ISRC. */
export async function getYearByTitleArtist(
  title: string,
  artist: string,
  userAgent: string
): Promise<{ year: number | null; candidates: number[] }> {
  const q = `recording:"${title}" AND artist:"${artist}"`;
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=15`;
  const res = await fetch(url, { headers: { "User-Agent": userAgent } });

  if (res.status === 503) {
    await sleep(2000);
    return getYearByTitleArtist(title, artist, userAgent);
  }
  if (!res.ok) return { year: null, candidates: [] };

  const data = await res.json();
  const recs = (data.recordings ?? []) as MusicBrainzRecording[];
  const candidates = recs
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
    .select("id, isrc, title, artist")
    .eq("year_status", "pending")
    .limit(limit);
  if (error) throw error;

  let resolved = 0;
  let review = 0;

  for (const card of pending ?? []) {
    // Con ISRC: lookup directo. Sin ISRC (temas de playlist): por título + artista.
    const { year, candidates } = card.isrc
      ? await getOriginalYear(card.isrc, userAgent)
      : await getYearByTitleArtist(card.title, card.artist, userAgent);
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
