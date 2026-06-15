"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { gameChannel } from "@/lib/game/events";
import { loadPlayer, type StoredPlayer } from "@/lib/game/player";

export default function PlayPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = (params.roomCode ?? "").toUpperCase();

  // null = todavía no leímos localStorage; { player } ya resuelto (player puede ser null).
  const [resolved, setResolved] = useState<{ player: StoredPlayer | null } | null>(null);
  const [connected, setConnected] = useState(false);
  const player = resolved?.player ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- identidad client-only (localStorage)
    setResolved({ player: loadPlayer(roomCode) });
  }, [roomCode]);

  // Mientras esté en esta pantalla, publica su presencia para que el board lo vea.
  useEffect(() => {
    if (!player) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase.channel(gameChannel(roomCode), {
      config: { presence: { key: player.teamId } },
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          teamId: player.teamId,
          name: player.name,
          joinOrder: player.joinOrder,
        });
        setConnected(true);
      }
    });

    return () => {
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [player, roomCode]);

  if (!resolved) return null;

  if (!player) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-gray-500">No estás registrado en esta sala.</p>
        <Link
          href={`/join?code=${roomCode}`}
          className="rounded-full bg-black px-6 py-3 font-semibold text-white"
        >
          Entrar con el código {roomCode}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm uppercase tracking-widest text-gray-400">Tu equipo</p>
      <h1 className="text-4xl font-bold">{player.name}</h1>
      <p className="text-sm text-gray-500">
        Sala <span className="font-mono font-semibold">{roomCode}</span>
        {connected ? " · conectado" : " · conectando…"}
      </p>
      <p className="mt-4 max-w-xs text-sm text-gray-400">
        Esperando que el host arranque la partida… (el loop de juego llega en la Fase 3)
      </p>
    </main>
  );
}
