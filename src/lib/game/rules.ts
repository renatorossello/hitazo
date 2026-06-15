/**
 * Motor de reglas de Hitazo (sección 5 del PRD). Lógica pura, sin DB ni red:
 * se testea sola y la consumen las rutas server-side que arbitran la partida.
 */

/**
 * ¿La carta cae en el hueco elegido?
 *
 * @param sortedYears años de la línea de tiempo del equipo, ORDENADOS ascendente.
 * @param position    índice del hueco: 0 = antes del más antiguo, n = después del más nuevo.
 * @param year        año original de la carta a ubicar.
 *
 * Reglas (PRD):
 *  - Hueco i correcto si el año cae entre sus vecinos (límites inclusivos).
 *  - Empate de año con un vecino → ambos huecos adyacentes a ese año son válidos
 *    (lo da naturalmente la inclusividad en los dos lados).
 *  - Extremos: antes del más antiguo → correcto si año ≤ min; después del más nuevo
 *    → correcto si año ≥ max.
 */
export function isPlacementCorrect(
  sortedYears: number[],
  position: number,
  year: number
): boolean {
  const n = sortedYears.length;
  if (position < 0 || position > n) return false;
  const okLeft = position === 0 || year >= sortedYears[position - 1];
  const okRight = position === n || year <= sortedYears[position];
  return okLeft && okRight;
}

/** Quién se queda la carta tras el reveal (matriz de resolución del PRD). */
export type CardOutcome = "turn" | "challenger" | "none";

export function resolveCard(input: {
  turnCorrect: boolean;
  challenged: boolean;
  challengeCorrect: boolean;
}): CardOutcome {
  if (input.turnCorrect) return "turn";
  if (input.challenged && input.challengeCorrect) return "challenger";
  return "none";
}

/**
 * ¿La votación de título/artista le da ficha al equipo en turno?
 * Solo si hubo al menos un voto y los Sí ≥ No (empate con votos → gana el Sí).
 * Sin votos → no se entrega ficha.
 */
export function metaAwarded(votes: boolean[]): boolean {
  if (votes.length === 0) return false;
  const yes = votes.filter((v) => v).length;
  const no = votes.length - yes;
  return yes >= no;
}

/** Fin del juego: primer equipo que alcanza targetCards cartas bien ubicadas. */
export function hasWon(correctCards: number, targetCards: number): boolean {
  return correctCards >= targetCards;
}

/** Helper: años ordenados a partir de las cartas (en cualquier orden) de un equipo. */
export function timelineYears(cards: { release_year: number }[]): number[] {
  return cards.map((c) => c.release_year).sort((a, b) => a - b);
}
