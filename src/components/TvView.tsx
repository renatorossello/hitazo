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
 * Vista para TELE. Robusta para navegadores de smart TV (Samsung/Tizen) que NO
 * respetan el viewport: en vez de depender de vw/vh, dibujamos un "escenario" FIJO
 * de 1280×720 con medidas en px y lo escalamos con transform al tamaño real de la
 * pantalla (lo que hacen las apps de TV). Así siempre queda apaisado y nítido.
 */
const W = 1280;
const H = 720;

function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#190a36" }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: W,
          height: H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

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
      <Stage>
        <div className="flex h-full w-full items-center justify-center text-3xl text-violet-300">Cargando…</div>
      </Stage>
    );
  }

  const turnTeam = state.teams.find((t) => t.id === round?.teamId) ?? null;
  const challengerTeam = state.teams.find((t) => t.id === round?.challengerId) ?? null;
  const reveal = round?.phase === "reveal" || round?.phase === "resolved" ? round?.reveal : null;
  const showMarks = !!round && ["challenge", "closing", "reveal", "resolved"].includes(round.phase);

  return (
    <Stage>
      <div className="flex h-full w-full flex-col bg-gradient-to-br from-brand-deep via-brand-dark to-brand p-4 text-white">
        {/* Barra superior */}
        <header className="flex shrink-0 items-stretch gap-3">
          <Logo className="self-center text-3xl" />
          <div className="flex flex-1 items-center justify-center">
            <StatusBanner state={state} round={round} turnTeam={turnTeam} challengerTeam={challengerTeam} secondsLeft={secondsLeft} />
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2 ring-1 ring-white/15">
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest text-violet-200">Sumate</p>
              <p className="font-mono text-3xl font-extrabold leading-none tracking-wider text-accent">{state.roomCode}</p>
            </div>
            {joinUrl && (
              <div className="rounded bg-white p-1">
                <QRCodeSVG value={joinUrl} size={56} />
              </div>
            )}
          </div>
        </header>

        {/* Reveal horizontal compacto */}
        {reveal && (
          <div className="mt-3 flex shrink-0 items-center gap-6 rounded-xl bg-white/10 px-6 py-2 ring-4 ring-accent">
            {reveal.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- carátula del CDN
              <img src={reveal.coverUrl} alt="" className="h-[88px] w-[88px] shrink-0 rounded-lg shadow-xl" />
            )}
            <p className="shrink-0 font-mono text-[80px] font-black leading-none text-accent drop-shadow-lg">{reveal.year}</p>
            <div className="min-w-0 flex-1">
              <p className="truncate text-4xl font-extrabold leading-tight">{reveal.title}</p>
              <p className="truncate text-xl text-violet-200">{reveal.artist}</p>
            </div>
            <div className="shrink-0 text-right">
              <RevealOutcome round={round!} turnTeam={turnTeam} challengerTeam={challengerTeam} state={state} />
            </div>
          </div>
        )}

        {/* Equipos como filas con timeline horizontal */}
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
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
      </div>
    </Stage>
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

  const clock = secondsLeft != null ? <span className="ml-3 font-black text-accent">⏱ {secondsLeft}s</span> : null;

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
    <div className={`flex items-center rounded-xl px-6 py-2 text-3xl font-semibold shadow-lg ring-1 ring-white/15 ${tone === "challenge" ? "bg-accent text-brand-deep" : "bg-brand"}`}>
      <span>{label}</span>
    </div>
  );
}

function RevealOutcome({ round, turnTeam, challengerTeam, state }: { round: StateRound; turnTeam: StateTeam | null; challengerTeam: StateTeam | null; state: GameState }) {
  const winner = round.cardWinnerId ? state.teams.find((t) => t.id === round.cardWinnerId) : null;
  return (
    <div className="text-[28px] leading-snug">
      <p>{turnTeam?.name}: <b className={round.placedCorrect ? "text-teal" : "text-red-400"}>{round.placedCorrect ? "bien ✓" : "mal ✗"}</b></p>
      {challengerTeam && (
        <p>{challengerTeam.name}: <b className={round.challengeCorrect ? "text-teal" : "text-red-400"}>{round.challengeCorrect ? "bien ✓" : "mal ✗"}</b></p>
      )}
      {winner && <p className="text-2xl font-bold text-teal">🃏 carta para {winner.name}</p>}
    </div>
  );
}

function TeamRow({
  team, target, isTurn, isChallenger, placedPos, challengePos,
}: {
  team: StateTeam; target: number; isTurn: boolean; isChallenger: boolean; placedPos: number | null; challengePos: number | null;
}) {
  const cards = [...team.cards].sort((a, b) => a.position - b.position);
  const ring = isTurn ? "ring-4 ring-accent" : isChallenger ? "ring-2 ring-white/40" : "ring-1 ring-white/10";

  const gap = (i: number) => {
    const t = placedPos === i;
    const c = challengePos === i;
    return (
      <div key={`g${i}`} className="flex w-7 shrink-0 flex-col items-center justify-end gap-1">
        {(t || c) && (
          <span className={`whitespace-nowrap rounded px-1 py-0.5 text-[13px] font-extrabold leading-tight ${t ? "bg-brand text-white" : "bg-accent text-brand-deep"}`}>
            {t ? "turno" : "desafío"}
          </span>
        )}
        <div className={`w-1.5 flex-1 rounded ${t || c ? "bg-accent" : "bg-white/15"}`} />
      </div>
    );
  };

  return (
    <section className={`flex min-h-0 flex-1 flex-col rounded-xl bg-white/5 px-4 py-2 ${ring}`}>
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <span className="flex items-center gap-2 truncate text-2xl font-extrabold">
          {isTurn && <span className="rounded bg-accent px-2 py-0.5 text-sm font-bold text-brand-deep">turno</span>}
          {team.name}
        </span>
        <span className="shrink-0 text-xl font-semibold text-violet-100">🪙 {team.tokens} · {team.cards.length}/{target}</span>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch">
        {gap(0)}
        {cards.map((c, i) => (
          <div key={c.cardId} className="flex min-w-0 flex-1 items-stretch">
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg bg-white px-1.5 py-1 text-gray-800">
              <span className="font-mono text-2xl font-black leading-none text-brand">{c.year}</span>
              <span className="line-clamp-3 w-full text-center text-base font-medium leading-tight text-gray-600">{c.title}</span>
            </div>
            {gap(i + 1)}
          </div>
        ))}
        {cards.length === 0 && <p className="self-center pl-3 text-xl text-violet-300">Sin cartas…</p>}
      </div>
    </section>
  );
}

function Pill({ text, tone }: { text: string; tone?: "win" }) {
  return <div className={`rounded-xl px-6 py-2 text-3xl font-extrabold shadow-lg ${tone === "win" ? "bg-teal" : "bg-brand"}`}>{text}</div>;
}
