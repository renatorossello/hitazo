"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Card = {
  id: string;
  title: string;
  artist: string;
  spotify_year: number | null;
  mb_candidates: number[] | null;
  region: string | null;
};

const REGIONS = ["Anglo", "Latino", "Brasil", "K-pop", "J-pop", "Francés", "Italiano", "Alemán", "Desconocido"];

export default function ReviewPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/cards?status=needs_review&page=0");
    if (res.ok) setCards((await res.json()).cards);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga async (setState post-await)
    load();
  }, [load]);

  async function save(id: string, year: string, region: string) {
    const body: { year?: number; region?: string } = {};
    if (year) body.year = Number(year);
    if (region) body.region = region;
    const res = await fetch(`/api/admin/cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) setCards((cs) => cs.filter((c) => c.id !== id)); // resuelto → sale de la cola
  }

  async function discard(id: string) {
    const res = await fetch(`/api/admin/cards/${id}`, { method: "DELETE" });
    if (res.ok) setCards((cs) => cs.filter((c) => c.id !== id));
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Revisar años</h1>
        <Link href="/admin" className="text-sm text-brand underline">
          ← Admin
        </Link>
      </div>
      <p className="text-sm text-gray-500">
        Canciones sin año confiable (MusicBrainz no resolvió). Fijá el año a mano para que entren al juego, o descartalas.
        {loading && " · cargando"}
      </p>

      {cards.length === 0 && !loading && <p className="rounded bg-green-50 px-4 py-6 text-center text-sm text-green-700">Nada para revisar 🎉</p>}

      <ul className="flex flex-col gap-2">
        {cards.map((c) => (
          <ReviewRow key={c.id} card={c} onSave={save} onDiscard={discard} />
        ))}
      </ul>
    </main>
  );
}

function ReviewRow({
  card,
  onSave,
  onDiscard,
}: {
  card: Card;
  onSave: (id: string, year: string, region: string) => void;
  onDiscard: (id: string) => void;
}) {
  const [year, setYear] = useState(String(card.mb_candidates?.[0] ?? card.spotify_year ?? ""));
  const [region, setRegion] = useState(card.region ?? "");

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div>
        <strong>{card.title}</strong> — {card.artist}
      </div>
      <div className="text-xs text-gray-500">
        Spotify: {card.spotify_year ?? "—"}
        {card.mb_candidates?.length ? ` · MB candidatos: ${card.mb_candidates.join(", ")}` : ""}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="año"
          className="w-24 rounded border px-2 py-1"
        />
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded border px-2 py-1">
          <option value="">región…</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button onClick={() => onSave(card.id, year, region)} className="rounded-full bg-black px-4 py-1.5 font-semibold text-white">
          Guardar
        </button>
        <button onClick={() => onDiscard(card.id)} className="rounded-full border px-3 py-1.5 text-gray-500">
          Descartar
        </button>
      </div>
    </li>
  );
}
