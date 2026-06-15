<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Cronotema

Juego musical multijugador presencial (variante propia de HITSTER, 100% digital).
La visión, reglas, modelo de datos y restricciones están en `PRD-Cronotema.md` — leelo
antes de tocar lógica de juego. Idioma de la UI: español rioplatense (vos).

## Stack (cerrado, no cambiar)
- Next.js 16 (App Router, TS estricto). Componentes server por defecto; cliente solo
  donde haga falta (Web Playback SDK, Realtime).
- Supabase: Postgres + Realtime + Auth + Storage.
- Spotify Web Playback SDK + Web API (Search), OAuth Authorization Code + PKCE.
- MusicBrainz para el año original (vía ISRC). Motor en `src/lib/deck-engine.ts`.
- Deploy: Railway.

## Reglas de oro (sección 2 del PRD)
- Solo el host se loguea con Spotify y necesita Premium. Los jugadores entran por
  room-code y NO tocan Spotify.
- Audio = Web Playback SDK únicamente. NO usar `preview_url` ni endpoints de
  recomendación/audio-features (deprecados).
- El año NO sale de Spotify (`release_date` no sirve): sale de MusicBrainz vía ISRC.
  Solo entran al juego cartas con `year_status in ('resolved','manual')` y
  `release_year not null`.
- Dev Mode = 5 usuarios Spotify máx. No diseñar nada que obligue a más logueados.

## Convenciones
- Tablas con prefijo `ct_`. Schema en `supabase/migrations/`.
- Estado de la partida = fuente de verdad en Postgres. Realtime solo notifica/sincroniza.
- El host/board es la autoridad de reproducción y avance de turno; los players mandan
  intenciones que el host/servidor valida.
- El desafío se arbitra server-side por timestamp (primera escritura gana).
- Secrets (service-role key, Spotify secret, tokens) solo server-side, nunca al browser.

## Estado actual
- Fase 0 (scaffold + schema + env) y Fase 1 (OAuth del host + board de prueba de audio)
  implementadas. Falta validar que el audio suena con credenciales reales antes de la sala.

