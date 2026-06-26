"use client";

/**
 * Línea de tiempo VERTICAL de un equipo. Más antigua arriba → más nueva abajo.
 * Cuando `interactive`, los huecos son botones para ubicar (placement/desafío);
 * `disabledPosition` marca el hueco que ya eligió el turno (en el desafío).
 * position: 0 = antes de la más antigua … n = después de la más nueva.
 */
export type VCard = { year: number; title: string; coverUrl?: string | null };
export type VMarker = { position: number; label: string; tone: "turn" | "challenge" };

export default function VerticalTimeline({
  cards,
  markers = [],
  interactive = false,
  selected = null,
  onSelect,
  disabledPosition = null,
}: {
  cards: VCard[];
  markers?: VMarker[];
  interactive?: boolean;
  selected?: number | null;
  onSelect?: (position: number) => void;
  disabledPosition?: number | null;
}) {
  // Rango de años del hueco i (orientación: más viejo arriba → más nuevo abajo).
  // Hace explícito qué año va en cada hueco para que nadie dude si "abajo" es mayor o menor.
  const gapRange = (i: number): string => {
    if (cards.length === 0) return "ubicar acá";
    if (i === 0) return `↑ más viejo que ${cards[0].year}`;
    if (i === cards.length) return `más nuevo que ${cards[cards.length - 1].year} ↓`;
    return `entre ${cards[i - 1].year} y ${cards[i].year}`;
  };

  const gap = (i: number) => {
    const here = markers.filter((m) => m.position === i);
    const isDisabled = disabledPosition === i;
    const isSelected = selected === i;

    if (interactive) {
      if (isDisabled) {
        return (
          <div
            key={`g${i}`}
            className="w-full rounded-lg border-2 border-brand bg-brand/10 py-2 text-center text-xs font-bold text-brand"
          >
            🔒 el turno eligió acá
          </div>
        );
      }
      return (
        <button
          key={`g${i}`}
          onClick={() => onSelect?.(i)}
          className={`w-full rounded-lg border-2 border-dashed py-2.5 text-center text-sm font-medium transition active:scale-[0.99] ${
            isSelected
              ? "border-teal bg-teal/15 font-bold text-teal"
              : "border-gray-300 text-gray-500 hover:border-brand hover:bg-brand/5"
          }`}
        >
          {isSelected ? `✓ acá · ${gapRange(i)}` : `＋ ${gapRange(i)}`}
        </button>
      );
    }

    // Read-only: línea fina con marcadores (turno / desafío).
    return (
      <div key={`g${i}`} className="flex w-full items-center gap-2 px-1 py-0.5">
        <div className={`h-0.5 flex-1 rounded ${here.length ? "bg-accent" : "bg-gray-200"}`} />
        {here.map((m, idx) => (
          <span
            key={idx}
            className={`rounded px-1.5 text-[10px] font-bold ${
              m.tone === "turn" ? "bg-brand text-white" : "bg-accent text-brand-deep"
            }`}
          >
            {m.label}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      {cards.length === 0 && <p className="py-4 text-center text-xs text-gray-400">Sin cartas todavía.</p>}
      {cards.length > 0 && (
        <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">↑ más viejas · más nuevas ↓</p>
      )}
      {gap(0)}
      {cards.map((c, i) => (
        <div key={`c${i}`} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
            <span className="font-mono text-2xl font-extrabold text-brand">{c.year}</span>
            <span className="flex-1 truncate text-sm text-gray-600">{c.title}</span>
            {c.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- carátula del CDN de Spotify
              <img src={c.coverUrl} alt="" className="h-10 w-10 shrink-0 rounded shadow-sm" />
            )}
          </div>
          {gap(i + 1)}
        </div>
      ))}
    </div>
  );
}
