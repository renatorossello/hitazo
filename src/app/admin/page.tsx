"use client";

import { useCallback, useState } from "react";
import type { SpotifyTrack } from "@/lib/deck-engine";

type Progress = Record<string, number>;

export default function AdminPage() {
  const [text, setText] = useState("");
  const [genre, setGenre] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [filterName, setFilterName] = useState("Seed");

  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);

  async function seedFamous() {
    setBusy("seed");
    setMsg("Buscando las 50 famosas en Spotify (puede tardar ~20s)…");
    try {
      const res = await fetch("/api/admin/seed-famous", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setMsg("No hay sesión de host. Conectate con Spotify en /host.");
        return;
      }
      if (!res.ok) {
        setMsg(`Error: ${data.error}`);
        return;
      }
      const missing = data.notFound?.length ? ` No encontradas: ${data.notFound.join("; ")}.` : "";
      setMsg(
        `Listas ${data.playable}/${data.total} jugables en el mazo "${data.filterName}" (año curado, sin MusicBrainz).${missing}`
      );
      await refreshProgress();
    } finally {
      setBusy(null);
    }
  }

  async function search() {
    setBusy("search");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text || undefined,
          genre: genre || undefined,
          yearFrom: yearFrom ? Number(yearFrom) : undefined,
          yearTo: yearTo ? Number(yearTo) : undefined,
          max: 50,
        }),
      });
      if (res.status === 401) {
        setMsg("No hay sesión de host. Conectate con Spotify en /host.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Error: ${data.error}`);
        return;
      }
      setResults(data.tracks);
      // por defecto, todos seleccionados
      const sel: Record<string, boolean> = {};
      for (const t of data.tracks as SpotifyTrack[]) sel[t.spotify_id] = true;
      setSelected(sel);
      setMsg(`${data.tracks.length} resultados.`);
    } finally {
      setBusy(null);
    }
  }

  async function importSelected() {
    const tracks = results.filter((t) => selected[t.spotify_id]);
    if (tracks.length === 0) {
      setMsg("No seleccionaste ninguno.");
      return;
    }
    setBusy("import");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks, filterName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Error al importar: ${data.error}`);
        return;
      }
      setMsg(`Importadas ${data.imported} cartas al mazo "${data.filterName}".`);
      await refreshProgress();
    } finally {
      setBusy(null);
    }
  }

  const refreshProgress = useCallback(async () => {
    const res = await fetch("/api/admin/resolve/progress");
    if (res.ok) setProgress(await res.json());
  }, []);

  async function resolveAll() {
    setBusy("resolve");
    setMsg("Resolviendo años contra MusicBrainz (1/seg)…");
    try {
      // Loop de lotes hasta que no queden 'pending'.
      for (let i = 0; i < 200; i++) {
        const res = await fetch("/api/admin/resolve", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMsg(`Error al resolver: ${data.error}`);
          break;
        }
        await refreshProgress();
        if ((data.remaining ?? 0) === 0) {
          setMsg("Resolución terminada.");
          break;
        }
      }
    } finally {
      setBusy(null);
    }
  }

  const playable = (progress?.resolved ?? 0) + (progress?.manual ?? 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Admin de mazos · Hitazo</h1>

      {/* Seed rápido */}
      <section className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
        <h2 className="font-semibold">Seed inicial</h2>
        <p className="text-sm text-gray-500">
          Importa el set provisorio de 50 canciones famosas al mazo &quot;Famosas&quot;. Después tocá
          &quot;Resolver pendientes&quot; para traer los años de MusicBrainz.
        </p>
        <button
          onClick={seedFamous}
          disabled={busy !== null}
          className="self-start rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "seed" ? "Sembrando…" : "Sembrar 50 famosas"}
        </button>
      </section>

      {/* Buscar */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-semibold">1. Buscar e importar</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input className="rounded border px-2 py-1 text-sm" placeholder="texto" value={text} onChange={(e) => setText(e.target.value)} />
          <input className="rounded border px-2 py-1 text-sm" placeholder="género (rock)" value={genre} onChange={(e) => setGenre(e.target.value)} />
          <input className="rounded border px-2 py-1 text-sm" placeholder="año desde" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} />
          <input className="rounded border px-2 py-1 text-sm" placeholder="año hasta" value={yearTo} onChange={(e) => setYearTo(e.target.value)} />
          <input className="rounded border px-2 py-1 text-sm" placeholder="mazo" value={filterName} onChange={(e) => setFilterName(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button onClick={search} disabled={busy !== null} className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "search" ? "Buscando…" : "Buscar"}
          </button>
          <button onClick={importSelected} disabled={busy !== null || results.length === 0} className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "import" ? "Importando…" : "Importar seleccionadas"}
          </button>
        </div>
      </section>

      {/* Resultados */}
      {results.length > 0 && (
        <ul className="flex max-h-80 flex-col gap-1 overflow-auto rounded-lg border p-2">
          {results.map((t) => (
            <li key={t.spotify_id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
              <input
                type="checkbox"
                checked={!!selected[t.spotify_id]}
                onChange={(e) => setSelected((s) => ({ ...s, [t.spotify_id]: e.target.checked }))}
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail del CDN de Spotify en herramienta interna */}
              {t.cover_url && <img src={t.cover_url} alt="" className="h-8 w-8 rounded" />}
              <span className="flex-1">
                <strong>{t.title}</strong> — {t.artist}
              </span>
              <span className="text-gray-400">{t.spotify_year ?? "—"}</span>
              {!t.isrc && <span className="text-amber-600" title="Sin ISRC: no se puede resolver el año">⚠</span>}
            </li>
          ))}
        </ul>
      )}

      {/* Resolver */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-semibold">2. Resolver años</h2>
        <div className="flex gap-2">
          <button onClick={resolveAll} disabled={busy !== null} className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "resolve" ? "Resolviendo…" : "Resolver pendientes"}
          </button>
          <button onClick={refreshProgress} disabled={busy !== null} className="rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Actualizar progreso
          </button>
        </div>
        {progress && (
          <div className="text-sm text-gray-600">
            <p>
              Jugables (resolved + manual): <strong>{playable}</strong> · pending: {progress.pending ?? 0} · needs_review: {progress.needs_review ?? 0}
            </p>
          </div>
        )}
      </section>

      {msg && <p className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700">{msg}</p>}
    </main>
  );
}
