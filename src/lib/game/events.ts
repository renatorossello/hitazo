/**
 * Canal y eventos de Realtime (sección 6 del PRD). Un canal por sala: game:{room_code}.
 * En Fase 2 usamos broadcast `team_joined` + presence para el lobby. Los eventos del
 * loop de juego (turn_started, reveal, etc.) se agregan en la Fase 3.
 */

export function gameChannel(roomCode: string): string {
  return `game:${roomCode}`;
}

// Lo que cada equipo publica por presence mientras está conectado al lobby/partida.
export type TeamPresence = {
  teamId: string;
  name: string;
  joinOrder: number;
};

// Eventos de broadcast (emisor → efecto). Se irá ampliando por fase.
export const GameEvent = {
  TeamJoined: "team_joined",
  // El estado de la partida cambió en Postgres: cada cliente re-lee /state.
  // (DB = fuente de verdad; el broadcast solo avisa "cambió algo".)
  StateChanged: "state_changed",
} as const;

export type TeamJoinedPayload = {
  teamId: string;
  name: string;
  joinOrder: number;
};
