"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Card = {
  id: string;
  title: string;
  artist: string;
  release_year: number | null;
  spotify_year: number | null;
  mb_candidates: number[] | null;
  year_status: string;
  genre_buckets: string[] | null;
  region: string | null;
  cover_url: string | null;
};

const BUCKETS = ["Pop", "Rock", "Metal", "Rap/Hip-hop", "R&B/Soul", "Electrónica", "Latino", "Reggae", "Folk/Country", "Jazz/Blues", "Indie/Alt", "Clásica", "Otros"];
const REGIONS = ["Anglo", "Latino", "Brasil", "K-pop", "J-pop", "Francés", "Italiano", "Alemán", "Desconocido"];
const STATUSES = ["resolved", "manual", "pending", "needs_review"];

type Deck = { id: string; name: string };

export default function CardsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("");
  const [deck, setDeck] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ cards: Card[]; total: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (bucket) params.set("bucket", bucket);
    if (region) params.set("region", region);
    if (deck) params.set("deck", deck);
    params.set("page", String(page));
    const res = await fetch(`/api/admin/cards?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [q, status, bucket, region, deck, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga async (setState post-await)
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/admin/decks").then((r) => (r.ok ? r.json() : { decks: [] })).then((d) => setDecks(d.decks ?? []));
  }, []);

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;
  const selectedIds = data ? data.cards.filter((c) => sel[c.id]).map((c) => c.id) : [];

  const toggleSel = (id: string) => setSel((s) => ({ ...s, [id]: !s[id] }));
  const setAllOnPage = (v: boolean) =>
    setSel((s) => {
      const next = { ...s };
      for (const c of data?.cards ?? []) next[c.id] = v;
      return next;
    });

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.length} canción(es) del pool? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    const res = await fetch("/api/admin/cards/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const out = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      alert(`Error al eliminar: ${out.error ?? res.status}`);
      return;
    }
    if (out.failed?.length) {
      alert(`Eliminadas ${out.deleted}. ${out.failed.length} no se pudieron borrar (ya se jugaron en alguna partida).`);
    }
    setSel({});
    load();
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Canciones en la base</h1>
        <Link href="/admin" className="text-sm text-brand underline">← Admin</Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input className="rounded border px-2 py-1 text-sm" placeholder="buscar título/artista" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className="rounded border px-2 py-1 text-sm" value={deck} onChange={(e) => { setDeck(e.target.value); setPage(0); }}>
          <option value="">todos los mazos</option>
          {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
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

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">{data ? `${data.total} canciones` : "…"}{loading && " · cargando"}</span>
        <div className="flex-1" />
        <button onClick={() => setAllOnPage(true)} className="rounded-full border px-3 py-1 text-xs font-semibold">Seleccionar página</button>
        <button onClick={() => setAllOnPage(false)} className="rounded-full border px-3 py-1 text-xs font-semibold">Limpiar</button>
        <button
          onClick={deleteSelected}
          disabled={selectedIds.length === 0 || deleting}
          className="rounded-full bg-red-600 px-4 py-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          {deleting ? "Eliminando…" : `🗑 Eliminar seleccionadas (${selectedIds.length})`}
        </button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {data?.cards.map((c) => <CardRow key={c.id} card={c} selected={!!sel[c.id]} onToggle={() => toggleSel(c.id)} onSaved={load} />)}
      </ul>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1 disabled:opacity-40">←</button>
          <span>{page + 1} / {totalPages}</span>
          <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 disabled:opacity-40">→</button>
        </div>
      )}
    </main>
  );
}

function CardRow({ card, selected, onToggle, onSaved }: { card: Card; selected: boolean; onToggle: () => void; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(String(card.release_year ?? ""));
  const [region, setRegion] = useState(card.region ?? "");
  const [buckets, setBuckets] = useState<string[]>(card.genre_buckets ?? []);
  const [cands, setCands] = useState<{ mbCandidates: number[]; deezerYear: number | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const toggleBucket = (b: string) => setBuckets((s) => (s.includes(b) ? s.filter((x) => x !== b) : [...s, b]));

  async function validate() {
    setBusy("validate");
    const res = await fetch(`/api/admin/cards/${card.id}/validate`);
    if (res.ok) setCands(await res.json());
    setBusy(null);
  }

  async function save() {
    setBusy("save");
    await fetch(`/api/admin/cards/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: year ? Number(year) : undefined, region, buckets }),
    });
    setBusy(null);
    setOpen(false);
    onSaved();
  }

  return (
    <li className="rounded-lg border">
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
        <input type="checkbox" checked={selected} onChange={onToggle} className="shrink-0" />
        {card.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnail del CDN
          <img src={card.cover_url} alt="" className="h-8 w-8 rounded" />
        ) : (
          <div className="h-8 w-8 rounded bg-gray-100" />
        )}
        <span className="flex-1 truncate"><strong>{card.title}</strong> — {card.artist}</span>
        <span className="text-xs text-brand">{(card.genre_buckets ?? []).join("/")}</span>
        <span className="text-xs text-gray-400">{card.region}</span>
        <span className={`w-12 text-right font-mono ${card.release_year ? "" : "text-amber-600"}`}>{card.release_year ?? "—"}</span>
        <button onClick={() => setOpen((o) => !o)} className="rounded px-2 py-0.5 text-xs hover:bg-gray-100" title="Editar">✏️</button>
      </div>

      {open && (
        <div className="flex flex-col gap-2 border-t bg-gray-50 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">Año
              <input value={year} onChange={(e) => setYear(e.target.value)} className="w-20 rounded border px-2 py-1" />
            </label>
            <button onClick={validate} disabled={busy !== null} className="rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50">
              {busy === "validate" ? "Buscando…" : "🔎 Validar año"}
            </button>
            {cands && (
              <span className="flex flex-wrap items-center gap-1 text-xs">
                {cands.mbCandidates.map((y) => (
                  <button key={y} onClick={() => setYear(String(y))} className="rounded bg-brand/10 px-2 py-0.5 font-mono text-brand">MB {y}</button>
                ))}
                {cands.deezerYear && (
                  <button onClick={() => setYear(String(cands.deezerYear))} className="rounded bg-accent/15 px-2 py-0.5 font-mono text-accent-600">Deezer {cands.deezerYear}</button>
                )}
                {cands.mbCandidates.length === 0 && !cands.deezerYear && <span className="text-gray-400">sin candidatos</span>}
              </span>
            )}
          </div>
          <label className="flex items-center gap-1">Región
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded border px-2 py-1">
              <option value="">—</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-1">
            {BUCKETS.map((b) => (
              <button key={b} onClick={() => toggleBucket(b)} className={`rounded-full px-2 py-0.5 text-xs ${buckets.includes(b) ? "bg-brand text-white" : "bg-white ring-1 ring-gray-200"}`}>{b}</button>
            ))}
          </div>
          <button onClick={save} disabled={busy !== null} className="self-start rounded-full bg-black px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "save" ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
    </li>
  );
}
