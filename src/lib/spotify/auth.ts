import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Manejo del token de Spotify del host.
 *
 * IMPORTANTE: en Route Handlers, las cookies seteadas con `cookies()` de
 * next/headers NO se adjuntan a un NextResponse que devolvés vos (redirect/json).
 * Por eso las ESCRITURAS de cookies se hacen sobre el `NextResponse` y las
 * LECTURAS desde `req.cookies` (en rutas) o `cookies()` (en server components).
 *
 * MVP single-host: tokens en cookies httpOnly. El refresh_token no es legible por
 * JS y el access_token se refresca server-side. En Fase 4 podemos mover esto a una
 * tabla ct_host_sessions si las sesiones largas del admin lo piden.
 */

export const SPOTIFY_SCOPES = [
  "streaming", // Web Playback SDK (requiere Premium)
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state", // play/pause/transfer al device del SDK
  "user-read-playback-state",
  "playlist-read-private", // leer las playlists del host (admin de mazos)
  "playlist-read-collaborative",
].join(" ");

const ACCESS_COOKIE = "sp_access";
const REFRESH_COOKIE = "sp_refresh";
const EXPIRES_COOKIE = "sp_expires"; // epoch ms en que vence el access_token
const VERIFIER_COOKIE = "sp_pkce_verifier";
const STATE_COOKIE = "sp_oauth_state";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";

type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number; // segundos
  refresh_token?: string;
  scope?: string;
};

function clientId(): string {
  const id = process.env.SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("Falta SPOTIFY_CLIENT_ID en el entorno.");
  return id;
}

function redirectUri(): string {
  const uri = process.env.SPOTIFY_REDIRECT_URI;
  if (!uri) throw new Error("Falta SPOTIFY_REDIRECT_URI en el entorno.");
  return uri;
}

/**
 * Origen público de la app. Detrás de un proxy (Railway) el `req.url` puede ser el
 * interno (localhost:PORT), así que para los redirects internos usamos esto: APP_URL
 * si está, o el origin del SPOTIFY_REDIRECT_URI (que siempre es la URL pública).
 */
export function appOrigin(): string | null {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const uri = process.env.SPOTIFY_REDIRECT_URI;
  if (uri) {
    try {
      return new URL(uri).origin;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const secureCookie = process.env.NODE_ENV === "production";

function cookieOpts(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

// --------------------------- URL de autorización ---------------------------

export function buildAuthorizeUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    scope: SPOTIFY_SCOPES,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// --------------------------- Cookies del handshake -------------------------

export function setPkceCookies(res: NextResponse, verifier: string, state: string): void {
  res.cookies.set(VERIFIER_COOKIE, verifier, cookieOpts(600)); // 10 min
  res.cookies.set(STATE_COOKIE, state, cookieOpts(600));
}

export function readPkceFromRequest(req: NextRequest): { verifier?: string; state?: string } {
  return {
    verifier: req.cookies.get(VERIFIER_COOKIE)?.value,
    state: req.cookies.get(STATE_COOKIE)?.value,
  };
}

export function clearPkceCookies(res: NextResponse): void {
  res.cookies.delete(VERIFIER_COOKIE);
  res.cookies.delete(STATE_COOKIE);
}

// --------------------------- Persistencia de tokens ------------------------

function persistTokens(res: NextResponse, tok: SpotifyTokenResponse, prevRefresh?: string): void {
  const expiresAt = Date.now() + tok.expires_in * 1000;
  res.cookies.set(ACCESS_COOKIE, tok.access_token, cookieOpts(tok.expires_in));
  res.cookies.set(EXPIRES_COOKIE, String(expiresAt), cookieOpts(tok.expires_in));
  // En refresh, Spotify no siempre devuelve refresh_token nuevo: conservamos el previo.
  const refresh = tok.refresh_token ?? prevRefresh;
  if (refresh) {
    res.cookies.set(REFRESH_COOKIE, refresh, cookieOpts(60 * 60 * 24 * 30)); // 30 días
  }
}

export function clearSpotifySession(res: NextResponse): void {
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  res.cookies.delete(EXPIRES_COOKIE);
}

// --------------------------- Intercambios OAuth ----------------------------

async function requestTokens(body: URLSearchParams): Promise<SpotifyTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Spotify token ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/** callback: cambia el authorization code por tokens (PKCE) y los persiste en `res`. */
export async function exchangeCodeForTokens(
  res: NextResponse,
  code: string,
  verifier: string
): Promise<void> {
  const tok = await requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: clientId(),
      code_verifier: verifier,
    })
  );
  persistTokens(res, tok);
}

/**
 * Devuelve un access_token válido del host (refrescando si está por vencer), o null
 * si no hay sesión. Como las cookies se setean sobre la respuesta, devuelve un
 * `applyCookies(res)` que la ruta llama sobre su NextResponse final (no-op si no
 * hubo refresh). Lo consume /api/spotify/token y (Fase 4) las rutas del admin.
 */
export async function getValidAccessToken(
  req: NextRequest
): Promise<{ token: string | null; applyCookies: (res: NextResponse) => void }> {
  const noop = () => {};
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const expiresAt = Number(req.cookies.get(EXPIRES_COOKIE)?.value ?? 0);
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;

  // Margen de 60s para no entregar un token que vence en el medio.
  if (access && Date.now() < expiresAt - 60_000) return { token: access, applyCookies: noop };
  if (!refresh) return { token: null, applyCookies: noop };

  try {
    const tok = await requestTokens(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: clientId(),
      })
    );
    return {
      token: tok.access_token,
      applyCookies: (res) => persistTokens(res, tok, refresh),
    };
  } catch {
    // Refresh token revocado/expirado: la sesión murió. Limpiamos las cookies para
    // que el host vuelva a ver "Conectar con Spotify" en vez de un estado falso.
    return { token: null, applyCookies: (res) => clearSpotifySession(res) };
  }
}

/** Lectura para Server Components (solo lee, no escribe). */
export async function isHostAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(jar.get(REFRESH_COOKIE)?.value || jar.get(ACCESS_COOKIE)?.value);
}
