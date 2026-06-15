"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { gameChannel, GameEvent } from "@/lib/game/events";
import { loadPlayer, type StoredPlayer } from "@/lib/game/player";
import type { GameState } from "@/lib/game/state";
import PlayerGame from "@/components/PlayerGame";

export default function PlayPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = (params.roomCode ?? "").toUpperCase();

  const [resolved, setResolved] = useState<{ player: StoredPlayer | null } | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const player = resolved?.player ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- identidad client-only (localStorage)
    setResolved({ player: loadPlayer(roomCode) });
  }, [roomCode]);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/games/${roomCode}/state`);
    if (res.ok) setState(await res.json());
  }, [roomCode]);

  useEffect(() => {
    if (!player) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial async (setState post-await)
    refetch();
    const supabase = getSupabaseBrowser();
    const channel = supabase.channel(gameChannel(roomCode), {
      config: { presence: { key: player.teamId } },
    });
    channelRef.current = channel;
    channel.on("broadcast", { event: GameEvent.StateChanged }, () => refetch());
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ teamId: player.teamId, name: player.name, joinOrder: player.joinOrder });
        setConnected(true);
      }
    });
    return () => {
      channelRef.current = null;
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [player, roomCode, refetch]);

  // Manda una intención al server (con el teamId) y avisa al canal si prosperó.
  const act = useCallback(
    async (path: string, body?: object) => {
      const res = await fetch(`/api/games/${roomCode}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: player?.teamId, ...body }),
      });
      if (res.ok) {
        channelRef.current?.send({ type: "broadcast", event: GameEvent.StateChanged, payload: {} });
        await refetch();
      }
      return res;
    },
    [roomCode, player, refetch]
  );

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
          {state.winnerTeamId === player.teamId ? "🏆 ¡Ganaron!" : `Terminó. Ganó ${state.teams.find((t) => t.id === state.winnerTeamId)?.name ?? "—"}.`}
        </p>
      ) : (
        <PlayerGame state={state} player={player} act={act} />
      )}
    </main>
  );
}
