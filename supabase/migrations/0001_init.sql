-- ============================================================================
-- Cronotema — schema inicial (sección 4 del PRD)
-- Prefijo ct_ para aislar el proyecto.
-- gen_random_uuid() viene incluido en Postgres de Supabase (pgcrypto).
-- ============================================================================

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

-- Lookups frecuentes de la cola de resolución y del mazo "vivo".
create index ct_cards_year_status_idx on ct_cards (year_status);
create index ct_cards_playable_idx on ct_cards (year_status) where release_year is not null;

-- Relación carta <-> filtro (una carta puede entrar en varios mazos)
create table ct_card_filters (
  card_id    uuid references ct_cards(id) on delete cascade,
  filter_id  uuid references ct_deck_filters(id) on delete cascade,
  primary key (card_id, filter_id)
);
create index ct_card_filters_filter_idx on ct_card_filters (filter_id);

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
create index ct_teams_game_idx on ct_teams (game_id);

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
create index ct_team_cards_team_idx on ct_team_cards (team_id);

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
create index ct_rounds_game_idx on ct_rounds (game_id);

-- ============ NOTAS ============
-- RLS: queda DESHABILITADO en el MVP. Las escrituras van por service-role desde
-- route handlers server-side; el realtime usa broadcast/presence (no postgres_changes),
-- así que no hace falta exponer las tablas al cliente anónimo todavía.
-- Endurecer con políticas RLS en la Fase 5 si se exponen lecturas directas al browser.
