// Revisión por lotes de los años ya cargados.
// Recorre todas las cartas jugables (resolved/manual con release_year), reconsulta
// el año en MusicBrainz (ISRC + título/artista) y Deezer, y reporta discrepancias.
// READ-ONLY: no escribe en la base. Genera scripts/years-report.csv + resumen en consola.
//
// Uso: node scripts/validate-years.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- env ---
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const UA = env.MUSICBRAINZ_USER_AGENT || "Hitazo/0.1 ( claude1@rollpix.com )";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parseYear = (d) => {
  if (!d) return null;
  const y = parseInt(String(d).slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
};

// fetch con reintentos: aguanta timeouts/red transitorios (un run largo pega varios).
async function fetchJson(url, opts = {}, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 503 || res.status === 429) { await sleep(2000); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(2000);
    }
  }
  return null;
}
const yearsFrom = (recordings) =>
  [...new Set((recordings ?? []).map((r) => parseYear(r["first-release-date"])).filter(Boolean))].sort((a, b) => a - b);

async function mbByIsrc(isrc) {
  const data = await fetchJson(`https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}?inc=recordings&fmt=json`, { headers: { "User-Agent": UA } });
  return yearsFrom(data?.recordings);
}

async function mbByTitleArtist(title, artist) {
  const q = `recording:"${title}" AND artist:"${artist}"`;
  const data = await fetchJson(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=15`, { headers: { "User-Agent": UA } });
  return yearsFrom(data?.recordings);
}

async function deezerYear(title, artist) {
  const q = `artist:"${artist}" track:"${title}"`;
  const sb = await fetchJson(`https://api.deezer.com/search?limit=1&q=${encodeURIComponent(q)}`);
  const albumId = sb?.data?.[0]?.album?.id;
  if (!albumId) return null;
  const alb = await fetchJson(`https://api.deezer.com/album/${albumId}`);
  return parseYear(alb?.release_date);
}

const supabase = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { data: cards, error } = await supabase
  .from("ct_cards")
  .select("id, title, artist, isrc, release_year, year_status")
  .in("year_status", ["resolved", "manual"])
  .not("release_year", "is", null)
  .order("artist", { ascending: true });
if (error) { console.error(error); process.exit(1); }

console.log(`Revisando ${cards.length} cartas jugables...\n`);

const rows = [];
let i = 0;
for (const c of cards) {
  i++;
  const mbi = c.isrc ? await mbByIsrc(c.isrc) : [];
  await sleep(1100);
  const mbt = await mbByTitleArtist(c.title, c.artist);
  await sleep(1100);
  const dz = await deezerYear(c.title, c.artist);
  await sleep(150);

  const mbAll = [...new Set([...mbi, ...mbt])].sort((a, b) => a - b);
  const sources = [...mbAll, dz].filter((y) => y != null);
  const cur = c.release_year;
  // corroborado si el año actual aparece en alguna fuente
  const corroborated = sources.includes(cur);
  // señal fuerte: MB(min) y Deezer coinciden en un año != actual
  const mbMin = mbAll.length ? mbAll[0] : null;
  const consensus = mbMin != null && dz != null && mbMin === dz ? mbMin : null;
  const strongMismatch = consensus != null && consensus !== cur;

  const flag = strongMismatch ? "FUERTE" : !corroborated && sources.length > 0 ? "revisar" : corroborated ? "ok" : "sin-fuente";
  rows.push({ ...c, mbAll, dz, mbMin, consensus, corroborated, flag });

  const tag = flag === "FUERTE" ? "🔴" : flag === "revisar" ? "🟡" : flag === "sin-fuente" ? "⚪" : "🟢";
  console.log(`${tag} [${i}/${cards.length}] ${c.artist} — ${c.title} | actual:${cur} MB:[${mbAll.join(",")}] DZ:${dz ?? "—"} ${flag === "ok" ? "" : `→ ${flag}`}`);
}

// orden: FUERTE, revisar, sin-fuente, ok
const rank = { FUERTE: 0, revisar: 1, "sin-fuente": 2, ok: 3 };
rows.sort((a, b) => rank[a.flag] - rank[b.flag]);

const csv = ["id,flag,artist,title,status,current_year,mb_candidates,deezer_year,consensus"]
  .concat(rows.map((r) =>
    [r.id, r.flag, `"${r.artist.replace(/"/g, "'")}"`, `"${r.title.replace(/"/g, "'")}"`, r.year_status, r.release_year, `"${r.mbAll.join(" ")}"`, r.dz ?? "", r.consensus ?? ""].join(",")
  ))
  .join("\n");
writeFileSync(new URL("./years-report.csv", import.meta.url), csv, "utf8");

const n = (f) => rows.filter((r) => r.flag === f).length;
console.log(`\n===== RESUMEN =====`);
console.log(`🔴 FUERTE (MB+Deezer coinciden en otro año): ${n("FUERTE")}`);
console.log(`🟡 revisar (año actual no corrobora ninguna fuente): ${n("revisar")}`);
console.log(`⚪ sin-fuente (no se halló nada): ${n("sin-fuente")}`);
console.log(`🟢 ok (corroborado): ${n("ok")}`);
console.log(`\nReporte completo: scripts/years-report.csv`);
