"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { gameChannel, GameEvent, type TeamPresence } from "@/lib/game/events";
import type { GameState } from "@/lib/game/state";
import Lobby, { type LobbyTeam } from "./Lobby";
import GameBoard from "./GameBoard";

/**
 * Orquestador del board: única suscripción al canal game:{roomCode} (presencia +
 * "state_changed"), lee /state como fuente de verdad y decide qué vista mostrar.
 */
export default function BoardClient({ roomCode, isHost }: { roomCode: string; isHost: boolean }) {
  const [state, setState] = useState<GameState | null>(null);
  const [present, setPresent] = useState<Record<string, TeamPresence>>({});
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/games/${roomCode}/state`);
    if (res.ok) setState(await res.json());
  }, [roomCode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial async (setState post-await)
    refetch();
  }, [refetch]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase.channel(gameChannel(roomCode), {
      config: { presence: { key: "board" } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const st = channel.presenceState<TeamPresence>();
      const next: Record<string, TeamPresence> = {};
      for (const entries of Object.values(st)) {
        for (const e of entries) if (e.teamId) next[e.teamId] = e;
      }
      setPresent(next);
    });
    channel.on("broadcast", { event: GameEvent.StateChanged }, () => {
      refetch();
    });
    channel.subscribe();

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomCode, refetch]);

  const startGame = useCallback(async (cfg: { targetCards: number; challengeWindowSec: number; closeTurnSec: number }) => {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/games/${roomCode}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msgs: Record<string, string> = {
          need_two_teams: "Hacen falta al menos 2 equipos.",
          not_enough_cards: "No hay suficientes cartas jugables en el mazo.",
          no_host_session: "Tu sesión de Spotify venció. Reconectá.",
          already_started: "La partida ya arrancó.",
        };
        setStartError(msgs[data.error] ?? "No se pudo empezar.");
        return;
      }
      channelRef.current?.send({ type: "broadcast", event: GameEvent.StateChanged, payload: {} });
      await refetch();
    } finally {
      setStarting(false);
    }
  }, [roomCode, refetch]);

  // Acciones del host/board (reveal, resolve, timeout). Avisa al canal y re-lee.
  const act = useCallback(
    async (path: string, body?: object) => {
      const res = await fetch(`/api/games/${roomCode}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) {
        channelRef.current?.send({ type: "broadcast", event: GameEvent.StateChanged, payload: {} });
        await refetch();
      }
      return res;
    },
    [roomCode, refetch]
  );

  const lobbyTeams: LobbyTeam[] = useMemo(() => {
    const byId = new Map<string, LobbyTeam>();
    for (const t of state?.teams ?? []) {
      byId.set(t.id, { teamId: t.id, name: t.name, joinOrder: t.joinOrder, connected: false });
    }
    for (const p of Object.values(present)) {
      byId.set(p.teamId, { teamId: p.teamId, name: p.name, joinOrder: p.joinOrder, connected: true });
    }
    return [...byId.values()].sort((a, b) => a.joinOrder - b.joinOrder);
  }, [state, present]);

  if (!state) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-gradient-to-b from-brand-deep to-brand-dark p-8 text-sm text-violet-300">
        Cargando…
      </main>
    );
  }

  if (state.status === "lobby") {
    return (
      <Lobby
        roomCode={roomCode}
        teams={lobbyTeams}
        isHost={isHost}
        onStart={startGame}
        starting={starting}
        startError={startError}
      />
    );
  }

  return <GameBoard state={state} isHost={isHost} act={act} />;
}
