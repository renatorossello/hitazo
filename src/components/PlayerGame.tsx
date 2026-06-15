"use client";

import { useState, type ReactNode } from "react";
import TimelinePlacer from "./TimelinePlacer";
import Timelines from "./Timelines";
import type { GameState } from "@/lib/game/state";
import type { StoredPlayer } from "@/lib/game/player";

/**
 * Vista del player: ve TODAS las líneas de tiempo (no depende del TV del host) y,
 * según la fase, actúa. El desafío se hace sobre la línea del equipo en turno,
 * eligiendo un hueco DISTINTO al que marcó el turno.
 */
export default function PlayerGame({
  state,
  player,
  act,
}: {
  state: GameState;
  player: StoredPlayer;
  act: (path: string, body?: object) => Promise<Response>;
}) {
  const [pos, setPos] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const round = state.round;
  const myTeam = state.teams.find((t) => t.id === player.teamId);
  const teamName = (id: string | null) => state.teams.find((t) => t.id === id)?.name ?? "…";
  const turnTeam = state.teams.find((t) => t.id === round?.teamId);

  if (!round) return <Timelines state={state} highlightTeamId={player.teamId} />;

  const isMyTurn = round.teamId === player.teamId;
  const isChallenger = round.challengerId === player.teamId;

  async function submit(path: string, body?: object) {
    setBusy(true);
    try {
      await act(path, body);
      setPos(null);
    } finally {
      setBusy(false);
    }
  }

  // Área de acción según la fase.
  let action: ReactNode = null;

  if (round.phase === "playing") {
    if (isMyTurn && !round.played) {
      action = <p className="text-sm text-gray-500">Es tu turno. Esperá a que el host reproduzca el tema… 🎧</p>;
    } else if (isMyTurn) {
      const myCards = (myTeam?.cards ?? []).map((c) => ({ year: c.year, title: c.title }));
      action = (
        <div className="flex w-full flex-col items-center gap-3">
          <p className="text-sm text-gray-500">Ubicá el tema que sonó en tu línea de tiempo.</p>
          <TimelinePlacer cards={myCards} selected={pos} onSelect={setPos} />
          <button
            disabled={pos === null || busy}
            onClick={() => submit("place", { position: pos })}
            className="rounded-full bg-black px-6 py-3 font-semibold text-white disabled:opacity-40"
          >
            Confirmar ubicación
          </button>
        </div>
      );
    } else {
      action = <p className="text-sm text-gray-500">Escuchá. Turno de <strong>{teamName(round.teamId)}</strong>.</p>;
    }
  } else if (round.phase === "challenge") {
    if (isMyTurn) {
      action = <p className="text-sm text-gray-500">Ubicaste. Ventana de desafío abierta…</p>;
    } else if (isChallenger) {
      if (round.challengePosition == null) {
        const turnCards = (turnTeam?.cards ?? []).map((c) => ({ year: c.year, title: c.title }));
        action = (
          <div className="flex w-full flex-col items-center gap-3">
            <p className="text-sm text-gray-500">
              Desafiás a <strong>{turnTeam?.name}</strong>: elegí otro hueco en SU línea (no el que marcó).
            </p>
            <TimelinePlacer
              cards={turnCards}
              selected={pos}
              onSelect={setPos}
              disabledPosition={round.placedPosition}
              disabledLabel="turno"
            />
            <button
              disabled={pos === null || busy}
              onClick={() => submit("challenge/place", { position: pos })}
              className="rounded-full bg-amber-500 px-6 py-3 font-semibold text-white disabled:opacity-40"
            >
              Confirmar desafío
            </button>
          </div>
        );
      } else {
        action = <p className="text-sm text-gray-500">Desafío enviado. Esperando el reveal…</p>;
      }
    } else if (round.challengerId) {
      action = <p className="text-sm text-gray-500">Desafía <strong>{teamName(round.challengerId)}</strong>.</p>;
    } else if ((myTeam?.tokens ?? 0) < 1) {
      action = <p className="text-sm text-gray-400">No tenés fichas para desafiar.</p>;
    } else {
      action = (
        <button
          disabled={busy}
          onClick={() => submit("challenge/claim")}
          className="rounded-full bg-amber-500 px-6 py-3 font-semibold text-white disabled:opacity-40"
        >
          Desafiar (−1 🪙)
        </button>
      );
    }
  } else if (round.phase === "reveal") {
    const r = round.reveal;
    action = (
      <div className="flex flex-col items-center gap-2">
        {r && (
          <div className="text-center">
            <p className="font-mono text-4xl font-bold">{r.year}</p>
            <p className="font-semibold">{r.title}</p>
            <p className="text-sm text-gray-500">{r.artist}</p>
          </div>
        )}
        {isMyTurn && (
          <p className={`text-sm ${round.placedCorrect ? "text-green-600" : "text-red-600"}`}>
            {round.placedCorrect ? "¡Ubicaste bien!" : "Ubicaste mal."}
          </p>
        )}
        {isChallenger && (
          <p className={`text-sm ${round.challengeCorrect ? "text-green-600" : "text-red-600"}`}>
            {round.challengeCorrect ? "¡Acertaste el desafío!" : "Fallaste el desafío."}
          </p>
        )}
        <p className="text-sm text-gray-400">Esperando al host…</p>
      </div>
    );
  } else {
    action = <p className="text-sm text-gray-400">Resolviendo…</p>;
  }

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-5">
      <div className="min-h-[80px] w-full">{action}</div>
      <Timelines state={state} highlightTeamId={player.teamId} />
    </div>
  );
}
