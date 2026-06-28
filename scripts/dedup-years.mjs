// Detecta canciones DUPLICADAS (misma identidad) cargadas con AÑOS distintos, y
// (con arg "fix") las deja consistentes en el año correcto. Criterio del año correcto:
//   1) si alguna copia es 'manual' → el año manual más viejo (humano = confiable),
//   2) si no, reconsulta MusicBrainz (título limpio + artista) y usa el candidato más
//      viejo (original); si MB no encuentra, el año más viejo entre las copias.
// Las que toca quedan 'manual' (consistentes y fijas).
//
// Uso: node scripts/dedup-years.mjs        (solo detecta, no escribe)
//      node scripts/dedup-years.mjs fix     (corrige)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UA = env.MUSICBRAINZ_USER_AGENT || "Hitazo/0.1 ( claude1@rollpix.com )";
const FIX = process.argv[2] === "fix";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const deburr = (x) => x.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const cleanTitle = (t) => t.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s-\s.*$/, " ").replace(/\s+/g, " ").trim();
const firstArtist = (a) => a.split(/[,&]|feat/i)[0].trim();
const songKey = (c) => {
  const base = deburr(c.title);
  const st = base.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s-\s.*$/, " ").replace(/[^a-z0-9]+/g, "");
  const t = st || base.replace(/[^a-z0-9]+/g, "");
  const a = deburr(c.artist.split(/[,&]|feat/i)[0]).replace(/[^a-z0-9]+/g, "");
  return `${t}|${a}`;
};
const parseYear = (d) => { if (!d) return null; const y = parseInt(String(d).slice(0, 4), 10); return Number.isFinite(y) ? y : null; };
async function mbEarliest(title, artist) {
  try {
    const q = `recording:"${cleanTitle(title)}" AND artist:"${firstArtist(artist)}"`;
    const res = await fetch(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=15`, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const data = await res.json();
    const ys = (data.recordings ?? []).map((r) => parseYear(r["first-release-date"])).filter(Boolean).sort((a, b) => a - b);
    return ys[0] ?? null;
  } catch { return null; }
}

// Traer todas las cartas jugables (paginado).
const all = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("ct_cards").select("id, title, artist, release_year, year_status, year_source")
    .in("year_status", ["resolved", "manual"]).not("release_year", "is", null).range(from, from + 999);
  if (error) { console.error(error); process.exit(1); }
  all.push(...(data ?? []));
  if (!data || data.length < 1000) break;
}

// Agrupar por canción y quedarnos con los grupos de años inconsistentes.
const groups = new Map();
for (const c of all) {
  const k = songKey(c);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}
const inconsistent = [...groups.values()].filter((g) => new Set(g.map((c) => c.release_year)).size > 1);

console.log(`Canciones jugables: ${all.length} | grupos duplicados con años distintos: ${inconsistent.length}\n`);

let fixed = 0;
for (const g of inconsistent) {
  const years = g.map((c) => c.release_year);
  const manuals = g.filter((c) => c.year_status === "manual").map((c) => c.release_year);

  let correct;
  let how;
  if (manuals.length) {
    correct = Math.min(...manuals); how = "manual";
  } else {
    const mb = FIX ? await mbEarliest(g[0].title, g[0].artist) : null;
    if (FIX) await sleep(1100);
    if (mb) { correct = mb; how = "MB"; }
    else { correct = Math.min(...years); how = "min"; }
  }

  console.log(`• ${g[0].artist} — ${g[0].title}`);
  console.log(`    años: [${years.join(", ")}]  →  ${correct} (${how})`);

  if (FIX) {
    for (const c of g) {
      if (c.release_year !== correct || c.year_status !== "manual") {
        await supabase.from("ct_cards").update({ release_year: correct, year_source: "manual", year_status: "manual" }).eq("id", c.id);
      }
    }
    fixed++;
  }
}

console.log(`\n${FIX ? `Corregidos ${fixed} grupos.` : "Modo detección (sin escribir). Corré con 'fix' para aplicar."}`);
