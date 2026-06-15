"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { gameChannel, GameEvent } from "@/lib/game/events";
import type { GameState } from "@/lib/game/state";
import type { VMarker } from "./VerticalTimeline";
import TeamTimelineTabs, { useActiveTab } from "./TeamTimelineTabs";
import Logo from "./Logo";

/**
 * Vista de solo lectura, con el MISMO formato que el player (pestañas + línea
 * vertical), para que jugadores y espectadores vean lo mismo. Sin controles ni audio.
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

  return (
    <main className="flex min-h-full flex-1 flex-col gap-4 bg-gradient-to-b from-brand-deep to-brand p-5 text-white sm:p-8">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <Logo className="text-2xl" />
          <span className="font-mono text-lg tracking-widest text-violet-200">{state?.roomCode ?? roomCode}</span>
        </div>
        <span className="text-sm text-violet-300">solo lectura</span>
      </header>

      {state ? <Body state={state} /> : <p className="mt-10 text-center text-sm text-violet-300">Cargando…</p>}
    </main>
  );
}

function Body({ state }: { state: GameState }) {
  const [activeTab, setActiveTab] = useActiveTab(state);
  const round = state.round;
  const turnTeam = state.teams.find((t) => t.id === round?.teamId);
  const r = round?.reveal;
  const showingTurnTab = activeTab === round?.teamId;

  const markers: VMarker[] = [];
  if (showingTurnTab && (round?.phase === "challenge" || round?.phase === "reveal")) {
    if (round!.placedPosition != null) markers.push({ position: round!.placedPosition, label: "turno", tone: "turn" });
    if (round!.challengePosition != null) markers.push({ position: round!.challengePosition, label: "desafío", tone: "challenge" });
  }

  return (
    <>
      {state.status === "finished" ? (
        <div className="rounded-2xl bg-teal px-6 py-6 text-center shadow-lg">
          <p className="text-xs uppercase tracking-widest text-white/70">Fin de la partida</p>
          <p className="text-4xl font-extrabold">
            🏆 {state.teams.find((t) => t.id === state.winnerTeamId)?.name ?? "—"}
          </p>
        </div>
      ) : state.status === "lobby" ? (
        <p className="mt-8 text-center text-sm text-violet-300">La partida todavía no arrancó.</p>
      ) : (
        turnTeam && (
          <div className="rounded-2xl bg-brand px-6 py-4 text-center shadow-lg ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-widest text-violet-200">
              Turno {state.currentTurn + 1} · {round?.phase}
            </p>
            <p className="text-2xl font-extrabold">{turnTeam.name}</p>
          </div>
        )
      )}

      {round?.phase === "reveal" && r && (
        <div className="flex items-center justify-center gap-3 rounded-2xl bg-white/10 p-3 ring-2 ring-accent">
          {r.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- carátula del CDN de Spotify
            <img src={r.coverUrl} alt="" className="h-16 w-16 rounded-lg shadow" />
          )}
          <div>
            <p className="font-mono text-3xl font-extrabold text-accent">{r.year}</p>
            <p className="font-bold">{r.title}</p>
            <p className="text-sm text-violet-200">{r.artist}</p>
          </div>
        </div>
      )}

      {/* Mismo formato que el player: pestañas + línea vertical (read-only). */}
      <div className="rounded-2xl bg-white/95 p-3 text-gray-800">
        <TeamTimelineTabs state={state} activeTab={activeTab} onSelectTab={setActiveTab} markers={markers} />
      </div>
    </>
  );
}
