"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { gameChannel, GameEvent } from "@/lib/game/events";
import { loadPlayer, type StoredPlayer } from "@/lib/game/player";
import type { GameState } from "@/lib/game/state";
import Logo from "@/components/Logo";
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
      const ok = status === "SUBSCRIBED";
      setConnected(ok);
      if (ok) {
        await channel.track({ teamId: player.teamId, name: player.name, joinOrder: player.joinOrder });
      }
    });
    return () => {
      channelRef.current = null;
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [player, roomCode, refetch]);

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
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-brand-deep to-brand p-8 text-center text-white">
        <Logo className="text-4xl" />
        <p className="text-sm text-violet-200">No estás registrado en esta sala.</p>
        <Link href={`/join?code=${roomCode}`} className="rounded-2xl bg-accent px-6 py-3 font-bold text-brand-deep">
          Entrar con el código {roomCode}
        </Link>
      </main>
    );
  }

  const myTeam = state?.teams.find((t) => t.id === player.teamId) ?? null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-violet-50">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-brand px-4 py-3 text-white shadow-md">
        <Logo className="text-2xl" />
        <span className={`flex items-center gap-1.5 text-xs ${connected ? "text-teal" : "text-amber-300"}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-teal" : "animate-pulse bg-amber-300"}`} />
          {connected ? "en vivo" : "reconectando…"}
        </span>
      </header>

      {/* Tarjeta del equipo */}
      <div className="mx-4 mt-4 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400">Tu equipo</p>
          <p className="text-xl font-bold text-brand">{player.name}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-accent/15 px-3 py-1 font-semibold text-accent-600">🪙 {myTeam?.tokens ?? 0}</span>
          <span className="rounded-full bg-brand/10 px-3 py-1 font-semibold text-brand">
            {myTeam?.cards.length ?? 0}/{state?.config.targetCards ?? 10}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-5 p-4">
        {!state || state.status === "lobby" ? (
          <p className="mt-10 max-w-xs text-center text-sm text-gray-500">
            Esperando que el host arranque la partida… 🎶
          </p>
        ) : state.status === "finished" ? (
          <div className="mt-8 text-center">
            <p className="text-5xl">{state.winnerTeamId === player.teamId ? "🏆" : "🎉"}</p>
            <p className="mt-2 text-xl font-bold text-brand">
              {state.winnerTeamId === player.teamId
                ? "¡Ganaron!"
                : `Ganó ${state.teams.find((t) => t.id === state.winnerTeamId)?.name ?? "—"}`}
            </p>
          </div>
        ) : (
          <PlayerGame state={state} player={player} act={act} />
        )}
      </div>
    </div>
  );
}
