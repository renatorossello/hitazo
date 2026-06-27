"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { gameChannel, GameEvent } from "@/lib/game/events";
import type { GameState, StateTeam, StateRound } from "@/lib/game/state";
import { useCountdown } from "./useCountdown";
import { useWakeLock } from "./useWakeLock";
import Logo from "./Logo";

/**
 * Vista para TELE (smart TV con navegador): apaisada, grande y legible desde el sillón.
 * Es otro cliente más del juego (no espeja el celular del host): se abre en el navegador
 * del TV en /tv/CODE y se sincroniza por realtime. Muestra años, líneas de tiempo,
 * monedas, cuentas regresivas, quién juega y en qué etapa, y el reveal en grande.
 */
export default function TvView({ roomCode }: { roomCode: string }) {
  const [state, setState] = useState<GameState | null>(null);
  const [joinUrl, setJoinUrl] = useState("");

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/games/${roomCode}/state`);
    if (res.ok) setState(await res.json());
  }, [roomCode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial async
    refetch();
    const supabase = getSupabaseBrowser();
    const channel = supabase.channel(gameChannel(roomCode));
    channel.on("broadcast", { event: GameEvent.StateChanged }, () => refetch());
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode, refetch]);

  useWakeLock();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only
    setJoinUrl(`${window.location.origin}/join?code=${roomCode}`);
  }, [roomCode]);

  const round = state?.round ?? null;
  const limit =
    round?.phase === "challenge"
      ? state?.config.challengeWindowSec ?? null
      : round?.phase === "closing"
        ? state?.config.closeTurnSec ?? null
        : null;
  const secondsLeft = useCountdown(round?.phaseStartedAt ?? null, limit);

  if (!state) {
    return (
      <main className="flex h-screen items-center justify-center bg-gradient-to-br from-brand-deep to-brand-dark text-2xl text-violet-300">
        Cargando…
      </main>
    );
  }

  const turnTeam = state.teams.find((t) => t.id === round?.teamId) ?? null;
  const challengerTeam = state.teams.find((t) => t.id === round?.challengerId) ?? null;
  const reveal = round?.phase === "reveal" || round?.phase === "resolved" ? round?.reveal : null;
  const code = state.roomCode;

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-br from-brand-deep via-brand-dark to-brand p-[2.2vh] text-white">
      {/* Barra superior: estado del juego + código/QR para sumarse */}
      <header className="flex shrink-0 items-stretch gap-[2vh]">
        <div className="flex items-center gap-[1.5vw]">
          <Logo className="text-[4vh]" />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <StatusBanner
            state={state}
            round={round}
            turnTeam={turnTeam}
            challengerTeam={challengerTeam}
            secondsLeft={secondsLeft}
          />
        </div>

        {/* Sumarse desde el celu: el QR de la tele SÍ lo pueden escanear los jugadores. */}
        <div className="flex items-center gap-[1.2vw] rounded-[1.4vh] bg-white/10 px-[1.4vw] py-[1.2vh] ring-1 ring-white/15">
          <div className="text-right">
            <p className="text-[1.7vh] uppercase tracking-widest text-violet-200">Sumate</p>
            <p className="font-mono text-[4vh] font-extrabold leading-none tracking-[0.12em] text-accent">{code}</p>
          </div>
          {joinUrl && (
            <div className="rounded-[0.8vh] bg-white p-[0.5vh]">
              <QRCodeSVG value={joinUrl} size={64} />
            </div>
          )}
        </div>
      </header>

      {/* Reveal en grande (cuando corresponde) */}
      {reveal && (
        <div className="mt-[2vh] flex shrink-0 items-center justify-center gap-[2.5vw] rounded-[1.6vh] bg-white/10 px-[2.5vw] py-[2vh] ring-[0.4vh] ring-accent">
          {reveal.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- carátula del CDN
            <img src={reveal.coverUrl} alt="" className="h-[18vh] w-[18vh] rounded-[1.2vh] shadow-2xl" />
          )}
          <div className="flex items-baseline gap-[2vw]">
            <p className="font-mono text-[16vh] font-black leading-none text-accent drop-shadow-lg">{reveal.year}</p>
            <div className="max-w-[34vw]">
              <p className="truncate text-[4.6vh] font-extrabold leading-tight">{reveal.title}</p>
              <p className="truncate text-[3vh] text-violet-200">{reveal.artist}</p>
              <RevealOutcome round={round!} turnTeam={turnTeam} challengerTeam={challengerTeam} state={state} />
            </div>
          </div>
        </div>
      )}

      {/* Líneas de tiempo de los equipos, lado a lado */}
      <div className="mt-[2vh] flex min-h-0 flex-1 gap-[2vh]">
        {state.teams.map((team) => (
          <TeamColumn
            key={team.id}
            team={team}
            isTurn={team.id === round?.teamId}
            isChallenger={team.id === round?.challengerId}
            target={state.config.targetCards}
          />
        ))}
      </div>
    </main>
  );
}

function StatusBanner({
  state,
  round,
  turnTeam,
  challengerTeam,
  secondsLeft,
}: {
  state: GameState;
  round: StateRound | null;
  turnTeam: StateTeam | null;
  challengerTeam: StateTeam | null;
  secondsLeft: number | null;
}) {
  if (state.status === "lobby") {
    return <Pill big text="Esperando que arranque la partida…" />;
  }
  if (state.status === "finished") {
    const winner = state.teams.find((t) => t.id === state.winnerTeamId);
    return <Pill big tone="win" text={`🏆 Ganó ${winner?.name ?? "—"}`} />;
  }
  if (!round || !turnTeam) return <Pill big text="…" />;

  const clock =
    secondsLeft != null ? (
      <span className="ml-[1vw] font-black text-accent">⏱ {secondsLeft}s</span>
    ) : null;

  let label: ReactNode;
  switch (round.phase) {
    case "playing":
      label = round.played ? (
        <>🤔 <b>{turnTeam.name}</b> ubica el año…</>
      ) : (
        <>🎧 Suena el tema · turno de <b>{turnTeam.name}</b></>
      );
      break;
    case "challenge":
      label = challengerTeam ? (
        <>⚡ <b>{challengerTeam.name}</b> desafía a {turnTeam.name} {clock}</>
      ) : (
        <>🛡 ¿Alguien desafía a <b>{turnTeam.name}</b>? {clock}</>
      );
      break;
    case "closing":
      label = <>⏳ <b>{turnTeam.name}</b> cierra el turno {clock}</>;
      break;
    case "reveal":
    case "resolved":
      label = <>✅ Reveal · turno de <b>{turnTeam.name}</b></>;
      break;
    default:
      label = <b>{turnTeam.name}</b>;
  }

  return (
    <div className="flex items-center gap-[1.5vw] rounded-[1.4vh] bg-brand px-[2vw] py-[1.4vh] text-[3.4vh] font-semibold shadow-lg ring-1 ring-white/15">
      <span>{label}</span>
    </div>
  );
}

function RevealOutcome({
  round,
  turnTeam,
  challengerTeam,
  state,
}: {
  round: StateRound;
  turnTeam: StateTeam | null;
  challengerTeam: StateTeam | null;
  state: GameState;
}) {
  const winner = round.cardWinnerId ? state.teams.find((t) => t.id === round.cardWinnerId) : null;
  return (
    <p className="mt-[1vh] text-[2.3vh]">
      {turnTeam?.name}:{" "}
      <b className={round.placedCorrect ? "text-teal" : "text-red-400"}>
        {round.placedCorrect ? "bien ✓" : "mal ✗"}
      </b>
      {challengerTeam && (
        <>
          {" · "}
          {challengerTeam.name}:{" "}
          <b className={round.challengeCorrect ? "text-teal" : "text-red-400"}>
            {round.challengeCorrect ? "bien ✓" : "mal ✗"}
          </b>
        </>
      )}
      {winner && <span className="ml-[1vw] font-bold text-teal">🃏 carta para {winner.name}</span>}
    </p>
  );
}

function TeamColumn({
  team,
  isTurn,
  isChallenger,
  target,
}: {
  team: StateTeam;
  isTurn: boolean;
  isChallenger: boolean;
  target: number;
}) {
  const cards = [...team.cards].sort((a, b) => a.position - b.position);
  const ring = isTurn ? "ring-[0.4vh] ring-accent" : isChallenger ? "ring-[0.3vh] ring-white/40" : "ring-1 ring-white/10";

  return (
    <section className={`flex min-w-0 flex-1 flex-col rounded-[1.4vh] bg-white/5 ${ring}`}>
      <header className="flex shrink-0 items-center justify-between gap-[1vw] rounded-t-[1.4vh] bg-white/10 px-[1.4vw] py-[1.2vh]">
        <span className="truncate text-[3.4vh] font-extrabold">{team.name}</span>
        <span className="flex shrink-0 items-center gap-[1vw] text-[2.6vh]">
          <span title="monedas">🪙 {team.tokens}</span>
          <span className="font-bold text-accent">{cards.length}/{target}</span>
        </span>
      </header>

      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 content-start gap-[0.8vh] overflow-hidden p-[1vh]">
        {cards.map((c) => (
          <div
            key={c.cardId}
            className="flex items-center gap-[0.8vw] rounded-[0.9vh] bg-white px-[0.9vw] py-[0.8vh] text-gray-800"
          >
            <span className="font-mono text-[3vh] font-black text-brand">{c.year}</span>
            <span className="truncate text-[2vh] text-gray-600">{c.title}</span>
          </div>
        ))}
        {cards.length === 0 && <p className="col-span-2 p-[2vh] text-[2.2vh] text-violet-300">Sin cartas…</p>}
      </div>
    </section>
  );
}

function Pill({ text, big, tone }: { text: string; big?: boolean; tone?: "win" }) {
  return (
    <div
      className={`rounded-[1.4vh] px-[2vw] py-[1.4vh] font-extrabold shadow-lg ${
        tone === "win" ? "bg-teal" : "bg-brand"
      } ${big ? "text-[4vh]" : "text-[3vh]"}`}
    >
      {text}
    </div>
  );
}
