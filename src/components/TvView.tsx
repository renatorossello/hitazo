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
 * Otro cliente más del juego (no espeja el celular del host). Cada equipo es una FILA
 * con su línea de tiempo HORIZONTAL (viejas izq → nuevas der), estilo modo host, así
 * entran muchas cartas. Sobre la línea del turno se marcan el hueco donde ubicó y donde
 * desafía el otro. Arriba: etapa + cuenta regresiva. Reveal horizontal y compacto.
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
        <Logo className="self-center text-[3.4vh]" />
        <div className="flex flex-1 items-center justify-center">
          <StatusBanner state={state} round={round} turnTeam={turnTeam} challengerTeam={challengerTeam} secondsLeft={secondsLeft} />
        </div>
        <div className="flex items-center gap-[1vw] rounded-[1.2vh] bg-white/10 px-[1.2vw] py-[0.9vh] ring-1 ring-white/15">
          <div className="text-right">
            <p className="text-[1.4vh] uppercase tracking-widest text-violet-200">Sumate</p>
            <p className="font-mono text-[3.2vh] font-extrabold leading-none tracking-[0.1em] text-accent">{state.roomCode}</p>
          </div>
          {joinUrl && (
            <div className="rounded-[0.7vh] bg-white p-[0.4vh]">
              <QRCodeSVG value={joinUrl} size={52} />
            </div>
          )}
        </div>
      </header>

      {/* Reveal horizontal y compacto (sin leyenda "Reveal") */}
      {reveal && (
        <div className="mt-[1.2vh] flex shrink-0 items-center gap-[2vw] rounded-[1.2vh] bg-white/10 px-[2vw] py-[1vh] ring-[0.3vh] ring-accent">
          {reveal.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- carátula del CDN
            <img src={reveal.coverUrl} alt="" className="h-[11vh] w-[11vh] shrink-0 rounded-[0.9vh] shadow-xl" />
          )}
          <p className="shrink-0 font-mono text-[10vh] font-black leading-none text-accent drop-shadow-lg">{reveal.year}</p>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[3.8vh] font-extrabold leading-tight">{reveal.title}</p>
            <p className="truncate text-[2.4vh] text-violet-200">{reveal.artist}</p>
          </div>
          <div className="shrink-0 text-right">
            <RevealOutcome round={round!} turnTeam={turnTeam} challengerTeam={challengerTeam} state={state} />
          </div>
        </div>
      )}

      {/* Equipos como FILAS con línea de tiempo horizontal */}
      <div className="mt-[1.2vh] flex min-h-0 flex-1 flex-col gap-[1.2vh]">
        {state.teams.map((team) => {
          const isTurn = team.id === round?.teamId;
          return (
            <TeamRow
              key={team.id}
              team={team}
              target={state.config.targetCards}
              isTurn={isTurn}
              isChallenger={team.id === round?.challengerId}
              placedPos={isTurn && showMarks ? round!.placedPosition : null}
              challengePos={isTurn && showMarks ? round!.challengePosition : null}
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
      label = <>✅ <b>{turnTeam.name}</b> · ¿adivinó?</>;
  }

  return (
    <div className={`flex items-center rounded-[1.2vh] px-[2vw] py-[1.1vh] text-[3.2vh] font-semibold shadow-lg ring-1 ring-white/15 ${tone === "challenge" ? "bg-accent text-brand-deep" : "bg-brand"}`}>
      <span>{label}</span>
    </div>
  );
}

function RevealOutcome({ round, turnTeam, challengerTeam, state }: { round: StateRound; turnTeam: StateTeam | null; challengerTeam: StateTeam | null; state: GameState }) {
  const winner = round.cardWinnerId ? state.teams.find((t) => t.id === round.cardWinnerId) : null;
  return (
    <div className="text-[2.2vh] leading-tight">
      <p>{turnTeam?.name}: <b className={round.placedCorrect ? "text-teal" : "text-red-400"}>{round.placedCorrect ? "bien ✓" : "mal ✗"}</b></p>
      {challengerTeam && (
        <p>{challengerTeam.name}: <b className={round.challengeCorrect ? "text-teal" : "text-red-400"}>{round.challengeCorrect ? "bien ✓" : "mal ✗"}</b></p>
      )}
      {winner && <p className="font-bold text-teal">🃏 carta para {winner.name}</p>}
    </div>
  );
}

function TeamRow({
  team, target, isTurn, isChallenger, placedPos, challengePos,
}: {
  team: StateTeam; target: number; isTurn: boolean; isChallenger: boolean; placedPos: number | null; challengePos: number | null;
}) {
  const cards = [...team.cards].sort((a, b) => a.position - b.position);
  const ring = isTurn ? "ring-[0.35vh] ring-accent" : isChallenger ? "ring-[0.25vh] ring-white/40" : "ring-1 ring-white/10";

  const gap = (i: number) => {
    const t = placedPos === i;
    const c = challengePos === i;
    return (
      <div key={`g${i}`} className="flex w-[2.4vw] shrink-0 flex-col items-center justify-end gap-[0.4vh]">
        {(t || c) && (
          <span className={`whitespace-nowrap rounded px-[0.4vw] py-[0.1vh] text-[1.5vh] font-extrabold leading-tight ${t ? "bg-brand text-white" : "bg-accent text-brand-deep"}`}>
            {t ? "turno" : "desafío"}
          </span>
        )}
        <div className={`w-[0.4vw] flex-1 rounded ${t || c ? "bg-accent" : "bg-white/15"}`} />
      </div>
    );
  };

  return (
    <section className={`flex min-h-0 flex-1 flex-col rounded-[1.2vh] bg-white/5 px-[1.2vw] py-[1vh] ${ring}`}>
      <div className="mb-[0.7vh] flex shrink-0 items-center justify-between">
        <span className="flex items-center gap-[0.7vw] truncate text-[3vh] font-extrabold">
          {isTurn && <span className="rounded bg-accent px-[0.6vw] py-[0.1vh] text-[1.7vh] font-bold text-brand-deep">turno</span>}
          {team.name}
        </span>
        <span className="shrink-0 text-[2.4vh] font-semibold text-violet-100">🪙 {team.tokens} · {team.cards.length}/{target}</span>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch">
        {gap(0)}
        {cards.map((c, i) => (
          <div key={c.cardId} className="flex min-w-0 flex-1 items-stretch">
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-[0.7vh] bg-white px-[0.3vw] py-[0.5vh] text-gray-800">
              <span className="font-mono text-[2.7vh] font-black leading-none text-brand">{c.year}</span>
              <span className="mt-[0.3vh] w-full truncate text-center text-[1.5vh] text-gray-500">{c.title}</span>
            </div>
            {gap(i + 1)}
          </div>
        ))}
        {cards.length === 0 && <p className="self-center pl-[1vw] text-[2vh] text-violet-300">Sin cartas…</p>}
      </div>
    </section>
  );
}

function Pill({ text, tone }: { text: string; tone?: "win" }) {
  return <div className={`rounded-[1.2vh] px-[2vw] py-[1.1vh] text-[3.2vh] font-extrabold shadow-lg ${tone === "win" ? "bg-teal" : "bg-brand"}`}>{text}</div>;
}
