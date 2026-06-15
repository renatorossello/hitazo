-- ============================================================================
-- Hitazo — cartas salteadas por el host en la partida.
-- Para que un tema salteado (p. ej. ya salió en una partida anterior) no vuelva a
-- aparecer en ESTA partida. Se excluye del mazo vivo junto con las ya usadas.
-- ============================================================================

alter table ct_games add column if not exists skipped_card_ids uuid[] default '{}';
