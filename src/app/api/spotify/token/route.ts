import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/spotify/auth";

/**
 * GET /api/spotify/token
 * Le entrega al board un access_token fresco del host para el Web Playback SDK
 * (callback getOAuthToken). Refresca server-side si está por vencer y persiste los
 * tokens nuevos sobre esta respuesta. Responde 401 si no hay sesión.
 */
export async function GET(req: NextRequest) {
  const { token, applyCookies } = await getValidAccessToken(req);

  if (!token) {
    const res = NextResponse.json({ error: "no_session" }, { status: 401 });
    applyCookies(res); // limpia cookies si el refresh estaba revocado
    return res;
  }

  const res = NextResponse.json({ access_token: token });
  applyCookies(res);
  return res;
}
