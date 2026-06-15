"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Logo from "./Logo";

export type LobbyTeam = { teamId: string; name: string; joinOrder: number; connected: boolean };
export type StartConfig = { targetCards: number; challengeWindowSec: number; closeTurnSec: number };

const TARGET_OPTIONS = [5, 7, 10, 12, 15];
const CHALLENGE_OPTIONS = [15, 20, 30, 45, 60];
const CLOSE_OPTIONS = [10, 15, 20, 30, 45];

/**
 * Lobby (presentacional). La suscripción/presencia las maneja BoardClient. Se muestra
 * en la pantalla del host: código + QR para que los jugadores se sumen.
 */
export default function Lobby({
  roomCode,
  teams,
  isHost,
  onStart,
  starting,
  startError,
}: {
  roomCode: string;
  teams: LobbyTeam[];
  isHost: boolean;
  onStart: (cfg: StartConfig) => void;
  starting: boolean;
  startError: string | null;
}) {
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [target, setTarget] = useState(10);
  const [challengeSec, setChallengeSec] = useState(30);
  const [closeSec, setCloseSec] = useState(20);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valor client-only (window.location)
    setJoinUrl(`${window.location.origin}/join?code=${roomCode}`);
  }, [roomCode]);

  return (
    <main className="flex min-h-full flex-1 flex-col items-center gap-8 bg-gradient-to-b from-brand-deep to-brand-dark p-6 text-white sm:p-10">
      <div className="flex items-center gap-3">
        <Logo className="text-3xl" />
        <span className="text-sm uppercase tracking-widest text-violet-300">Lobby</span>
      </div>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-14">
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-violet-300">Código de sala</p>
          <p className="font-mono text-7xl font-extrabold tracking-[0.15em] text-accent drop-shadow-lg sm:text-8xl">
            {roomCode}
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          {joinUrl ? (
            <>
              <div className="rounded-2xl bg-white p-3 shadow-xl">
                <QRCodeSVG value={joinUrl} size={190} />
              </div>
              <p className="text-xs text-violet-300">Escaneá para entrar</p>
            </>
          ) : (
            <div className="h-[214px] w-[214px] animate-pulse rounded-2xl bg-white/10" />
          )}
        </div>
      </div>

      <section className="w-full max-w-md">
        <h2 className="mb-2 text-sm uppercase tracking-widest text-violet-300">Equipos ({teams.length})</h2>
        {teams.length === 0 ? (
          <p className="rounded-2xl bg-white/5 px-4 py-6 text-center text-sm text-violet-300 ring-1 ring-white/10">
            Esperando equipos… escaneá el QR o entrá con el código.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {teams.map((t) => (
              <li
                key={t.teamId}
                className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10"
              >
                <span className="font-bold">{t.name}</span>
                <span className={`text-xs ${t.connected ? "text-teal" : "text-violet-300/60"}`}>
                  {t.connected ? "● conectado" : "○ ausente"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isHost && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-violet-200">
            <label className="flex items-center gap-2">
              Cartas para ganar:
              <select
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-white outline-none"
              >
                {TARGET_OPTIONS.map((n) => (
                  <option key={n} value={n} className="text-black">
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Desafío (s):
              <select
                value={challengeSec}
                onChange={(e) => setChallengeSec(Number(e.target.value))}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-white outline-none"
              >
                {CHALLENGE_OPTIONS.map((n) => (
                  <option key={n} value={n} className="text-black">
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Cierre turno (s):
              <select
                value={closeSec}
                onChange={(e) => setCloseSec(Number(e.target.value))}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-white outline-none"
              >
                {CLOSE_OPTIONS.map((n) => (
                  <option key={n} value={n} className="text-black">
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            onClick={() => onStart({ targetCards: target, challengeWindowSec: challengeSec, closeTurnSec: closeSec })}
            disabled={starting || teams.length < 2}
            className="rounded-2xl bg-accent px-10 py-4 text-lg font-bold text-brand-deep shadow-lg transition hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
          >
            {starting ? "Empezando…" : "Empezar partida"}
          </button>
          {teams.length < 2 && <p className="text-xs text-violet-300">Hacen falta al menos 2 equipos.</p>}
          {startError && <p className="text-xs text-red-300">{startError}</p>}
        </div>
      )}
    </main>
  );
}
