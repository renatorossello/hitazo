"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SpotifyTrack } from "@/lib/deck-engine";

type Progress = Record<string, number>;

export default function AdminPage() {
  const [text, setText] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [max, setMax] = useState("50");

  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [deckName, setDeckName] = useState("");
  const [resultsAreDeck, setResultsAreDeck] = useState(false);
  const [decks, setDecks] = useState<{ id: string; name: string; total: number; playable: number }[]>([]);

  const refreshProgress = useCallback(async () => {
    const res = await fetch("/api/admin/resolve/progress");
    if (res.ok) setProgress(await res.json());
  }, []);

  const loadDecks = useCallback(async () => {
    const res = await fetch("/api/admin/decks");
    if (res.ok) setDecks((await res.json()).decks);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga async inicial
    loadDecks();
    refreshProgress();
  }, [loadDecks, refreshProgress]);

  async function loadPlaylist() {
    if (!playlistUrl.trim()) return setMsg("Pegá el link de una playlist.");
    setBusy("playlist");
    setMsg("Leyendo la playlist y buscando géneros…");
    try {
      const res = await fetch("/api/admin/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: playlistUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return setMsg("No hay sesión de host. Conectate con Spotify en /host.");
      if (res.status === 404) return setMsg("No se pudo leer la playlist. Revisá el link (tiene que ser una playlist pública/tuya).");
      if (!res.ok) return setMsg(`Error: ${data.error}`);
      setResults(data.tracks);
      setResultsAreDeck(true);
      setDeckName(data.deckName ?? "Playlist");
      const sel: Record<string, boolean> = {};
      for (const t of data.tracks as SpotifyTrack[]) sel[t.spotify_id] = true;
      setSelected(sel);
      const capped = data.source === "embed" && data.count >= 100
        ? " ⚠️ Spotify bloqueó la API y por la página pública solo entran ~100. Si la playlist tiene más, dividila en dos (≤100 c/u) e importá ambas; el juego no repite temas."
        : "";
      setMsg(`${data.tracks.length} temas en la playlist (vía ${data.source === "api" ? "API de Spotify" : "página pública"}). Elegí cuáles importar y dale "Importar seleccionadas".${capped}`);
    } finally {
      setBusy(null);
    }
  }

  async function seedFamous() {
    setBusy("seed");
    setMsg("Buscando las 50 famosas en Spotify (puede tardar ~30s)…");
    try {
      const res = await fetch("/api/admin/seed-famous", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return setMsg("No hay sesión de host. Conectate con Spotify en /host.");
      if (!res.ok) return setMsg(`Error: ${data.error}`);
      const missing = data.notFound?.length ? ` No encontradas: ${data.notFound.join("; ")}.` : "";
      setMsg(`Listas ${data.playable}/${data.total} jugables (año curado).${missing}`);
      await refreshProgress();
    } finally {
      setBusy(null);
    }
  }

  async function search() {
    setBusy("search");
    setMsg("Buscando (trae también el género del artista)…");
    try {
      const res = await fetch("/api/admin/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text || undefined,
          artist: artist || undefined,
          genre: genre || undefined,
          yearFrom: yearFrom ? Number(yearFrom) : undefined,
          yearTo: yearTo ? Number(yearTo) : undefined,
          max: Number(max) || 50,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return setMsg("No hay sesión de host. Conectate con Spotify en /host.");
      if (!res.ok) return setMsg(`Error: ${data.error}`);
      setResults(data.tracks);
      setResultsAreDeck(false);
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
    if (tracks.length === 0) return setMsg("No seleccionaste ninguno.");
    setBusy("import");
    setMsg(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracks,
          deckName: resultsAreDeck ? deckName.trim() || "Playlist" : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(`Error al importar: ${data.error}`);
      setMsg(
        `Importadas ${data.imported} cartas${data.deckName ? ` al mazo "${data.deckName}"` : " al pool"}. Resolvé los años abajo.`
      );
      await Promise.all([refreshProgress(), loadDecks()]);
    } finally {
      setBusy(null);
    }
  }

  const allSelected = (val: boolean) => {
    const sel: Record<string, boolean> = {};
    for (const t of results) sel[t.spotify_id] = val;
    setSelected(sel);
  };

  async function resolveAll() {
    setBusy("resolve");
    setMsg("Resolviendo años contra MusicBrainz (1/seg)…");
    try {
      for (let i = 0; i < 500; i++) {
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin de mazos · Hitazo</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/admin/cards" className="text-brand underline">
            📋 Canciones
          </Link>
          <Link href="/admin/review" className="text-brand underline">
            🛠 Revisar años
          </Link>
        </nav>
      </div>

      {/* Seed rápido */}
      <section className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
        <h2 className="font-semibold">Seed inicial</h2>
        <p className="text-sm text-gray-500">Importa el set de 50 canciones famosas (con años curados).</p>
        <button
          onClick={seedFamous}
          disabled={busy !== null}
          className="self-start rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "seed" ? "Sembrando…" : "Sembrar 50 famosas"}
        </button>
      </section>

      {/* Importar de playlist */}
      <section className="flex flex-col gap-3 rounded-lg border-2 border-[#1DB954]/40 p-4">
        <h2 className="font-semibold">🎵 Importar de una playlist de Spotify</h2>
        <p className="text-sm text-gray-500">
          Pegá el link de una playlist <strong>pública</strong> (tuya o de otros). Trae sus temas (vía la página pública,
          porque la API de playlists está restringida) para que elijas cuáles importar como mazo.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 rounded border px-3 py-2 text-sm"
            placeholder="https://open.spotify.com/playlist/…"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
          />
          <button
            onClick={loadPlaylist}
            disabled={busy !== null}
            className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "playlist" ? "Leyendo…" : "Cargar playlist"}
          </button>
        </div>
      </section>

      {/* Buscar */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-semibold">Buscar e importar (alternativa)</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <input className="rounded border px-2 py-1 text-sm" placeholder="texto" value={text} onChange={(e) => setText(e.target.value)} />
          <input className="rounded border px-2 py-1 text-sm" placeholder="artista" value={artist} onChange={(e) => setArtist(e.target.value)} />
          <input className="rounded border px-2 py-1 text-sm" placeholder="género (rock, pop…)" value={genre} onChange={(e) => setGenre(e.target.value)} />
          <input className="rounded border px-2 py-1 text-sm" placeholder="año desde" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} />
          <input className="rounded border px-2 py-1 text-sm" placeholder="año hasta" value={yearTo} onChange={(e) => setYearTo(e.target.value)} />
          <input className="rounded border px-2 py-1 text-sm" placeholder="máx (50)" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
        <button onClick={search} disabled={busy !== null} className="self-start rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy === "search" ? "Buscando…" : "Buscar"}
        </button>
      </section>

      {/* Resultados + barra de selección/import */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border p-2">
          <div className="flex flex-wrap items-center gap-2 border-b pb-2">
            <span className="text-sm text-gray-500">
              {Object.values(selected).filter(Boolean).length}/{results.length} seleccionados
            </span>
            <button onClick={() => allSelected(true)} className="rounded-full border px-3 py-1 text-xs font-semibold">
              Seleccionar todos
            </button>
            <button onClick={() => allSelected(false)} className="rounded-full border px-3 py-1 text-xs font-semibold">
              Deseleccionar todos
            </button>
            <div className="flex-1" />
            {resultsAreDeck && (
              <input
                className="w-44 rounded border px-2 py-1 text-sm"
                placeholder="nombre del mazo"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
              />
            )}
            <button
              onClick={importSelected}
              disabled={busy !== null}
              className="rounded-full bg-[#1DB954] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === "import" ? "Importando…" : "Importar seleccionadas"}
            </button>
          </div>
          <ul className="flex max-h-96 flex-col gap-1 overflow-auto">
          {results.map((t) => (
            <li key={t.spotify_id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
              <input
                type="checkbox"
                checked={!!selected[t.spotify_id]}
                onChange={(e) => setSelected((s) => ({ ...s, [t.spotify_id]: e.target.checked }))}
              />
              {t.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element -- thumbnail del CDN de Spotify
                <img src={t.cover_url} alt="" className="h-8 w-8 rounded" />
              )}
              <span className="flex-1">
                <strong>{t.title}</strong> — {t.artist}
              </span>
              <span className="hidden text-xs text-brand sm:inline">{(t.genreBuckets ?? []).join("/")}</span>
              <span className="hidden text-xs text-gray-400 sm:inline">{t.region}</span>
              <span className="text-gray-400">{t.spotify_year ?? "—"}</span>
            </li>
          ))}
          </ul>
        </div>
      )}

      {/* Resolver */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-semibold">2. Resolver años (MusicBrainz)</h2>
        <div className="flex gap-2">
          <button onClick={resolveAll} disabled={busy !== null} className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "resolve" ? "Resolviendo…" : "Resolver pendientes"}
          </button>
          <button
            onClick={async () => {
              await Promise.all([refreshProgress(), loadDecks()]);
              setMsg("Progreso actualizado.");
            }}
            disabled={busy !== null}
            className="rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Actualizar progreso
          </button>
        </div>
        {progress && (
          <p className="text-sm text-gray-600">
            Jugables: <strong>{playable}</strong> · pending: {progress.pending ?? 0} · needs_review: {progress.needs_review ?? 0}{" "}
            (corregilos en <Link href="/admin/review" className="text-brand underline">Revisar años</Link>)
          </p>
        )}
      </section>

      {/* Mazos */}
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <h2 className="font-semibold">Mazos ({decks.length})</h2>
        {decks.length === 0 ? (
          <p className="text-sm text-gray-400">Todavía no hay mazos. Importá una playlist para crear uno.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {decks.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded px-2 py-1 hover:bg-gray-50">
                <span className="font-medium">{d.name}</span>
                <span className="text-gray-500">
                  {d.playable} jugables / {d.total} total
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-400">En el lobby elegís qué mazos usar (o todos si no elegís ninguno).</p>
      </section>

      {msg && <p className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700">{msg}</p>}
    </main>
  );
}
