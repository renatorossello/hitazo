import type { Viewport } from "next";

/**
 * La vista TV NO depende del viewport: dibuja un escenario fijo 1280×720 y lo escala
 * con transform por JS al tamaño real (ver TvView). Por eso dejamos el viewport
 * natural — los TV que ignoran/malinterpretan el viewport igual se ven bien, porque
 * el escalado lo controla el JS leyendo window.innerWidth/innerHeight.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
