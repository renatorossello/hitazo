"use client";

import { useEffect, useState } from "react";

/**
 * Segundos restantes hasta `startIso + limitSec` (deadline), actualizándose cada
 * ~0.5s. Sincronizado entre clientes porque el deadline sale del server (la fase y
 * su `phase_started_at`). Devuelve null si no aplica.
 */
export function useCountdown(startIso: string | null | undefined, limitSec: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sincroniza un reloj externo */
  useEffect(() => {
    if (!startIso || limitSec == null) {
      setRemaining(null);
      return;
    }
    const deadline = Date.parse(startIso) + limitSec * 1000;
    const calc = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setRemaining(calc());
    const id = setInterval(() => setRemaining(calc()), 500);
    return () => clearInterval(id);
  }, [startIso, limitSec]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return remaining;
}
