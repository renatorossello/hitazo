"use client";

import { useState, type ReactNode } from "react";
import TeamTimelineTabs, { useActiveTab } from "./TeamTimelineTabs";
import type { VMarker } from "./VerticalTimeline";
import type { GameState } from "@/lib/game/state";
import type { StoredPlayer } from "@/lib/game/player";

/**
 * Vista del player: una línea de tiempo por vez (vertical) con pestañas por equipo.
 * La pestaña sigue al turno; los huecos se marcan en esa misma línea cuando es tu
 * turno o cuando desafiás (sobre la línea del equipo en turno).
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
  const [sel, setSel] = useState<{ tab: string; pos: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useActiveTab(state);

  const round = state.round;
  const teamName = (id: string | null) => state.teams.find((t) => t.id === id)?.name ?? "…";

  if (!round) return <p className="mt-8 text-sm text-gray-400">Esperando…</p>;

  const myId = player.teamId;
  const isMyTurn = round.teamId === myId;
  const isChallenger = round.challengerId === myId;
  const showingTurnTab = activeTab === round.teamId;

  const canPlace = isMyTurn && round.phase === "playing" && round.played;
  const canChallengePlace = isChallenger && round.phase === "challenge" && round.challengePosition == null;
  const interactive = (canPlace || canChallengePlace) && showingTurnTab;

  // La selección pertenece a una pestaña; al cambiar de pestaña/turno se invalida sola.
  const pos = sel && sel.tab === activeTab ? sel.pos : null;

  async function submit(path: string, body?: object) {
    setBusy(true);
    try {
      await act(path, body);
      setSel(null);
    } finally {
      setBusy(false);
    }
  }

  // Marcadores read-only sobre la línea del turno (durante desafío/reveal).
  const markers: VMarker[] = [];
  if (showingTurnTab && !interactive && (round.phase === "challenge" || round.phase === "reveal")) {
    if (round.placedPosition != null) markers.push({ position: round.placedPosition, label: "turno", tone: "turn" });
    if (round.challengePosition != null) markers.push({ position: round.challengePosition, label: "desafío", tone: "challenge" });
  }

  // ---- Banner + acción ----
  let banner: ReactNode = null;
  let confirm: ReactNode = null;

  if (round.phase === "playing") {
    if (isMyTurn && !round.played) banner = pill("🎧 Es tu turno. Esperá a que suene el tema…", "turn");
    else if (isMyTurn) banner = pill("¡Tu turno! Tocá un hueco para ubicar el tema ↓", "turn");
    else banner = pill(<>🎶 Turno de <strong>{teamName(round.teamId)}</strong>. Escuchá.</>, "wait");
  } else if (round.phase === "challenge") {
    if (isMyTurn) banner = pill("Ubicaste. Ventana de desafío abierta… ⏳", "wait");
    else if (isChallenger && round.challengePosition == null)
      banner = pill(<>Desafiás a <strong>{teamName(round.teamId)}</strong>: elegí OTRO hueco ↓</>, "accent");
    else if (isChallenger) banner = pill("Desafío enviado. Esperando el reveal… ⏳", "wait");
    else if (round.challengerId) banner = pill(<>Desafía <strong>{teamName(round.challengerId)}</strong>.</>, "wait");
    else if ((state.teams.find((t) => t.id === myId)?.tokens ?? 0) < 1) banner = pill("Sin fichas para desafiar.", "wait");
    else {
      banner = pill(<>Turno de <strong>{teamName(round.teamId)}</strong> · podés desafiar.</>, "wait");
      confirm = (
        <button
          disabled={busy}
          onClick={() => submit("challenge/claim")}
          className="w-full rounded-2xl bg-accent px-6 py-4 text-lg font-bold text-brand-deep shadow-md transition active:scale-[0.98] disabled:opacity-40"
        >
          ⚡ Desafiar (−1 🪙)
        </button>
      );
    }
  } else if (round.phase === "reveal") {
    const r = round.reveal;
    banner = (
      <div className="flex w-full flex-col items-center gap-2 rounded-2xl bg-white px-5 py-4 shadow-md">
        {r && (
          <div className="flex items-center gap-3">
            {r.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- carátula del CDN de Spotify
              <img src={r.coverUrl} alt="" className="h-14 w-14 rounded-lg shadow" />
            )}
            <div className="text-left">
              <p className="font-mono text-3xl font-extrabold text-brand">{r.year}</p>
              <p className="font-semibold">{r.title}</p>
              <p className="text-sm text-gray-500">{r.artist}</p>
            </div>
          </div>
        )}
        {isMyTurn && (
          <p className={`text-sm font-bold ${round.placedCorrect ? "text-teal" : "text-red-600"}`}>
            {round.placedCorrect ? "¡Ubicaste bien! ✓" : "Ubicaste mal ✗"}
          </p>
        )}
        {isChallenger && (
          <p className={`text-sm font-bold ${round.challengeCorrect ? "text-teal" : "text-red-600"}`}>
            {round.challengeCorrect ? "¡Acertaste el desafío! ✓" : "Fallaste el desafío ✗"}
          </p>
        )}
        <p className="text-xs text-gray-400">Esperando al host…</p>
      </div>
    );
  }

  if (interactive && pos !== null) {
    confirm = (
      <button
        disabled={busy}
        onClick={() => submit(canPlace ? "place" : "challenge/place", { position: pos })}
        className="w-full rounded-2xl bg-brand px-6 py-4 text-lg font-bold text-white shadow-md transition active:scale-[0.98] disabled:opacity-40"
      >
        {canPlace ? "Confirmar ubicación" : "Confirmar desafío"}
      </button>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {banner}
      <TeamTimelineTabs
        state={state}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        myTeamId={myId}
        interactive={interactive}
        selected={pos}
        onSelectGap={(p) => setSel({ tab: activeTab!, pos: p })}
        disabledPosition={canChallengePlace && showingTurnTab ? round.placedPosition : null}
        markers={markers}
      />
      {confirm}
    </div>
  );
}

function pill(text: ReactNode, tone: "turn" | "accent" | "wait") {
  return (
    <div
      className={`w-full rounded-2xl px-5 py-3.5 text-center text-sm font-medium shadow-sm ${
        tone === "turn" ? "bg-brand text-white" : tone === "accent" ? "bg-accent text-brand-deep" : "bg-white text-gray-600"
      }`}
    >
      {text}
    </div>
  );
}
