"use client";

import { useEffect, useRef, useState } from "react";
import { useSpotifyPlayer } from "@/lib/spotify/useSpotifyPlayer";
import Timelines from "./Timelines";
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
  const player = useSpotifyPlayer();
  const round = state.round;
  const turnTeam = state.teams.find((t) => t.id === round?.teamId) ?? null;
  const challengerTeam = state.teams.find((t) => t.id === round?.challengerId) ?? null;

  // Refs para que el timer no se reinicie en cada refetch (solo al cambiar de fase).
  const actRef = useRef(act);
  const cfgRef = useRef(state.config);
  const firedRef = useRef("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [metaGuessed, setMetaGuessed] = useState(false);

  // Mantener los refs al día sin escribirlos durante el render.
  useEffect(() => {
    actRef.current = act;
    cfgRef.current = state.config;
  });

  const roundId = round?.id;
  const phase = round?.phase;
  const challengerId = round?.challengerId ?? null;
  const challengePos = round?.challengePosition ?? null;

  /* eslint-disable react-hooks/set-state-in-effect -- el effect sincroniza un reloj
     (countdown) con un sistema externo (setInterval); setState acá es el patrón correcto. */
  useEffect(() => {
    if (!isHost || !roundId || state.status !== "playing") {
      setSecondsLeft(null);
      return;
    }
    const key = `${roundId}:${phase}:${challengerId ?? ""}:${challengePos ?? ""}`;
    const fire = (a: string) => {
      if (firedRef.current !== key) {
        firedRef.current = key;
        actRef.current(a);
      }
    };

    // Si el desafiante ya ubicó, revelamos enseguida (no esperamos al timer).
    if (phase === "challenge" && challengePos != null) {
      setSecondsLeft(null);
      fire("reveal");
      return;
    }

    // Ventana / timer. Si alguien ya reclamó el desafío, el countdown se reinicia
    // (deps incluyen challengerId) para darle tiempo a ubicar antes del reveal.
    let limit: number | null = null;
    let action: string | null = null;
    if (phase === "playing" && cfgRef.current.turnTimerSec) {
      limit = cfgRef.current.turnTimerSec;
      action = "timeout";
    } else if (phase === "challenge") {
      limit = cfgRef.current.challengeWindowSec;
      action = "reveal";
    }
    if (limit == null) {
      setSecondsLeft(null);
      return;
    }

    let left = limit;
    setSecondsLeft(left);
    const id = setInterval(() => {
      left -= 1;
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(id);
        if (action) fire(action);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [roundId, phase, isHost, challengerId, challengePos, state.status]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function playCard() {
    if (!round?.cardUri) return;
    await player.play(round.cardUri);
    act("play"); // marca que ya suena → el turno ve el selector recién ahora
  }

  async function resolveRound() {
    await player.pause(); // frena la canción si seguía sonando
    await act("resolve", { metaAwarded: metaGuessed });
    setMetaGuessed(false);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-500">
          Hitazo · sala <span className="font-mono">{state.roomCode}</span>
        </h1>
        <span className="flex items-center gap-3 text-sm text-gray-400">
          <a href={`/view/${state.roomCode}`} target="_blank" rel="noreferrer" className="underline">
            📺 vista pública
          </a>
          Turno {state.currentTurn + 1} · {round?.phase ?? "—"}
          {secondsLeft != null && secondsLeft >= 0 && ` · ⏱ ${secondsLeft}s`}
        </span>
      </header>

      {state.status === "finished" && (
        <div className="rounded-lg bg-green-600 px-6 py-5 text-center text-white">
          <p className="text-xs uppercase tracking-widest text-green-200">Fin de la partida</p>
          <p className="text-3xl font-bold">
            🏆 {state.teams.find((t) => t.id === state.winnerTeamId)?.name ?? "—"}
          </p>
        </div>
      )}

      {state.status === "playing" && turnTeam && (
        <div className="rounded-lg bg-black px-6 py-4 text-center text-white">
          <p className="text-xs uppercase tracking-widest text-gray-400">Turno de</p>
          <p className="text-2xl font-bold">{turnTeam.name}</p>
          {round?.phase === "challenge" && (
            <p className="mt-1 text-xs text-amber-300">
              {challengerTeam ? `Desafía ${challengerTeam.name}` : "Ventana de desafío abierta"}
            </p>
          )}
        </div>
      )}

      {/* Controles de reproducción (host) */}
      {isHost && (
        <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
          {player.status !== "ready" && <p className="text-sm text-gray-500">{player.message}</p>}
          {player.status === "no_session" && (
            <a href="/host" className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white">
              Reconectar host
            </a>
          )}
          {player.status === "ready" && (
            <div className="flex gap-3">
              <button
                onClick={playCard}
                disabled={!round?.cardUri}
                className="rounded-full bg-[#1DB954] px-5 py-2 font-semibold text-white disabled:opacity-50"
              >
                Reproducir carta
              </button>
              <button onClick={player.togglePlay} className="rounded-full border px-5 py-2 font-semibold">
                {player.isPaused ? "Play" : "Pausa"}
              </button>
              <button onClick={player.replay} className="rounded-full border px-5 py-2 font-semibold">
                Replay
              </button>
            </div>
          )}
          {round?.phase === "challenge" && (
            <button
              onClick={() => act("reveal")}
              className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white"
            >
              Revelar ahora
            </button>
          )}
        </div>
      )}

      {/* Reveal */}
      {round?.phase === "reveal" && round.reveal && (
        <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-black p-6">
          <p className="text-xs uppercase tracking-widest text-gray-400">Reveal</p>
          <div className="flex items-center gap-4">
            {round.reveal.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- carátula del CDN de Spotify
              <img src={round.reveal.coverUrl} alt="" className="h-20 w-20 rounded" />
            )}
            <div className="text-left">
              <p className="font-mono text-4xl font-bold">{round.reveal.year}</p>
              <p className="font-semibold">{round.reveal.title}</p>
              <p className="text-sm text-gray-500">{round.reveal.artist}</p>
            </div>
          </div>
          <p className="text-sm">
            {turnTeam?.name}: ubicó{" "}
            <span className={round.placedCorrect ? "text-green-600" : "text-red-600"}>
              {round.placedCorrect ? "bien ✓" : "mal ✗"}
            </span>
            {challengerTeam && (
              <>
                {" · "}
                {challengerTeam.name} (desafío):{" "}
                <span className={round.challengeCorrect ? "text-green-600" : "text-red-600"}>
                  {round.challengeCorrect ? "bien ✓" : "mal ✗"}
                </span>
              </>
            )}
          </p>
          {isHost && (
            <div className="flex flex-col items-center gap-3">
              <label className="flex items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={metaGuessed}
                  onChange={(e) => setMetaGuessed(e.target.checked)}
                />
                {turnTeam?.name} adivinó <strong>título y artista</strong> (+🪙)
              </label>
              <button
                onClick={resolveRound}
                className="rounded-full bg-black px-8 py-3 font-semibold text-white"
              >
                Continuar →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Líneas de tiempo (todas) */}
      <Timelines state={state} />
    </main>
  );
}
