"use client";

import type { GameState } from "@/lib/game/state";

/**
 * Vista read-only de las líneas de tiempo de todos los equipos. La ven tanto el board
 * como cada jugador (el host puede no estar proyectado en un TV). Sobre la línea del
 * equipo en turno se marcan el hueco que eligió el turno y el del desafiante.
 */

type Marker = { position: number; label: string; tone: "turn" | "challenge" };

function TimelineView({ cards, markers }: { cards: { year: number; title: string }[]; markers: Marker[] }) {
  const gap = (i: number) => {
    const here = markers.filter((m) => m.position === i);
    return (
      <div key={`g${i}`} className="flex w-7 flex-col items-center justify-end gap-0.5">
        {here.map((m, idx) => (
          <span
            key={idx}
            className={`rounded px-1 text-[9px] font-semibold leading-tight ${
              m.tone === "turn" ? "bg-black text-white" : "bg-amber-500 text-white"
            }`}
          >
            {m.label}
          </span>
        ))}
        <div className={`h-12 w-1 rounded ${here.length ? "bg-amber-400" : "bg-gray-200"}`} />
      </div>
    );
  };

  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-1">
      {gap(0)}
      {cards.map((c, i) => (
        <div key={i} className="flex items-end gap-1">
          <div className="flex h-16 min-w-[72px] flex-col items-center justify-center rounded border bg-gray-50 px-1">
            <span className="font-mono text-sm font-bold">{c.year}</span>
            <span className="max-w-[68px] truncate text-[9px] text-gray-500">{c.title}</span>
          </div>
          {gap(i + 1)}
        </div>
      ))}
    </div>
  );
}

export default function Timelines({
  state,
  highlightTeamId,
}: {
  state: GameState;
  highlightTeamId?: string;
}) {
  const round = state.round;
  const showMarkers = round && (round.phase === "challenge" || round.phase === "reveal");

  return (
    <div className="flex w-full flex-col gap-3">
      {state.teams.map((team) => {
        const isTurn = team.id === round?.teamId;
        const isMine = team.id === highlightTeamId;
        const markers: Marker[] = [];
        if (isTurn && showMarkers) {
          if (round!.placedPosition != null) {
            markers.push({ position: round!.placedPosition, label: "turno", tone: "turn" });
          }
          if (round!.challengePosition != null) {
            markers.push({ position: round!.challengePosition, label: "desafío", tone: "challenge" });
          }
        }
        return (
          <div
            key={team.id}
            className={`rounded-lg border p-3 ${
              isMine ? "border-blue-600 bg-blue-50 ring-2 ring-blue-500" : isTurn ? "border-black ring-1 ring-black" : ""
            }`}
          >
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">
                {team.name}
                {isMine && <span className="ml-1 rounded bg-blue-600 px-1.5 text-xs text-white">vos</span>}
                {isTurn && <span className="ml-1 text-xs text-gray-400">· en turno</span>}
              </span>
              <span className="text-gray-500">
                🪙 {team.tokens} · {team.cards.length}/{state.config.targetCards}
              </span>
            </div>
            <TimelineView cards={team.cards.map((c) => ({ year: c.year, title: c.title }))} markers={markers} />
          </div>
        );
      })}
    </div>
  );
}
