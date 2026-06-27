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
 * Otro cliente más del juego (no espeja el celular del host). Muestra etapa, cuenta
 * regresiva, líneas de tiempo de los equipos (una columna c/u, viejas arriba), y sobre
 * la línea del equipo en turno los marcadores de dónde ubicó y dónde desafían.
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
  const showMarks = !!round && ["challenge", "closing", "reveal", "resolved"].includes(round.phase);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-gradient-to-br from-brand-deep via-brand-dark to-brand p-[2vh] text-white">
      {/* Barra superior: ESTADO del juego + código/QR para sumarse */}
      <header className="flex shrink-0 items-stretch gap-[1.5vh]">
        <Logo className="self-center text-[3.6vh]" />
        <div className="flex flex-1 items-center justify-center">
          <StatusBanner state={state} round={round} turnTeam={turnTeam} challengerTeam={challengerTeam} secondsLeft={secondsLeft} />
        </div>
        <div className="flex items-center gap-[1vw] rounded-[1.2vh] bg-white/10 px-[1.2vw] py-[1vh] ring-1 ring-white/15">
          <div className="text-right">
            <p className="text-[1.5vh] uppercase tracking-widest text-violet-200">Sumate</p>
            <p className="font-mono text-[3.4vh] font-extrabold leading-none tracking-[0.1em] text-accent">{state.roomCode}</p>
          </div>
          {joinUrl && (
            <div className="rounded-[0.7vh] bg-white p-[0.4vh]">
              <QRCodeSVG value={joinUrl} size={56} />
            </div>
          )}
        </div>
      </header>

      {/* Reveal en grande */}
      {reveal && (
        <div className="mt-[1.5vh] flex shrink-0 items-center justify-center gap-[2.5vw] rounded-[1.4vh] bg-white/10 px-[2.5vw] py-[1.6vh] ring-[0.35vh] ring-accent">
          {reveal.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- carátula del CDN
            <img src={reveal.coverUrl} alt="" className="h-[15vh] w-[15vh] rounded-[1vh] shadow-2xl" />
          )}
          <div className="flex items-baseline gap-[1.8vw]">
            <p className="font-mono text-[13vh] font-black leading-none text-accent drop-shadow-lg">{reveal.year}</p>
            <div className="max-w-[34vw]">
              <p className="truncate text-[4vh] font-extrabold leading-tight">{reveal.title}</p>
              <p className="truncate text-[2.6vh] text-violet-200">{reveal.artist}</p>
              <RevealOutcome round={round!} turnTeam={turnTeam} challengerTeam={challengerTeam} state={state} />
            </div>
          </div>
        </div>
      )}

      {/* Líneas de tiempo, una columna por equipo */}
      <div className="mt-[1.5vh] flex min-h-0 flex-1 gap-[1.5vh]">
        {state.teams.map((team) => {
          const isTurn = team.id === round?.teamId;
          return (
            <TimelineColumn
              key={team.id}
              team={team}
              target={state.config.targetCards}
              isTurn={isTurn}
              isChallenger={team.id === round?.challengerId}
              placedPos={isTurn && showMarks ? round!.placedPosition : null}
              challengePos={isTurn && showMarks ? round!.challengePosition : null}
              turnName={turnTeam?.name ?? ""}
              challengerName={challengerTeam?.name ?? ""}
            />
          );
        })}
      </div>
    </main>
  );
}

function StatusBanner({
  state, round, turnTeam, challengerTeam, secondsLeft,
}: {
  state: GameState; round: StateRound | null; turnTeam: StateTeam | null; challengerTeam: StateTeam | null; secondsLeft: number | null;
}) {
  if (state.status === "lobby") return <Pill text="Esperando que arranque la partida…" />;
  if (state.status === "finished") {
    const winner = state.teams.find((t) => t.id === state.winnerTeamId);
    return <Pill tone="win" text={`🏆 Ganó ${winner?.name ?? "—"}`} />;
  }
  if (!round || !turnTeam) return <Pill text="…" />;

  const clock = secondsLeft != null ? <span className="ml-[1vw] font-black text-accent">⏱ {secondsLeft}s</span> : null;

  let label: ReactNode;
  let tone: "turn" | "challenge" = "turn";
  switch (round.phase) {
    case "playing":
      label = round.played ? <>🤔 <b>{turnTeam.name}</b> ubica el año…</> : <>🎧 Suena el tema · turno de <b>{turnTeam.name}</b></>;
      break;
    case "challenge":
      tone = "challenge";
      label = challengerTeam ? <>⚡ <b>{challengerTeam.name}</b> DESAFÍA a {turnTeam.name} {clock}</> : <>🛡 ¿Alguien desafía a <b>{turnTeam.name}</b>? {clock}</>;
      break;
    case "closing":
      label = <>⏳ <b>{turnTeam.name}</b> cierra el turno {clock}</>;
      break;
    default:
      label = <>✅ Reveal · turno de <b>{turnTeam.name}</b></>;
  }

  return (
    <div className={`flex items-center rounded-[1.2vh] px-[2vw] py-[1.2vh] text-[3.2vh] font-semibold shadow-lg ring-1 ring-white/15 ${tone === "challenge" ? "bg-accent text-brand-deep" : "bg-brand"}`}>
      <span>{label}</span>
    </div>
  );
}

function RevealOutcome({ round, turnTeam, challengerTeam, state }: { round: StateRound; turnTeam: StateTeam | null; challengerTeam: StateTeam | null; state: GameState }) {
  const winner = round.cardWinnerId ? state.teams.find((t) => t.id === round.cardWinnerId) : null;
  return (
    <p className="mt-[0.8vh] text-[2.2vh]">
      {turnTeam?.name}: <b className={round.placedCorrect ? "text-teal" : "text-red-400"}>{round.placedCorrect ? "bien ✓" : "mal ✗"}</b>
      {challengerTeam && (
        <>{" · "}{challengerTeam.name}: <b className={round.challengeCorrect ? "text-teal" : "text-red-400"}>{round.challengeCorrect ? "bien ✓" : "mal ✗"}</b></>
      )}
      {winner && <span className="ml-[1vw] font-bold text-teal">🃏 carta para {winner.name}</span>}
    </p>
  );
}

function TimelineColumn({
  team, target, isTurn, isChallenger, placedPos, challengePos, turnName, challengerName,
}: {
  team: StateTeam; target: number; isTurn: boolean; isChallenger: boolean;
  placedPos: number | null; challengePos: number | null; turnName: string; challengerName: string;
}) {
  const cards = [...team.cards].sort((a, b) => a.position - b.position);
  const ring = isTurn ? "ring-[0.4vh] ring-accent" : isChallenger ? "ring-[0.3vh] ring-white/40" : "ring-1 ring-white/10";

  // Marcador en el hueco i (sobre la línea del equipo en turno).
  const gapMarker = (i: number): ReactNode => {
    const here: ReactNode[] = [];
    if (placedPos === i) here.push(<Marker key="t" tone="turn" text={`⬆ ${turnName} ubicó acá`} />);
    if (challengePos === i) here.push(<Marker key="c" tone="challenge" text={`⚡ ${challengerName} desafía acá`} />);
    if (!here.length) return null;
    return <div className="flex flex-col gap-[0.5vh] py-[0.3vh]">{here}</div>;
  };

  return (
    <section className={`flex min-w-0 flex-1 flex-col rounded-[1.2vh] bg-white/5 ${ring}`}>
      <header className="flex shrink-0 items-center justify-between gap-[1vw] rounded-t-[1.2vh] bg-white/10 px-[1.2vw] py-[1vh]">
        <span className="flex items-center gap-[0.6vw] truncate text-[3.2vh] font-extrabold">
          {isTurn && <span className="text-accent">▶</span>}
          {team.name}
        </span>
        <span className="flex shrink-0 items-center gap-[0.9vw] text-[2.4vh]">
          <span className="rounded-full bg-accent/20 px-[0.7vw] py-[0.2vh] font-bold text-accent">🪙 {team.tokens}</span>
          <span className="font-bold">{cards.length}/{target}</span>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-[0.5vh] overflow-hidden p-[0.9vh]">
        <p className="shrink-0 text-center text-[1.5vh] uppercase tracking-widest text-violet-300/80">↑ más viejas · más nuevas ↓</p>
        {gapMarker(0)}
        {cards.map((c, i) => (
          <div key={c.cardId}>
            <div className="flex items-center gap-[0.9vw] rounded-[0.8vh] bg-white px-[0.9vw] py-[0.55vh] text-gray-800">
              <span className="w-[7vw] shrink-0 font-mono text-[2.8vh] font-black text-brand">{c.year}</span>
              <span className="truncate text-[2vh] text-gray-600">{c.title}</span>
            </div>
            {gapMarker(i + 1)}
          </div>
        ))}
        {cards.length === 0 && <p className="p-[1.5vh] text-[2vh] text-violet-300">Sin cartas…</p>}
      </div>
    </section>
  );
}

function Marker({ text, tone }: { text: string; tone: "turn" | "challenge" }) {
  return (
    <div className={`rounded-[0.8vh] px-[0.9vw] py-[0.5vh] text-center text-[2vh] font-extrabold ${tone === "turn" ? "bg-brand text-white" : "bg-accent text-brand-deep"}`}>
      {text}
    </div>
  );
}

function Pill({ text, tone }: { text: string; tone?: "win" }) {
  return <div className={`rounded-[1.2vh] px-[2vw] py-[1.2vh] text-[3.4vh] font-extrabold shadow-lg ${tone === "win" ? "bg-teal" : "bg-brand"}`}>{text}</div>;
}
