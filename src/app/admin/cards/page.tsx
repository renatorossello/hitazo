"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Card = {
  id: string;
  title: string;
  artist: string;
  release_year: number | null;
  year_status: string;
  genre_buckets: string[] | null;
  region: string | null;
  cover_url: string | null;
};

const BUCKETS = ["Pop", "Rock", "Metal", "Rap/Hip-hop", "R&B/Soul", "Electrónica", "Latino", "Reggae", "Folk/Country", "Jazz/Blues", "Indie/Alt", "Clásica", "Otros"];
const REGIONS = ["Anglo", "Latino", "Brasil", "K-pop", "J-pop", "Francés", "Italiano", "Alemán", "Desconocido"];
const STATUSES = ["resolved", "manual", "pending", "needs_review"];

export default function CardsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ cards: Card[]; total: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (bucket) params.set("bucket", bucket);
    if (region) params.set("region", region);
    params.set("page", String(page));
    const res = await fetch(`/api/admin/cards?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [q, status, bucket, region, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga async (setState post-await)
    load();
  }, [load]);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Canciones en la base</h1>
        <Link href="/admin" className="text-sm text-brand underline">
          ← Admin
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="buscar título/artista"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
        <select className="rounded border px-2 py-1 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">todos los estados</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="rounded border px-2 py-1 text-sm" value={bucket} onChange={(e) => { setBucket(e.target.value); setPage(0); }}>
          <option value="">todos los géneros</option>
          {BUCKETS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="rounded border px-2 py-1 text-sm" value={region} onChange={(e) => { setRegion(e.target.value); setPage(0); }}>
          <option value="">todas las regiones</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <p className="text-sm text-gray-500">{data ? `${data.total} canciones` : "…"}{loading && " · cargando"}</p>

      <ul className="flex flex-col gap-1">
        {data?.cards.map((c) => (
          <li key={c.id} className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm">
            {c.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element -- thumbnail del CDN de Spotify
              <img src={c.cover_url} alt="" className="h-8 w-8 rounded" />
            )}
            <span className="flex-1 truncate">
              <strong>{c.title}</strong> — {c.artist}
            </span>
            <span className="text-xs text-brand">{(c.genre_buckets ?? []).join("/")}</span>
            <span className="text-xs text-gray-400">{c.region}</span>
            <span className={`w-12 text-right font-mono ${c.release_year ? "" : "text-amber-600"}`}>{c.release_year ?? "—"}</span>
            <span className="w-20 truncate text-right text-[10px] text-gray-400">{c.year_status}</span>
          </li>
        ))}
      </ul>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1 disabled:opacity-40">
            ←
          </button>
          <span>
            {page + 1} / {totalPages}
          </span>
          <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 disabled:opacity-40">
            →
          </button>
        </div>
      )}
    </main>
  );
}
