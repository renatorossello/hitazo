"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { gameChannel, type TeamPresence } from "@/lib/game/events";

type LobbyTeam = { teamId: string; name: string; joinOrder: number };

export default function Lobby({
  roomCode,
  status,
  isHost,
  initialTeams,
}: {
  roomCode: string;
  status: string;
  isHost: boolean;
  initialTeams: LobbyTeam[];
}) {
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [present, setPresent] = useState<Record<string, TeamPresence>>({});

  // La URL del QR depende del origin (en prod hitazo.rossello.com.ar, en dev 127.0.0.1),
  // que solo existe en el cliente: se setea tras el mount (evita mismatch de hidratación).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- valor client-only (window.location)
    setJoinUrl(`${window.location.origin}/join?code=${roomCode}`);
  }, [roomCode]);

  // Realtime: el board observa la presencia de los equipos conectados.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const channel = supabase.channel(gameChannel(roomCode), {
      config: { presence: { key: "board" } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<TeamPresence>();
        const next: Record<string, TeamPresence> = {};
        for (const entries of Object.values(state)) {
          for (const e of entries) {
            if (e.teamId) next[e.teamId] = e;
          }
        }
        setPresent(next);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  // Unión: equipos persistidos (DB) + presencia viva. `connected` = está en presencia.
  const teams = useMemo(() => {
    const byId = new Map<string, LobbyTeam & { connected: boolean }>();
    for (const t of initialTeams) byId.set(t.teamId, { ...t, connected: false });
    for (const p of Object.values(present)) {
      byId.set(p.teamId, {
        teamId: p.teamId,
        name: p.name,
        joinOrder: p.joinOrder,
        connected: true,
      });
    }
    return [...byId.values()].sort((a, b) => a.joinOrder - b.joinOrder);
  }, [initialTeams, present]);

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
        <h2 className="mb-2 text-sm uppercase tracking-widest text-gray-400">
          Equipos ({teams.length})
        </h2>
        {teams.length === 0 ? (
          <p className="rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
            Esperando equipos… escaneá el QR o entrá a /join con el código.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {teams.map((t) => (
              <li
                key={t.teamId}
                className="flex items-center justify-between rounded-md border px-4 py-3"
              >
                <span className="font-semibold">{t.name}</span>
                <span
                  className={`text-xs ${t.connected ? "text-green-600" : "text-gray-400"}`}
                  title={t.connected ? "Conectado" : "Desconectado"}
                >
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
            disabled
            className="cursor-not-allowed rounded-full bg-black px-8 py-3 font-semibold text-white opacity-40"
            title="La lógica de juego llega en la Fase 3"
          >
            Empezar partida
          </button>
          <p className="text-xs text-gray-400">
            {status === "lobby"
              ? "Se activa en la Fase 3 (loop de juego)."
              : `Estado: ${status}`}
          </p>
        </div>
      )}
    </main>
  );
}
