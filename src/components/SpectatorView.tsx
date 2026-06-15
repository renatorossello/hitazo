"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { gameChannel, GameEvent } from "@/lib/game/events";
import type { GameState } from "@/lib/game/state";
import Timelines from "./Timelines";

/**
 * Vista de solo lectura de la partida (sin controles ni audio). Pensada para
 * proyectar en una pantalla o que la miren equipos numerosos sin amontonarse en un
 * celular. Se sincroniza por el mismo canal (state_changed), sin tocar presencia.
 */
export default function SpectatorView({ roomCode }: { roomCode: string }) {
  const [state, setState] = useState<GameState | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/games/${roomCode}/state`);
    if (res.ok) setState(await res.json());
  }, [roomCode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial async (setState post-await)
    refetch();
    const supabase = getSupabaseBrowser();
    const channel = supabase.channel(gameChannel(roomCode));
    channel.on("broadcast", { event: GameEvent.StateChanged }, () => refetch());
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode, refetch]);

  if (!state) {
    return <main className="flex flex-1 items-center justify-center p-8 text-sm text-gray-400">Cargando…</main>;
  }

  const round = state.round;
  const turnTeam = state.teams.find((t) => t.id === round?.teamId);
  const r = round?.reveal;

  return (
    <main className="flex flex-1 flex-col gap-5 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-500">
          Hitazo · sala <span className="font-mono">{state.roomCode}</span>
        </h1>
        <span className="text-sm text-gray-400">solo lectura</span>
      </header>

      {state.status === "finished" ? (
        <div className="rounded-lg bg-green-600 px-6 py-5 text-center text-white">
          <p className="text-xs uppercase tracking-widest text-green-200">Fin de la partida</p>
          <p className="text-3xl font-bold">
            🏆 {state.teams.find((t) => t.id === state.winnerTeamId)?.name ?? "—"}
          </p>
        </div>
      ) : state.status === "lobby" ? (
        <p className="text-center text-sm text-gray-400">La partida todavía no arrancó.</p>
      ) : (
        turnTeam && (
          <div className="rounded-lg bg-black px-6 py-4 text-center text-white">
            <p className="text-xs uppercase tracking-widest text-gray-400">
              Turno {state.currentTurn + 1} · {round?.phase}
            </p>
            <p className="text-2xl font-bold">{turnTeam.name}</p>
          </div>
        )
      )}

      {round?.phase === "reveal" && r && (
        <div className="flex items-center justify-center gap-4 rounded-lg border-2 border-black p-4">
          {r.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- carátula del CDN de Spotify
            <img src={r.coverUrl} alt="" className="h-16 w-16 rounded" />
          )}
          <div>
            <p className="font-mono text-3xl font-bold">{r.year}</p>
            <p className="font-semibold">{r.title}</p>
            <p className="text-sm text-gray-500">{r.artist}</p>
          </div>
        </div>
      )}

      <Timelines state={state} />
    </main>
  );
}
