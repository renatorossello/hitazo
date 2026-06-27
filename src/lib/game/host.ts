import { cookies } from "next/headers";
import { isHostAuthenticated } from "@/lib/spotify/auth";

/**
 * Autoridad del host/board, desacoplada de Spotify.
 *
 * Una partida puede comandarse de dos formas:
 *  - modo SDK: el host está logueado con Spotify (isHostAuthenticated).
 *  - modo manual (sin API): el host NO tiene Spotify, pero tiene el host_token de la
 *    partida en una cookie httpOnly (seteada al crearla). Sirve para que alguien con
 *    Premium pero sin estar en la allowlist del Dev Mode pueda ser host.
 */
export const HOST_COOKIE = "ct_host";

export function hostCookieOptions(maxAgeSec = 60 * 60 * 24 * 30) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}

/** ¿Quien hace el request es el host/board de ESTA partida? */
export async function isGameHost(hostToken: string | null | undefined): Promise<boolean> {
  if (await isHostAuthenticated()) return true; // modo SDK
  if (!hostToken) return false;
  const jar = await cookies();
  return jar.get(HOST_COOKIE)?.value === hostToken; // modo manual
}
