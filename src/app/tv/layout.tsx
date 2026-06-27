import type { Viewport } from "next";

/**
 * Los navegadores de smart TV (Tizen/Samsung, webOS, etc.) suelen NO respetar
 * `width=device-width` y arman un viewport angosto → la vista se ve apilada y chica.
 * Forzamos un viewport ancho fijo (1280) para que el TV maquete apaisado y escale a
 * la pantalla. Aplica a /tv y /tv/[roomCode]. Los navegadores de escritorio lo ignoran.
 */
// width sin initialScale: el TV escala los 1280 px para LLENAR la pantalla.
export const viewport: Viewport = {
  width: 1280,
};

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
