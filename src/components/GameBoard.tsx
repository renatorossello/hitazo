"use client";

import { useSpotifyPlayer } from "@/lib/spotify/useSpotifyPlayer";
import type { GameState } from "@/lib/game/state";

/**
 * Board en juego (Parte 1): líneas de tiempo de todos los equipos, turno destacado,
 * y controles de reproducción para el host. La ubicación/desafío/reveal son Parte 2.
 */
export default function GameBoard({ state, isHost }: { state: GameState; isHost: boolean }) {
  const player = useSpotifyPlayer();
  const round = state.round;
  const turnTeam = state.teams.find((t) => t.id === round?.teamId) ?? null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-500">
          Hitazo · sala <span className="font-mono">{state.roomCode}</span>
        </h1>
        <span className="text-sm text-gray-400">
          Turno {state.currentTurn + 1} · fase: {round?.phase ?? "—"}
        </span>
      </header>

      {turnTeam && (
        <div className="rounded-lg bg-black px-6 py-4 text-center text-white">
          <p className="text-xs uppercase tracking-widest text-gray-400">Turno de</p>
          <p className="text-2xl font-bold">{turnTeam.name}</p>
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
                onClick={() => round?.cardUri && player.play(round.cardUri)}
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
        </div>
      )}

      {/* Líneas de tiempo */}
      <section className="flex flex-col gap-4">
        {state.teams.map((team) => {
          const isTurn = team.id === round?.teamId;
          return (
            <div
              key={team.id}
              className={`rounded-lg border p-4 ${isTurn ? "border-black ring-1 ring-black" : ""}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-semibold">{team.name}</span>
                <span className="text-sm text-gray-500">
                  🪙 {team.tokens} · {team.cards.length}/{state.config.targetCards}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {team.cards.map((c) => (
                  <div
                    key={c.cardId}
                    className="flex min-w-[120px] flex-col rounded-md border bg-gray-50 px-3 py-2"
                    title={`${c.title} — ${c.artist}`}
                  >
                    <span className="font-mono text-lg font-bold">{c.year}</span>
                    <span className="truncate text-xs text-gray-500">{c.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
