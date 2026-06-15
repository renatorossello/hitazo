-- ============================================================================
-- Hitazo — flujo de ronda player-driven (menos host, anti-cuelgue por timers).
-- Nueva fase 'closing' (cerrar turno) entre 'challenge' y 'reveal'.
--  - declined_team_ids: equipos sin turno que tocaron "NO desafío".
--  - phase_started_at: cuándo arrancó la fase actual, para countdowns sincronizados
--    entre todos los clientes (deadline = phase_started_at + timer de esa fase).
-- ============================================================================

alter table ct_rounds add column if not exists declined_team_ids uuid[] default '{}';
alter table ct_rounds add column if not exists phase_started_at timestamptz default now();
