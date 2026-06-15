"use client";

/**
 * Selector de hueco para ubicar una carta en una línea de tiempo. position:
 * 0 = antes de la más antigua … n = después de la más nueva.
 * `disabledPosition` marca el hueco que NO se puede elegir (en el desafío, el que ya
 * eligió el equipo en turno) — así el desafío es siempre sobre un hueco distinto.
 */
export type PlacerCard = { year: number; title: string };

export default function TimelinePlacer({
  cards,
  selected,
  onSelect,
  disabledPosition = null,
  disabledLabel,
}: {
  cards: PlacerCard[];
  selected: number | null;
  onSelect: (position: number) => void;
  disabledPosition?: number | null;
  disabledLabel?: string;
}) {
  const gap = (i: number) => {
    const isDisabled = disabledPosition === i;
    return (
      <div key={`gap-${i}`} className="flex flex-col items-center justify-end gap-0.5">
        {isDisabled && disabledLabel && (
          <span className="rounded bg-black px-1 text-[9px] font-semibold text-white">{disabledLabel}</span>
        )}
        <button
          onClick={() => !isDisabled && onSelect(i)}
          disabled={isDisabled}
          className={`h-14 w-7 shrink-0 rounded ${
            isDisabled
              ? "cursor-not-allowed bg-gray-800"
              : selected === i
                ? "bg-green-600"
                : "bg-gray-200 hover:bg-gray-300"
          }`}
          aria-label={`Hueco ${i}`}
        />
      </div>
    );
  };

  return (
    <div className="flex items-end gap-1 overflow-x-auto py-2">
      {gap(0)}
      {cards.map((c, i) => (
        <div key={`card-${i}`} className="flex items-end gap-1">
          <div className="flex h-14 min-w-[72px] flex-col items-center justify-center rounded border bg-gray-50 px-2">
            <span className="font-mono text-base font-bold">{c.year}</span>
            <span className="max-w-[68px] truncate text-[10px] text-gray-500">{c.title}</span>
          </div>
          {gap(i + 1)}
        </div>
      ))}
    </div>
  );
}
