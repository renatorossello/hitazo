-- ============================================================================
-- Hitazo — flag "la carta ya empezó a sonar" en la ronda.
-- Evita que el jugador en turno vea el selector de ubicación ANTES de que el host
-- apriete "Reproducir carta" (cuando todavía no suena nada y confunde).
-- ============================================================================

alter table ct_rounds add column if not exists played boolean default false;
