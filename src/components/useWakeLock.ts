"use client";

import { useEffect } from "react";

type Sentinel = { release: () => Promise<void> };

/**
 * Mantiene la pantalla activa mientras la página está visible (Screen Wake Lock API,
 * iOS 16.4+). Evita que el celu se duerma en medio de la partida. Se re-adquiere al
 * volver a primer plano (el lock se libera solo al bloquear/cambiar de app).
 */
export function useWakeLock() {
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
    };
    if (!nav.wakeLock) return;

    let sentinel: Sentinel | null = null;
    let active = true;

    const acquire = async () => {
      if (!active || document.visibilityState !== "visible") return;
      try {
        sentinel = await nav.wakeLock!.request("screen");
      } catch {
        // puede fallar (batería baja, permisos) — lo ignoramos
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
    };
  }, []);
}
