/**
 * Identidad del player en el celular (sin login, según el PRD). Se guarda en
 * localStorage por sala para sobrevivir refresh y reconexión.
 */
export type StoredPlayer = {
  teamId: string;
  name: string;
  joinOrder: number;
};

export function playerStorageKey(roomCode: string): string {
  return `hitazo_player_${roomCode.toUpperCase()}`;
}

export function loadPlayer(roomCode: string): StoredPlayer | null {
  try {
    const raw = localStorage.getItem(playerStorageKey(roomCode));
    return raw ? (JSON.parse(raw) as StoredPlayer) : null;
  } catch {
    return null;
  }
}
