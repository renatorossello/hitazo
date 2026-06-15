"use client";

import { useEffect, useRef, useState } from "react";
import VerticalTimeline, { type VMarker } from "./VerticalTimeline";
import type { GameState } from "@/lib/game/state";

/**
 * Pestaña activa que SIGUE al equipo en turno (salta cuando cambia el turno), pero
 * el usuario puede cambiarla manualmente. Devuelve [activeTab, setActiveTab].
 */
export function useActiveTab(state: GameState): [string | null, (id: string) => void] {
  const [selected, setSelected] = useState<string | null>(null);
  const lastTurnRef = useRef<string | null>(null);
  const turnId = state.round?.teamId ?? null;

  useEffect(() => {
    if (turnId && turnId !== lastTurnRef.current) {
      lastTurnRef.current = turnId;
      setSelected(turnId);
    }
  }, [turnId]);

  const active = selected ?? turnId ?? state.teams[0]?.id ?? null;
  return [active, setSelected];
}

/**
 * Pestañas por equipo + estado del equipo activo (🪙 fichas y x/y cartas) + su línea
 * de tiempo vertical. Lo usan el player (interactivo) y la vista pública (read-only),
 * para que jugadores y espectadores vean el mismo formato.
 */
export default function TeamTimelineTabs({
  state,
  activeTab,
  onSelectTab,
  myTeamId,
  interactive = false,
  selected = null,
  onSelectGap,
  disabledPosition = null,
  markers = [],
}: {
  state: GameState;
  activeTab: string | null;
  onSelectTab: (id: string) => void;
  myTeamId?: string;
  interactive?: boolean;
  selected?: number | null;
  onSelectGap?: (pos: number) => void;
  disabledPosition?: number | null;
  markers?: VMarker[];
}) {
  const round = state.round;
  const activeTeam = state.teams.find((t) => t.id === activeTab) ?? null;
  const cards = (activeTeam?.cards ?? [])
    .map((c) => ({ year: c.year, title: c.title, coverUrl: c.coverUrl }))
    .sort((a, b) => a.year - b.year);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {state.teams.map((t) => {
          const active = t.id === activeTab;
          const isTurn = t.id === round?.teamId;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                active ? "bg-brand text-white shadow" : "bg-white text-gray-600 ring-1 ring-gray-200"
              }`}
            >
              {isTurn && <span className="h-2 w-2 rounded-full bg-accent" />}
              {t.name}
              {t.id === myTeamId && <span className="rounded bg-teal px-1 text-[10px] text-white">vos</span>}
            </button>
          );
        })}
      </div>

      {activeTeam && (
        <div className="flex items-center justify-between px-1 text-sm">
          <span className="font-bold text-gray-700">{activeTeam.name}</span>
          <span className="flex gap-2">
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-semibold text-accent-600">
              🪙 {activeTeam.tokens}
            </span>
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 font-semibold text-brand">
              {activeTeam.cards.length}/{state.config.targetCards}
            </span>
          </span>
        </div>
      )}

      <VerticalTimeline
        cards={cards}
        markers={markers}
        interactive={interactive}
        selected={selected}
        onSelect={onSelectGap}
        disabledPosition={disabledPosition}
      />
    </div>
  );
}
