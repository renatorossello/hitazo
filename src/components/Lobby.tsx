"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export type LobbyTeam = { teamId: string; name: string; joinOrder: number; connected: boolean };

/**
 * Vista de lobby (presentacional). La suscripción al canal y el merge de presencia
 * los maneja BoardClient; acá solo mostramos código + QR + equipos + "Empezar".
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
  onStart: () => void;
  starting: boolean;
  startError: string | null;
}) {
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valor client-only (window.location)
    setJoinUrl(`${window.location.origin}/join?code=${roomCode}`);
  }, [roomCode]);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <h1 className="text-2xl font-semibold text-gray-500">Hitazo · Lobby</h1>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-12">
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-gray-400">Código de sala</p>
          <p className="font-mono text-7xl font-bold tracking-[0.2em]">{roomCode}</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          {joinUrl ? (
            <>
              <div className="rounded-xl bg-white p-3 shadow">
                <QRCodeSVG value={joinUrl} size={180} />
              </div>
              <p className="max-w-[200px] break-all text-center text-xs text-gray-400">{joinUrl}</p>
            </>
          ) : (
            <div className="h-[206px] w-[206px] animate-pulse rounded-xl bg-gray-100" />
          )}
        </div>
      </div>

      <section className="w-full max-w-md">
        <h2 className="mb-2 text-sm uppercase tracking-widest text-gray-400">Equipos ({teams.length})</h2>
        {teams.length === 0 ? (
          <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
            Esperando equipos… escaneá el QR o entrá a /join con el código.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {teams.map((t) => (
              <li key={t.teamId} className="flex items-center justify-between rounded-md border px-4 py-3">
                <span className="font-semibold">{t.name}</span>
                <span className={`text-xs ${t.connected ? "text-green-600" : "text-gray-400"}`}>
                  {t.connected ? "● conectado" : "○ ausente"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isHost && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onStart}
            disabled={starting || teams.length < 2}
            className="rounded-full bg-black px-8 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {starting ? "Empezando…" : "Empezar partida"}
          </button>
          {teams.length < 2 && <p className="text-xs text-gray-400">Hacen falta al menos 2 equipos.</p>}
          {startError && <p className="text-xs text-red-600">{startError}</p>}
        </div>
      )}
    </main>
  );
}
