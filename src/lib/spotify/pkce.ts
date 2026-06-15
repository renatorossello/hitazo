/**
 * Helpers PKCE para el OAuth Authorization Code + PKCE del host.
 * Corren server-side (route handlers). Usan Web Crypto (Node 18+/Edge).
 */

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** code_verifier: string aleatorio (43-128 chars, base64url). */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** code_challenge = base64url(SHA-256(code_verifier)). */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/** state anti-CSRF para el round-trip de OAuth. */
export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}
