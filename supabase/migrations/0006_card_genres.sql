-- ============================================================================
-- Hitazo — metadata de género/idioma para filtrar mazos.
--  ct_cards:
--   - genres        : géneros crudos del artista (Spotify).
--   - genre_buckets : categorías amplias derivadas (Pop, Rock, Rap, Latino, …).
--   - region        : idioma/región aproximado (del género), editable a mano.
--  ct_deck_filters (criterios para armar mazos dinámicos):
--   - buckets / regions : categorías y regiones elegidas (year_from/to ya existen).
-- ============================================================================

alter table ct_cards add column if not exists genres        text[];
alter table ct_cards add column if not exists genre_buckets  text[];
alter table ct_cards add column if not exists region         text;

alter table ct_deck_filters add column if not exists buckets text[];
alter table ct_deck_filters add column if not exists regions text[];

-- Búsquedas por categoría / región / año en la lista del admin y el mazo vivo.
create index if not exists ct_cards_buckets_idx on ct_cards using gin (genre_buckets);
create index if not exists ct_cards_region_idx  on ct_cards (region);
