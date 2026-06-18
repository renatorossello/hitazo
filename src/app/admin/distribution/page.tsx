"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Deck = { id: string; name: string; total: number; playable: number };
type Bucket = { start: number; end: number; count: number };
type Dist = { buckets: Bucket[]; total: number; min: number | null; max: number | null };

export default function DistributionPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [dist, setDist] = useState<Dist | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDecks = useCallback(async () => {
    const res = await fetch("/api/admin/decks");
    if (res.ok) setDecks((await res.json()).decks);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga async inicial
    loadDecks();
  }, [loadDecks]);

  const selectedIds = decks.filter((d) => sel[d.id]).map((d) => d.id);

  const run = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/decks/distribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filterIds: selectedIds }),
    });
    if (res.ok) setDist(await res.json());
    setLoading(false);
  }, [selectedIds]);

  const maxCount = dist ? Math.max(1, ...dist.buckets.map((b) => b.count)) : 1;
  const toggle = (id: string) => setSel((s) => ({ ...s, [id]: !s[id] }));
  const allDecks = (v: boolean) => setSel(Object.fromEntries(decks.map((d) => [d.id, v])));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Distribución de años</h1>
        <Link href="/admin" className="text-sm text-brand underline">← Admin</Link>
      </div>
      <p className="text-sm text-gray-500">
        Elegí los mazos que vas a jugar y mirá cómo quedan repartidas las canciones por franjas de 5 años.
        Cuenta canciones <strong>jugables y únicas</strong> (sin repetir temas, igual que el sorteo). Sin selección = pool completo.
      </p>

      {/* Selección de mazos */}
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Mazos</h2>
          <div className="flex-1" />
          <button onClick={() => allDecks(true)} className="rounded-full border px-3 py-1 text-xs font-semibold">Todos</button>
          <button onClick={() => allDecks(false)} className="rounded-full border px-3 py-1 text-xs font-semibold">Ninguno</button>
        </div>
        {decks.length === 0 ? (
          <p className="text-sm text-gray-400">No hay mazos. Importá una playlist en el admin.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {decks.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                  <input type="checkbox" checked={!!sel[d.id]} onChange={() => toggle(d.id)} />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-xs text-gray-400">{d.playable} jug.</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={run}
          disabled={loading}
          className="mt-1 self-start rounded-full bg-black px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Calculando…" : selectedIds.length ? `Ver distribución (${selectedIds.length} mazos)` : "Ver distribución (pool completo)"}
        </button>
      </section>

      {/* Histograma */}
      {dist && (
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          {dist.total === 0 ? (
            <p className="text-sm text-amber-600">No hay canciones jugables en esa selección.</p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                <strong>{dist.total}</strong> canciones jugables · rango {dist.min}–{dist.max}
              </p>
              <ul className="flex flex-col gap-1">
                {dist.buckets.map((b) => (
                  <li key={b.start} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 font-mono text-xs text-gray-500">{b.start}–{b.end}</span>
                    <div className="flex h-5 flex-1 items-center">
                      <div
                        className="h-full rounded bg-brand"
                        style={{ width: `${(b.count / maxCount) * 100}%`, minWidth: b.count ? "2px" : 0 }}
                      />
                      <span className="ml-2 text-xs tabular-nums text-gray-600">{b.count || ""}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}
