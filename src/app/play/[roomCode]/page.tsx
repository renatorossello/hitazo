"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { gameChannel, GameEvent } from "@/lib/game/events";
import { loadPlayer, type StoredPlayer } from "@/lib/game/player";
import type { GameState } from "@/lib/game/state";

export default function PlayPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = (params.roomCode ?? "").toUpperCase();

  const [resolved, setResolved] = useState<{ player: StoredPlayer | null } | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const player = resolved?.player ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- identidad client-only (localStorage)
    setResolved({ player: loadPlayer(roomCode) });
  }, [roomCode]);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/games/${roomCode}/state`);
    if (res.ok) setState(await res.json());
  }, [roomCode]);

  // Presencia (para que el board me vea) + escucha de cambios de estado.
  useEffect(() => {
    if (!player) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial async (setState post-await)
    refetch();
    const supabase = getSupabaseBrowser();
    const channel = supabase.channel(gameChannel(roomCode), {
      config: { presence: { key: player.teamId } },
    });
    channel.on("broadcast", { event: GameEvent.StateChanged }, () => refetch());
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ teamId: player.teamId, name: player.name, joinOrder: player.joinOrder });
        setConnected(true);
      }
    });
    return () => {
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [player, roomCode, refetch]);

  if (!resolved) return null;

  if (!player) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-gray-500">No estás registrado en esta sala.</p>
        <Link href={`/join?code=${roomCode}`} className="rounded-full bg-black px-6 py-3 font-semibold text-white">
          Entrar con el código {roomCode}
        </Link>
      </main>
    );
  }

  const myTeam = state?.teams.find((t) => t.id === player.teamId) ?? null;
  const round = state?.round ?? null;
  const turnTeam = state?.teams.find((t) => t.id === round?.teamId) ?? null;
  const isMyTurn = round?.teamId === player.teamId;

  return (
    <main className="flex flex-1 flex-col items-center gap-6 p-8 text-center">
      <header className="flex flex-col items-center gap-1">
        <p className="text-xs uppercase tracking-widest text-gray-400">Tu equipo</p>
        <h1 className="text-3xl font-bold">{player.name}</h1>
        <p className="text-sm text-gray-500">
          Sala <span className="font-mono font-semibold">{roomCode}</span>
          {myTeam && ` · 🪙 ${myTeam.tokens} · ${myTeam.cards.length}/${state?.config.targetCards ?? 10}`}
          {!connected && " · conectando…"}
        </p>
      </header>

      {!state || state.status === "lobby" ? (
        <p className="max-w-xs text-sm text-gray-400">Esperando que el host arranque la partida…</p>
      ) : state.status === "finished" ? (
        <p className="text-lg font-semibold">
          {state.winnerTeamId === player.teamId ? "🏆 ¡Ganaron!" : "Terminó la partida."}
        </p>
      ) : isMyTurn ? (
        <div className="flex flex-col items-center gap-2">
          <p className="rounded-md bg-black px-5 py-3 text-lg font-bold text-white">¡Es tu turno!</p>
          <p className="max-w-xs text-sm text-gray-500">
            Escuchá el tema. La ubicación en tu línea de tiempo llega en la Parte 2.
          </p>
        </div>
      ) : (
        <p className="max-w-xs text-sm text-gray-500">
          Turno de <strong>{turnTeam?.name ?? "…"}</strong>. Escuchá el tema.
        </p>
      )}
    </main>
  );
}
