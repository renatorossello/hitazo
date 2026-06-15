-- ============================================================================
-- Cronotema/Hitazo — estado vivo de la ronda (Fase 3, loop de juego)
-- ct_rounds ya existe (0001) como log de la ronda; le agregamos la fase actual
-- y el timestamp del claim de desafío. Los votos van en su propia tabla.
-- ============================================================================

-- Fase de la ronda en curso:
--   playing      -> suena el tema, el turno aún no ubicó
--   challenge    -> el turno ubicó; ventana de desafío abierta
--   reveal       -> se mostró el año; votación de título/artista
--   resolved     -> carta resuelta, listo para el siguiente turno
alter table ct_rounds add column if not exists phase text default 'playing';

-- Arbitraje del desafío server-side (primera escritura gana). Guardamos cuándo se
-- reclamó para auditar; el bloqueo real es el update condicional sobre challenger_id.
alter table ct_rounds add column if not exists challenge_claimed_at timestamptz;

-- Marca de la carta jugada como "arriesga título/artista" (lo activa el turno).
alter table ct_rounds add column if not exists guessed_meta boolean default false;

-- Votos de título/artista de los equipos sin turno (1 por equipo por ronda).
create table if not exists ct_round_votes (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid references ct_rounds(id) on delete cascade,
  team_id     uuid references ct_teams(id) on delete cascade,
  vote        boolean not null,              -- true = Sí, false = No
  created_at  timestamptz default now(),
  unique (round_id, team_id)
);
create index if not exists ct_round_votes_round_idx on ct_round_votes (round_id);
