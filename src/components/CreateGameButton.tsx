"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Botón del host: crea una partida y lleva al board (lobby con código + QR).
 * mode 'sdk' = host con Spotify (audio por el SDK). mode 'manual' = host sin API:
 * reproduce en su propio Spotify vía deep link (no necesita estar en la allowlist).
 */
export default function CreateGameButton({
  mode = "sdk",
  label,
  className = "rounded-full bg-black px-6 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50",
}: {
  mode?: "sdk" | "manual";
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGame() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/games/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (res.status === 401) {
        setError("Tu sesión de Spotify venció. Reconectate.");
        return;
      }
      if (!res.ok) {
        setError("No se pudo crear la partida. Probá de nuevo.");
        return;
      }
      const { roomCode } = (await res.json()) as { roomCode: string };
      router.push(`/board/${roomCode}`);
    } catch {
      setError("Error de red al crear la partida.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button onClick={createGame} disabled={loading} className={className}>
        {loading ? "Creando…" : label ?? "Crear partida"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
