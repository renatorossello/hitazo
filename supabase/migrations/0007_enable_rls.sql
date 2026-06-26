-- 0007_enable_rls.sql
-- Seguridad: activar Row-Level Security en todas las tablas públicas.
--
-- Por qué deny-all (RLS activo, SIN políticas):
--  - TODO el acceso a datos de la app pasa por route handlers server-side que usan
--    la SERVICE-ROLE key (createServiceClient), y la service role BYPASSEA RLS. O sea
--    el juego y el admin siguen funcionando igual.
--  - El browser (anon key) solo usa Realtime broadcast/presence por canal, que NO lee
--    tablas. No hay queries .from() ni postgres_changes desde el cliente.
--  - Con RLS activo y sin políticas, la anon key NO puede leer/editar/borrar nada
--    directo: se cierra el "Table publicly accessible" que reportó Supabase.
--
-- Si en el futuro el cliente necesitara leer alguna tabla con la anon key, se agregan
-- políticas puntuales (p. ej. select público sobre ct_games por room_code).

alter table ct_deck_filters  enable row level security;
alter table ct_cards         enable row level security;
alter table ct_card_filters  enable row level security;
alter table ct_games         enable row level security;
alter table ct_teams         enable row level security;
alter table ct_team_cards    enable row level security;
alter table ct_rounds        enable row level security;
alter table ct_round_votes   enable row level security;
