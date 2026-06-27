-- 0008_host_token.sql
-- Modo de juego "sin API de Spotify": el host/board ya no se identifica SOLO por la
-- sesión de Spotify. Cada partida tiene un host_token secreto; quien lo tenga en
-- cookie es la autoridad del board (modo manual, para hosts sin allowlist). El modo
-- SDK (con Spotify) sigue valiendo igual. playbackMode ('sdk' | 'manual') vive en config.
alter table ct_games add column if not exists host_token text;
