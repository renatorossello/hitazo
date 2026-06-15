"use client";

import type { GameState } from "@/lib/game/state";

/**
 * Líneas de tiempo de todos los equipos (read-only). La ven el board, cada jugador y
 * la vista pública. Sobre la línea del turno se marcan el hueco del turno y el del
 * desafiante. `variant` adapta los colores a fondo claro (player) u oscuro (board).
 */
type Marker = { position: number; label: string; tone: "turn" | "challenge" };

function TimelineView({ cards, markers }: { cards: { year: number; title: string }[]; markers: Marker[] }) {
  const gap = (i: number) => {
    const here = markers.filter((m) => m.position === i);
    return (
      <div key={`g${i}`} className="flex w-6 shrink-0 flex-col items-center justify-end gap-0.5">
        {here.map((m, idx) => (
          <span
            key={idx}
            className={`rounded px-1 text-[9px] font-bold leading-tight ${
              m.tone === "turn" ? "bg-brand text-white" : "bg-accent text-brand-deep"
            }`}
          >
            {m.label}
          </span>
        ))}
        <div className={`h-12 w-1 rounded ${here.length ? "bg-accent" : "bg-gray-300/40"}`} />
      </div>
    );
  };

  return (
    <div className="no-scrollbar flex items-end gap-1 overflow-x-auto pb-1">
      {gap(0)}
      {cards.map((c, i) => (
        <div key={i} className="flex shrink-0 items-end gap-1">
          <div className="flex h-16 min-w-[72px] flex-col items-center justify-center rounded-lg bg-white px-1 text-gray-800 shadow-sm">
            <span className="font-mono text-sm font-extrabold">{c.year}</span>
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
  variant = "light",
}: {
  state: GameState;
  highlightTeamId?: string;
  variant?: "light" | "dark";
}) {
  const round = state.round;
  const showMarkers = round && (round.phase === "challenge" || round.phase === "reveal");
  const dark = variant === "dark";

  return (
    <div className="flex w-full flex-col gap-3">
      {state.teams.map((team) => {
        const isTurn = team.id === round?.teamId;
        const isMine = team.id === highlightTeamId;
        const markers: Marker[] = [];
        if (isTurn && showMarkers) {
          if (round!.placedPosition != null) markers.push({ position: round!.placedPosition, label: "turno", tone: "turn" });
          if (round!.challengePosition != null) markers.push({ position: round!.challengePosition, label: "desafío", tone: "challenge" });
        }

        const ring = isMine
          ? "ring-2 ring-teal border-teal"
          : isTurn
            ? "ring-2 ring-accent border-accent"
            : dark
              ? "border-white/10"
              : "border-gray-200";

        return (
          <div
            key={team.id}
            className={`rounded-2xl border p-3 ${ring} ${dark ? "bg-white/5 text-white" : "bg-white text-gray-800 shadow-sm"}`}
          >
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-bold">
                {team.name}
                {isMine && <span className="ml-1.5 rounded bg-teal px-1.5 text-xs font-bold text-white">vos</span>}
                {isTurn && <span className="ml-1.5 rounded bg-accent px-1.5 text-xs font-bold text-brand-deep">turno</span>}
              </span>
              <span className={dark ? "text-violet-200" : "text-gray-500"}>
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
