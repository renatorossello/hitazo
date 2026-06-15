# PRD — Cronotema (working title)

> Juego digital, presencial y multijugador para adivinar temas musicales y ordenarlos por año en una línea de tiempo. Variante propia inspirada en HITSTER, **100% digital**, con audio de Spotify.
>
> *Cronotema* es un nombre de trabajo. Renombrar libremente.

---

## 1. Visión

Un grupo de amigos, todos en la misma sala, juega desde sus celulares. Un dispositivo (el **host**, conectado a un parlante y a una pantalla grande) reproduce los temas vía Spotify. Cada equipo escucha, intenta ubicar el tema en su línea de tiempo según el **año original de lanzamiento**, y puede arriesgar título y artista para ganar fichas. Las fichas sirven para desafiar a otros equipos. Gana el primer equipo en armar una línea de tiempo de 10 cartas correctamente ordenadas.

La gracia del juego (lo que le falta a alternativas como "Guess That Tune") es el **ordenamiento por años**: no hay que adivinar el año exacto, solo ubicar el tema relativo a las cartas que ya se tienen.

---

## 2. Restricciones técnicas clave (leer antes de codear)

Estas restricciones definen la arquitectura. **No** intentar caminos alternativos que ya están cerrados.

1. **`preview_url` (clips de 30s) está muerto para apps nuevas** desde el 27/11/2024. No usar previews. La única forma de reproducir audio de Spotify es el **Web Playback SDK**.
2. **Web Playback SDK requiere Spotify Premium completo** (no Lite/Mini) en el dispositivo que reproduce. → **Solo el host necesita Premium.** Los jugadores NO se loguean en Spotify.
3. **Endpoints de recomendación/audio-features/related-artists/genre-seeds: deprecados** (nov 2024). No hay "dame temas parecidos". El origen de temas se arma con **Search** (`year:`, `genre:`) y, en v2, con `top tracks` de jugadores logueados.
4. **Development Mode (feb 2026): máximo 5 usuarios Spotify por app + 1 Client ID por dev + el dueño debe tener Premium.** Como solo el host se loguea, el MVP entra cómodo. Esto **limita la v2** (top tracks de jugadores): cada jugador logueado consume 1 de los 5 cupos → sirve para grupo privado chico, no para distribución pública sin "Extended Quota Mode".
5. **`external_ids.isrc` sigue disponible** (lo removieron en feb 2026 y lo revirtieron en mar 2026). Es la llave para cruzar con MusicBrainz.
6. **Client Credentials para metadata está siendo discontinuado** (feb 2026): usar el token de usuario (Authorization Code + PKCE) del host también para Search y para el script de armado de mazo.
7. **El año de Spotify (`album.release_date`) no sirve**: devuelve fecha de recopilatorios/re-releases. El año original se obtiene de **MusicBrainz** vía ISRC.

---

## 3. Arquitectura

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  HOST (notebook/TV + parlante)         │  JUGADORES (celulares)        │
│  - Next.js (board view)                │  - Next.js (player view)      │
│  - Spotify Web Playback SDK            │  - Entran por room-code       │
│  - OAuth Spotify (1 usuario)           │  - NO tocan Spotify           │
│  - Reproduce, controla play/pausa      │  - Ven SU línea de tiempo     │
└───────────────┬─────────────┘          └───────────────┬──────────────┘
                │                                          │
                └──────────────┬───────────────────────────┘
                               ▼
                  ┌──────────────────────────┐
                  │  Supabase                 │
                  │  - Postgres (estado)      │
                  │  - Realtime (sync sala)   │
                  │  - Auth (host)            │
                  │  - Storage (seed/mazos)   │
                  └──────────────────────────┘

  Deploy: Next.js en Railway. Supabase como backend.
  Patrón realtime = el mismo que ya usás en el juego de Burako.
```

**Roles de dispositivo:**
- **Host/board**: fuente de verdad de la reproducción. Corre el SDK con el token del host. Muestra estado global de la partida (turno actual, líneas de tiempo de todos, reveal). Controla play/pausa/replay.
- **Player**: cliente liviano. Muestra la línea de tiempo propia, permite ubicar la carta, votar título/artista, desafiar. No reproduce audio.

**Por qué el host es el único con Spotify:** cumple el límite de 5 usuarios y evita pedirle Premium a los amigos.

---

## 4. Modelo de datos (Supabase / Postgres)

> Prefijo de tablas sugerido para aislar el proyecto. Ajustar a tu convención.

```sql
-- ============ CATÁLOGO / MAZOS ============

-- Conjunto de filtros guardado (ej: "Rock 80s", "Pop 2000s")
create table ct_deck_filters (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  year_from    int,
  year_to      int,
  genres       text[],              -- ej: {'rock','pop'}
  created_at   timestamptz default now()
);

-- Carta = track con año verificado
create table ct_cards (
  id              uuid primary key default gen_random_uuid(),
  spotify_uri     text not null unique,      -- spotify:track:xxxx
  spotify_id      text not null,
  isrc            text,
  title           text not null,
  artist          text not null,
  release_year    int,                       -- año ORIGINAL (MusicBrainz)
  spotify_year    int,                        -- año Spotify (referencia/debug)
  year_source     text,                       -- 'musicbrainz' | 'manual'
  cover_url       text,
  year_status     text default 'pending',     -- pending | resolving | resolved | needs_review | manual
  mb_candidates   jsonb,                       -- años candidatos de MusicBrainz (p/ que el admin elija)
  created_at      timestamptz default now()
);
-- Flujo del año: pending (recién importada) -> resolving (worker la tomó)
--   -> resolved (MB devolvió año) | needs_review (MB no resolvió) -> manual (admin la corrigió)
-- Solo entran al juego las cartas con release_year not null y year_status in ('resolved','manual').

-- Relación carta <-> filtro (una carta puede entrar en varios mazos)
create table ct_card_filters (
  card_id    uuid references ct_cards(id) on delete cascade,
  filter_id  uuid references ct_deck_filters(id) on delete cascade,
  primary key (card_id, filter_id)
);

-- ============ PARTIDAS ============

create table ct_games (
  id            uuid primary key default gen_random_uuid(),
  room_code     text not null unique,         -- código corto p/ unirse (ej: 6 chars)
  host_user_id  uuid,                          -- auth del host
  status        text default 'lobby',          -- lobby | playing | finished
  config        jsonb default '{}',            -- { turnTimerSec, challengeWindowSec, targetCards }
  filter_ids    uuid[],                        -- mazos elegidos para esta partida
  current_turn  int default 0,                  -- índice de turno
  created_at    timestamptz default now()
);

create table ct_teams (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid references ct_games(id) on delete cascade,
  name        text not null,
  tokens      int default 1,                   -- fichas
  join_order  int not null,                     -- orden de turnos
  connected   boolean default true,
  created_at  timestamptz default now()
);

-- Cartas en la línea de tiempo de cada equipo
create table ct_team_cards (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid references ct_teams(id) on delete cascade,
  card_id      uuid references ct_cards(id),
  release_year int not null,                   -- copiado p/ ordenar sin join
  position     int not null,                    -- orden en la línea de tiempo
  is_anchor    boolean default false,           -- carta inicial revelada
  created_at   timestamptz default now()
);

-- Historial de rondas (auditoría + replay)
create table ct_rounds (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid references ct_games(id) on delete cascade,
  turn_index      int not null,
  team_id         uuid references ct_teams(id),     -- equipo en turno
  card_id         uuid references ct_cards(id),
  placed_position int,                               -- hueco elegido por el turno
  placed_correct  boolean,
  guessed_meta    boolean,                            -- arriesgó título/artista
  meta_awarded    boolean,                            -- votación dio ficha
  challenger_id   uuid references ct_teams(id),       -- equipo que desafió (nullable)
  challenge_position int,
  challenge_correct  boolean,
  card_winner_id  uuid references ct_teams(id),        -- quién se quedó la carta (nullable)
  created_at      timestamptz default now()
);
```

**Notas:**
- `ct_team_cards.release_year` y `position` se copian para resolver la línea de tiempo sin joins en cada render.
- El mazo "vivo" de una partida = cartas de los `filter_ids` elegidos con `year_status in ('resolved','manual')` y `release_year not null`, menos las ya usadas en esa partida (`ct_rounds.card_id`). Las `pending` / `needs_review` quedan fuera hasta resolverse.
- `config` por defecto: `{ "turnTimerSec": 60, "challengeWindowSec": 15, "targetCards": 10 }` (turnTimer puede ser `null` = sin límite).

---

## 5. Reglas del juego (canónicas)

### Conceptos
- **Equipo = jugador** (no distinguimos integrantes).
- Cada equipo tiene una **línea de tiempo** (cartas ordenadas por año) y un stock de **fichas**.
- El **mazo** son los tracks de los filtros elegidos, cada uno con su año verificado.

### Setup
- Cada equipo arranca con **1 carta al azar revelada** en su línea de tiempo (ancla) y **1 ficha**.
- Se define el orden de turnos (`join_order`).

### Estructura de un turno
1. **Suena el tema.** El host controla play/pausa/replay. Nadie ve título/artista/año. (Opcional: timer de turno configurable.)
2. **Ubicación.** El equipo en turno ubica la carta en un hueco de **su** línea de tiempo. Opcionalmente activa "arriesgo título y artista" (lo dice en voz alta). Confirma.
3. **Ventana de desafío (~15s).** Cualquier otro equipo con ≥1 ficha puede desafiar. **El primero que toca "desafiar" se queda el cupo exclusivo**, ubica la carta en un hueco de **su propia** línea de tiempo y **gasta 1 ficha** (gane o pierda).
4. **Reveal.** Se muestra el año (y título/artista si se arriesgó).
5. **Votación de título/artista** (si se arriesgó): los equipos que **no** tienen el turno marcan **Sí/No**. Se entrega la ficha al equipo en turno **solo si hubo al menos un voto** y los **Sí ≥ No** (empate con votos → gana el Sí). **Si nadie vota, no se entrega ficha.**
6. **Resolución de la carta** (ver matriz).
7. Se actualizan líneas, fichas y pasa al siguiente turno con una carta nueva.

### Resolución de la carta
- **Turno acierta** → se queda la carta (entra en su línea). Si hubo desafío, el desafiante ya perdió su ficha y no gana nada.
- **Turno falla + desafío acierta** → el desafiante se queda la carta (entra ordenada en **su** línea).
- **Turno falla + desafío falla**, o **sin desafío** → la carta se descarta, nadie la gana.
- El desafiante **siempre** pierde la ficha apostada, acierte o no.
- **Timer vencido sin confirmar** (si está activo) → turno perdido: carta descartada, **sin** ventana de desafío, siguiente turno.

### Fichas
- Inicio: 1 por equipo. Sin tope.
- **+1** al equipo en turno si la votación de título/artista tuvo al menos un voto y dio Sí ≥ No (independiente de si acertó la línea temporal). Sin votos → sin ficha.
- **−1** al desafiante al desafiar.
- Solo el equipo en turno puede ganar ficha por título/artista.

### Ubicación correcta
- La carta va en un hueco entre dos cartas adyacentes (o en un extremo de la línea). Es correcta si el año cae dentro de ese hueco.
- **Empates de año**: si el año coincide con el de un vecino, se da por válido cualquiera de los dos huecos adyacentes a ese año.
- Extremos: antes de la carta más antigua → correcto si `año ≤ min`. Después de la más nueva → correcto si `año ≥ max`.

### Fin del juego
- Gana el primer equipo con **10 cartas correctamente ubicadas** (incluye robadas por desafío). `targetCards` es configurable.
- Si el mazo se agota antes (raro con un mazo curado), gana el equipo con más cartas.

---

## 6. Eventos realtime (canal por sala)

Broadcast vía Supabase Realtime sobre un canal `game:{room_code}`. Eventos sugeridos:

| Evento | Emisor | Payload | Efecto |
|---|---|---|---|
| `team_joined` | player | team | aparece en lobby |
| `game_started` | host | config, orden | pasa a `playing` |
| `turn_started` | host | turn_index, team_id, card_id (oculto) | arranca turno, empieza timer |
| `card_playing` / `card_paused` | host | — | UI "sonando" |
| `placement_submitted` | turn player | position | abre ventana de desafío |
| `challenge_claimed` | challenger | team_id | bloquea el cupo p/ los demás |
| `challenge_submitted` | challenger | position | listo p/ reveal |
| `reveal` | host | year, title, artist | muestra resultado |
| `meta_vote` | non-turn players | team_id, vote | acumula votos |
| `round_resolved` | host | winner, fichas, timelines | actualiza estado, siguiente turno |
| `game_finished` | host | winner | pantalla final |

> **Arbitraje del desafío**: `challenge_claimed` se resuelve server-side por timestamp (primera escritura gana) para evitar empates por latencia. Validar contra fichas disponibles.

---

## 7. Pantallas

### Host / Board (pantalla grande)
- **Lobby**: room-code grande + QR, lista de equipos conectados, selección de mazos (filtros) y config, botón "Empezar".
- **En juego**: equipo en turno destacado, controles de reproducción (play/pausa/replay), timer, líneas de tiempo de todos los equipos, contador de fichas.
- **Reveal**: carátula + título + artista + año, resultado de la ubicación, resultado de la votación de título/artista, quién se quedó la carta.
- **Final**: ganador + resumen.

### Player (celular)
- **Unirse**: input de room-code + nombre de equipo.
- **Mi turno**: mi línea de tiempo con huecos seleccionables, toggle "arriesgo título/artista", botón confirmar, timer.
- **Turno ajeno**: botón "Desafiar" (si tengo ficha) durante la ventana; al reclamar, mi línea de tiempo p/ ubicar.
- **Votación**: botones Sí/No cuando el equipo en turno arriesga título/artista.
- **Estado**: mis fichas, mi progreso (cartas / 10).

---

## 8. Admin in-app de gestión de mazos

El armado de mazos **es un módulo de la propia app web** (no un script suelto), bajo `/admin`, accesible solo para el host autenticado. Toda la lógica de Spotify y MusicBrainz corre **server-side** (route handlers / server actions), usando el token de usuario del host (con refresh). El motor reutilizable vive en `lib/deck-engine.ts`.

### Por qué importar y resolver van separados
MusicBrainz exige **1 request/seg** y User-Agent identificable. Resolver ~200 temas tarda 3-4 min: no se puede hacer en un solo request HTTP. Por eso:
- **Importar** es instantáneo: guarda los temas con `year_status = 'pending'`.
- **Resolver años** es un **proceso en segundo plano** que va tomando los `pending`, consulta MusicBrainz a 1/seg y los pasa a `resolved` o `needs_review`. El admin ve el progreso.

### Pantallas (`/admin`)
1. **Buscar e importar**
   - Filtros: rango de años, géneros (`genre:`), texto libre opcional.
   - Preview de resultados de Spotify Search (título, artista, año Spotify, carátula).
   - Seleccionar cuáles importar y a qué mazo (filtro guardado). Importa como `pending`.
2. **Resolver años** (cola de procesamiento)
   - Barra de progreso de los `pending` / `resolving`. Botón "Resolver pendientes".
   - Muestra en vivo lo que se va resolviendo y lo que cae en `needs_review`.
3. **Revisión** (cola `needs_review`)
   - Lista de cartas sin año confiable, con el año de Spotify y los `mb_candidates` (si hubo).
   - El admin **fija el año a mano** → pasa a `manual`. O descarta la carta.
4. **Mazos**
   - CRUD de `ct_deck_filters`. Por mazo: total de cartas, cuántas jugables vs pendientes vs en revisión.

### Rutas server-side (sugeridas)
| Ruta | Hace |
|---|---|
| `POST /api/admin/search` | Spotify Search por filtros → devuelve preview (no escribe) |
| `POST /api/admin/import` | Upsert de las seleccionadas en `ct_cards` (`pending`) + vínculo al filtro |
| `POST /api/admin/resolve` | Toma N `pending`, marca `resolving`, consulta MB (1/seg), actualiza estado. Idempotente. |
| `GET  /api/admin/resolve/progress` | Conteos por `year_status` para la barra de progreso |
| `PATCH /api/admin/cards/:id` | Fija/edita `release_year` a mano → `year_status = 'manual'` |
| `DELETE /api/admin/cards/:id` | Descarta carta |

### Patrón del proceso en segundo plano
Tres opciones según cuánto quieras invertir; recomendada la **A** para el MVP:
- **A) Endpoint por lotes + polling desde la UI**: "Resolver pendientes" llama a `/api/admin/resolve` en loop (ej. 10 cartas por llamada), la UI hace polling de `/progress` y muestra avance. Simple, sin infra extra, robusto si el admin cierra la pestaña (retomás donde quedó porque el estado está en la DB).
- **B) Worker dedicado en Railway**: un proceso aparte que dranea la cola `pending` continuamente. Más "set and forget".
- **C) Cron (Railway o pg_cron)**: corre `/api/admin/resolve` cada minuto.

> Como `lib/deck-engine.ts` ya encapsula `spotifySearch`, `musicBrainzYearByIsrc` y los upserts, las tres opciones comparten el mismo motor; solo cambia el disparador.

**Resultado esperado:** ~90% resuelto automático; el 10% restante se corrige desde la pantalla de revisión. Mucha más variedad que curar todo manual.

---

## 9. Alcance

### MVP (primera noche jugable)
- Room-code multiplayer (host board + players).
- Spotify Web Playback SDK (host) + OAuth del host.
- Selección de mazos por época/género desde filtros guardados.
- Mecánica completa: línea de tiempo + ubicación + reveal + **fichas** (desafío + bonus título/artista por votación).
- **Admin in-app de mazos** (sección 8): buscar/importar desde Spotify, resolver años en segundo plano, pantalla de revisión para corregir años a mano.
- Timer de turno configurable.

### v2
- **Top tracks de jugadores logueados** (atado al límite de 5 usuarios Spotify → grupo privado chico).
- Estadísticas, historial de partidas, modos alternativos.
- Worker/cron dedicado para resolver años (opción B/C de la sección 8) si la opción A queda corta.
- Animaciones/efectos, sonidos de UI.

### Fuera de alcance
- App nativa iOS/Android (es web, corre en el navegador del celular).
- Distribución pública masiva (límite de 5 usuarios Spotify en Dev Mode).
- Audio de YouTube (descartado: ads en juego con timing, ToS de ocultar player, sin ventaja real teniendo Premium).

---

## 10. Stack y deploy

- **Frontend/Backend**: Next.js (App Router).
- **Realtime + DB + Auth + Storage**: Supabase.
- **Audio**: Spotify Web Playback SDK + Web API (Search), Authorization Code + PKCE.
- **Años**: MusicBrainz (vía ISRC).
- **Deploy**: Railway (mismo patrón que el juego de Burako).
- **Variables de entorno**: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MUSICBRAINZ_USER_AGENT`.

### Decisiones cerradas
- Audio: **Spotify** (YouTube descartado).
- Multiplayer: **room-code** desde el MVP.
- Año: **MusicBrainz automático** + cola de revisión.
- Desafiante ubica en **su propia** línea de tiempo.
- Título/artista: **votación manual** de los equipos sin turno; ficha si hubo ≥1 voto y Sí ≥ No. Sin votos → sin ficha.
- Desafío: **uno solo**, el primero que reclama.
- Timer de turno: **configurable**, vencimiento = turno perdido.
