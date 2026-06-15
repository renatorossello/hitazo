import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy (antes "middleware" — Next 16 renombró la convención a proxy.ts).
 *
 * Forzamos 127.0.0.1 en vez de localhost en dev. Spotify exige 127.0.0.1 (loopback
 * IP) para el redirect http, y mezclar ambos hosts parte las cookies de sesión.
 *
 * Nos basamos en el header `Host` (refleja el host REAL del browser), NO en
 * `nextUrl.hostname` (en dev el server lo reporta como localhost internamente y
 * genera un loop de redirects → ERR_TOO_MANY_REDIRECTS).
 */
export function proxy(req: NextRequest) {
  // Solo en dev: en prod (detrás del proxy de Railway) NO reescribimos el host.
  if (process.env.NODE_ENV !== "development") return NextResponse.next();
  const host = req.headers.get("host") ?? "";
  if (host.startsWith("localhost")) {
    const url = new URL(req.url);
    url.host = host.replace("localhost", "127.0.0.1"); // preserva el puerto
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
