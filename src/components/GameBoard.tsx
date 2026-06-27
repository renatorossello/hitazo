"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useSpotifyPlayer } from "@/lib/spotify/useSpotifyPlayer";
import Timelines from "./Timelines";
import Logo from "./Logo";
import type { GameState } from "@/lib/game/state";

/**
 * Board en juego. El host es la autoridad: reproduce, y los timers disparan las
 * transiciones (turno vencido → timeout; ventana de desafío vencida → reveal).
 * La resolución la confirma el host con "Continuar" tras la votación.
 */
export default function GameBoard({
  state,
  isHost,
  act,
}: {
  state: GameState;
  isHost: boolean;
  act: (path: string, body?: object) => Promise<Response>;
}) {
  const manual = state.config.playbackMode === "manual";
  const player = useSpotifyPlayer({ enabled: !manual });
  const round = state.round;
  const trackId = round?.cardUri ? round.cardUri.split(":").pop() : null;
  const deepLink = trackId ? `https://open.spotify.com/track/${trackId}` : null;
  const turnTeam = state.teams.find((t) => t.id === round?.teamId) ?? null;
  const challengerTeam = state.teams.find((t) => t.id === round?.challengerId) ?? null;

  // Refs para que el timer no se reinicie en cada refetch (solo al cambiar de fase).
  const actRef = useRef(act);
  const cfgRef = useRef(state.config);
  const firedRef = useRef("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");
  const router = useRouter();

  // Mantener los refs al día sin escribirlos durante el render.
  useEffect(() => {
    actRef.current = act;
    cfgRef.current = state.config;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- origin es client-only
    setOrigin(window.location.origin);
  }, []);

  const roundId = round?.id;
  const phase = round?.phase;
  const phaseStartedAt = round?.phaseStartedAt ?? null;

  // El board (host) dispara las transiciones por timer, basándose en el deadline del
  // server (phase_started_at + el timer de la fase): challenge → cierra la ventana;
  // closing → finaliza el turno. Deadline estable (no se reinicia en cada refetch).
  /* eslint-disable react-hooks/set-state-in-effect -- el effect sincroniza un reloj externo */
  useEffect(() => {
    if (!isHost || !roundId || state.status !== "playing" || !phaseStartedAt) {
      setSecondsLeft(null);
      return;
    }
    let limit: number | null = null;
    let action: string | null = null;
    if (phase === "challenge") {
      limit = cfgRef.current.challengeWindowSec;
      action = "challenge/close";
    } else if (phase === "closing") {
      limit = cfgRef.current.closeTurnSec;
      action = "finalize";
    }
    if (limit == null || !action) {
      setSecondsLeft(null);
      return;
    }
    const deadline = Date.parse(phaseStartedAt) + limit * 1000;
    const key = `${roundId}:${phase}`;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && firedRef.current !== key) {
        firedRef.current = key;
        actRef.current(action!);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [roundId, phase, phaseStartedAt, isHost, state.status]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function playCard() {
    // Pedimos la carta MÁS actual al server antes de reproducir: si por una carrera
    // de estado el board todavía tuviera la ronda anterior, igual sonaría la de la
    // ronda EN CURSO. Así nunca se reproduce el tema de la ronda pasada.
    let uri = round?.cardUri ?? null;
    try {
      const res = await fetch(`/api/games/${state.roomCode}/state`);
      if (res.ok) {
        const fresh = (await res.json()) as GameState;
        uri = fresh.round?.cardUri ?? uri;
      }
    } catch {
      /* si falla, usamos el uri que ya teníamos */
    }
    if (!uri) return;
    await player.play(uri);
    act("play"); // marca que ya suena → el turno ve el selector recién ahora
  }

  async function resolveWith(metaAwarded: boolean) {
    if (!manual) await player.pause(); // SDK: frena la canción; en manual la pausa el host
    await act("resolve", { metaAwarded });
  }

  async function newGame() {
    const res = await fetch("/api/games/create", { method: "POST" });
    if (res.ok) {
      const { roomCode } = (await res.json()) as { roomCode: string };
      router.push(`/board/${roomCode}`);
    }
  }

  const viewUrl = origin ? `${origin}/view/${state.roomCode}` : "";
  const joinUrl = origin ? `${origin}/join?code=${state.roomCode}` : "";

  return (
    <main className="flex min-h-full flex-1 flex-col gap-5 bg-gradient-to-b from-brand-deep to-brand-dark p-6 text-white sm:p-8">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <Logo className="text-2xl" />
          <span className="font-mono text-lg tracking-widest text-violet-200">{state.roomCode}</span>
        </div>
        <span className="text-sm text-violet-300">
          Turno {state.currentTurn + 1} · {round?.phase ?? "—"}
          {secondsLeft != null && secondsLeft >= 0 && (
            <span className="ml-1 font-bold text-accent">⏱ {secondsLeft}s</span>
          )}
        </span>
      </header>

      {/* QR siempre visibles: vista pública + reingreso de equipos (por si se cae la app). */}
      {origin && (
        <div className="flex justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <div className="rounded-lg bg-white p-1.5">
              <QRCodeSVG value={viewUrl} size={84} />
            </div>
            <span className="text-[11px] text-violet-200">📺 Vista pública</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="rounded-lg bg-white p-1.5">
              <QRCodeSVG value={joinUrl} size={84} />
            </div>
            <span className="text-[11px] text-violet-200">📲 Unirse / volver</span>
          </div>
        </div>
      )}

      {state.status === "finished" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-teal px-6 py-6 text-center text-white shadow-lg">
          <div>
            <p className="text-xs uppercase tracking-widest text-white/70">Fin de la partida</p>
            <p className="text-4xl font-extrabold">
              🏆 {state.teams.find((t) => t.id === state.winnerTeamId)?.name ?? "—"}
            </p>
          </div>
          {isHost && (
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => act("rematch")}
                className="rounded-full bg-white px-6 py-2.5 font-bold text-teal transition active:scale-95"
              >
                🔁 Revancha (mismos equipos)
              </button>
              <button
                onClick={newGame}
                className="rounded-full border-2 border-white px-6 py-2.5 font-bold text-white transition hover:bg-white/10 active:scale-95"
              >
                ➕ Nueva partida (nuevos equipos)
              </button>
            </div>
          )}
        </div>
      )}

      {state.status === "playing" && turnTeam && (
        <div className="rounded-2xl bg-brand px-6 py-5 text-center shadow-lg ring-1 ring-white/10">
          <p className="text-xs uppercase tracking-widest text-violet-200">Turno de</p>
          <p className="text-3xl font-extrabold">{turnTeam.name}</p>
          {round?.phase === "challenge" && (
            <p className="mt-1 text-sm font-semibold text-accent">
              {challengerTeam ? `⚡ Desafía ${challengerTeam.name}` : "Ventana de desafío abierta…"}
            </p>
          )}
        </div>
      )}

      {/* Controles de reproducción — modo MANUAL (sin API): deep link al Spotify del host */}
      {isHost && manual && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <p className="text-center text-sm text-violet-200">
            📱🔄 Tocá <strong>Reproducir</strong> y <strong>dá vuelta el celu</strong>: el tema suena en tu Spotify.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {deepLink ? (
              // <a> real (gesto directo) para que iOS abra Spotify y arranque solo.
              <a
                href={deepLink}
                onClick={() => act("play")}
                className="rounded-full bg-[#1DB954] px-6 py-2.5 font-bold text-white transition active:scale-95"
              >
                ▶ Reproducir (abre Spotify)
              </a>
            ) : (
              <span className="text-sm text-violet-300">Sin tema…</span>
            )}
            {(round?.phase === "challenge" || round?.phase === "closing") && (
              <button onClick={() => act("finalize")} className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand-deep">
                ⏩ Forzar fin de ronda
              </button>
            )}
            {round?.phase === "playing" && (
              <button onClick={() => act("skip")} className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold hover:bg-white/10">
                ⏭ Saltear tema
              </button>
            )}
          </div>
        </div>
      )}

      {/* Controles de reproducción — modo SDK (host con Spotify) */}
      {isHost && !manual && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          {player.status !== "ready" && <p className="text-sm text-violet-200">{player.message}</p>}
          {player.status === "no_session" && (
            <a href="/host" className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand-deep">
              Reconectar host
            </a>
          )}
          {player.status === "ready" && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={playCard}
                disabled={!round?.cardUri}
                className="rounded-full bg-[#1DB954] px-6 py-2.5 font-bold text-white transition active:scale-95 disabled:opacity-50"
              >
                ▶ Reproducir carta
              </button>
              <button
                onClick={player.togglePlay}
                className="rounded-full border border-white/30 px-5 py-2.5 font-semibold hover:bg-white/10"
              >
                {player.isPaused ? "Play" : "Pausa"}
              </button>
              <button
                onClick={player.replay}
                className="rounded-full border border-white/30 px-5 py-2.5 font-semibold hover:bg-white/10"
              >
                Replay
              </button>
              {(round?.phase === "challenge" || round?.phase === "closing") && (
                <button
                  onClick={() => act("finalize")}
                  className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand-deep"
                >
                  ⏩ Forzar fin de ronda
                </button>
              )}
              {round?.phase === "playing" && (
                <button
                  onClick={() => act("skip")}
                  className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-semibold hover:bg-white/10"
                  title="Cambiar el tema sin cambiar el turno (ej: ya salió antes)"
                >
                  ⏭ Saltear tema
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reveal / resolución */}
      {(round?.phase === "reveal" || round?.phase === "resolved") && round.reveal && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/10 p-6 ring-2 ring-accent">
          <p className="text-xs uppercase tracking-widest text-violet-200">Reveal</p>
          <div className="flex items-center gap-4">
            {round.reveal.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- carátula del CDN de Spotify
              <img src={round.reveal.coverUrl} alt="" className="h-24 w-24 rounded-xl shadow-lg" />
            )}
            <div className="text-left">
              <p className="font-mono text-5xl font-extrabold text-accent">{round.reveal.year}</p>
              <p className="text-lg font-bold">{round.reveal.title}</p>
              <p className="text-sm text-violet-200">{round.reveal.artist}</p>
            </div>
          </div>
          <p className="text-sm">
            {turnTeam?.name}: ubicó{" "}
            <span className={round.placedCorrect ? "font-bold text-teal" : "font-bold text-red-400"}>
              {round.placedCorrect ? "bien ✓" : "mal ✗"}
            </span>
            {challengerTeam && (
              <>
                {" · "}
                {challengerTeam.name} (desafío):{" "}
                <span className={round.challengeCorrect ? "font-bold text-teal" : "font-bold text-red-400"}>
                  {round.challengeCorrect ? "bien ✓" : "mal ✗"}
                </span>
              </>
            )}
          </p>
          {round.cardWinnerId && (
            <p className="text-sm font-semibold text-teal">
              🃏 La carta es para {state.teams.find((t) => t.id === round.cardWinnerId)?.name ?? "—"}
            </p>
          )}
          {isHost && round.phase === "reveal" && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-violet-200">
                ¿{turnTeam?.name} adivinó <strong>título y artista</strong>?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => resolveWith(true)}
                  className="rounded-full bg-teal px-7 py-3 text-lg font-bold text-white transition active:scale-95"
                >
                  Adivinó (+🪙) →
                </button>
                <button
                  onClick={() => resolveWith(false)}
                  className="rounded-full bg-white/15 px-7 py-3 text-lg font-bold text-white transition hover:bg-white/25 active:scale-95"
                >
                  No adivinó →
                </button>
              </div>
            </div>
          )}
          {isHost && round.phase === "resolved" && (
            <button
              onClick={() => act("next-round")}
              className="rounded-full bg-accent px-10 py-3 text-lg font-bold text-brand-deep transition active:scale-95"
            >
              ▶ Iniciar ronda
            </button>
          )}
        </div>
      )}

      {/* Líneas de tiempo (todas) */}
      <Timelines state={state} variant="dark" />
    </main>
  );
}
