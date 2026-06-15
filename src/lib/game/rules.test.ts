import { describe, it, expect } from "vitest";
import {
  isPlacementCorrect,
  resolveCard,
  metaAwarded,
  hasWon,
  timelineYears,
} from "./rules";

describe("isPlacementCorrect", () => {
  // Línea: [1980, 1990, 2000]. Huecos: 0:<1980, 1:1980-1990, 2:1990-2000, 3:>2000
  const tl = [1980, 1990, 2000];

  it("ubica en el medio correcto", () => {
    expect(isPlacementCorrect(tl, 1, 1985)).toBe(true); // entre 1980 y 1990
    expect(isPlacementCorrect(tl, 2, 1995)).toBe(true); // entre 1990 y 2000
  });

  it("rechaza hueco equivocado", () => {
    expect(isPlacementCorrect(tl, 0, 1985)).toBe(false); // 1985 no es < 1980
    expect(isPlacementCorrect(tl, 3, 1995)).toBe(false); // 1995 no es > 2000
  });

  it("extremos", () => {
    expect(isPlacementCorrect(tl, 0, 1975)).toBe(true); // ≤ min
    expect(isPlacementCorrect(tl, 0, 1980)).toBe(true); // = min, hueco izquierdo válido
    expect(isPlacementCorrect(tl, 3, 2005)).toBe(true); // ≥ max
    expect(isPlacementCorrect(tl, 3, 2000)).toBe(true); // = max, hueco derecho válido
  });

  it("empate: ambos huecos adyacentes al año del vecino son válidos", () => {
    // year = 1990 (igual al del medio). Huecos 1 (1980-1990) y 2 (1990-2000) válidos.
    expect(isPlacementCorrect(tl, 1, 1990)).toBe(true);
    expect(isPlacementCorrect(tl, 2, 1990)).toBe(true);
    // pero no el hueco 0 ni el 3
    expect(isPlacementCorrect(tl, 0, 1990)).toBe(false);
    expect(isPlacementCorrect(tl, 3, 1990)).toBe(false);
  });

  it("posiciones inválidas", () => {
    expect(isPlacementCorrect(tl, -1, 1985)).toBe(false);
    expect(isPlacementCorrect(tl, 4, 1985)).toBe(false);
  });

  it("línea de una sola carta (ancla)", () => {
    expect(isPlacementCorrect([1990], 0, 1985)).toBe(true);
    expect(isPlacementCorrect([1990], 1, 1995)).toBe(true);
    expect(isPlacementCorrect([1990], 0, 1995)).toBe(false);
  });
});

describe("resolveCard", () => {
  it("turno acierta → se queda la carta (haya o no desafío)", () => {
    expect(resolveCard({ turnCorrect: true, challenged: false, challengeCorrect: false })).toBe("turn");
    expect(resolveCard({ turnCorrect: true, challenged: true, challengeCorrect: true })).toBe("turn");
  });

  it("turno falla + desafío acierta → desafiante", () => {
    expect(resolveCard({ turnCorrect: false, challenged: true, challengeCorrect: true })).toBe("challenger");
  });

  it("turno falla + desafío falla → descarte", () => {
    expect(resolveCard({ turnCorrect: false, challenged: true, challengeCorrect: false })).toBe("none");
  });

  it("turno falla + sin desafío → descarte", () => {
    expect(resolveCard({ turnCorrect: false, challenged: false, challengeCorrect: false })).toBe("none");
  });
});

describe("metaAwarded", () => {
  it("sin votos → sin ficha", () => {
    expect(metaAwarded([])).toBe(false);
  });
  it("mayoría Sí → ficha", () => {
    expect(metaAwarded([true, true, false])).toBe(true);
  });
  it("empate con votos → gana el Sí", () => {
    expect(metaAwarded([true, false])).toBe(true);
  });
  it("mayoría No → sin ficha", () => {
    expect(metaAwarded([false, false, true])).toBe(false);
  });
  it("un solo voto Sí → ficha; un solo No → sin ficha", () => {
    expect(metaAwarded([true])).toBe(true);
    expect(metaAwarded([false])).toBe(false);
  });
});

describe("hasWon", () => {
  it("alcanza el objetivo", () => {
    expect(hasWon(10, 10)).toBe(true);
    expect(hasWon(9, 10)).toBe(false);
    expect(hasWon(11, 10)).toBe(true);
  });
});

describe("timelineYears", () => {
  it("ordena ascendente", () => {
    expect(timelineYears([{ release_year: 2000 }, { release_year: 1980 }, { release_year: 1990 }])).toEqual([
      1980, 1990, 2000,
    ]);
  });
});
