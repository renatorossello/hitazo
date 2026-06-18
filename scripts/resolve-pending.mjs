// Resuelve los años de las cartas 'pending' contra MusicBrainz (ISRC o título+artista),
// respetando 1 req/seg. Replica resolvePendingBatch pero sin depender del navegador.
// Escribe en la base: pending -> resolved (con año) o needs_review.
//
// Uso: node scripts/resolve-pending.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UA = env.MUSICBRAINZ_USER_AGENT || "Hitazo/0.1 ( claude1@rollpix.com )";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parseYear = (d) => { if (!d) return null; const y = parseInt(String(d).slice(0, 4), 10); return Number.isFinite(y) ? y : null; };

// Devuelve { candidates } o null si la red falló (para NO marcar la carta y dejarla pending).
async function mbFetch(url, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 503) { await sleep(2000); continue; }
      if (!res.ok) return { ok: true, recordings: [] };
      const data = await res.json();
      return { ok: true, recordings: data.recordings ?? [] };
    } catch {
      await sleep(2000); // timeout/red: esperar y reintentar
    }
  }
  return { ok: false, recordings: [] }; // falló la red: avisamos para dejar pending
}
const yearsFrom = (recordings) =>
  [...new Set(recordings.map((r) => parseYear(r["first-release-date"])).filter(Boolean))].sort((a, b) => a - b);

async function mbByIsrc(isrc) {
  const r = await mbFetch(`https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}?inc=recordings&fmt=json`);
  return { ok: r.ok, candidates: yearsFrom(r.recordings) };
}
async function mbByTitleArtist(title, artist) {
  const q = `recording:"${title}" AND artist:"${artist}"`;
  const r = await mbFetch(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=15`);
  return { ok: r.ok, candidates: yearsFrom(r.recordings) };
}

const { data: pending, error } = await supabase
  .from("ct_cards")
  .select("id, isrc, title, artist")
  .eq("year_status", "pending");
if (error) { console.error(error); process.exit(1); }

console.log(`Resolviendo ${pending.length} pendientes contra MusicBrainz (1/seg)...\n`);

let resolved = 0, review = 0, skipped = 0;
for (let i = 0; i < pending.length; i++) {
  const c = pending[i];
  const r = c.isrc ? await mbByIsrc(c.isrc) : await mbByTitleArtist(c.title, c.artist);
  await sleep(1100); // rate limit MusicBrainz

  if (!r.ok) {
    // La red falló tras reintentar: dejamos la carta en 'pending' para reanudar después.
    skipped++;
    console.log(`⏭️  [${i + 1}/${pending.length}] ${c.artist} — ${c.title} → red falló, queda pending`);
    continue;
  }

  const candidates = r.candidates;
  const year = candidates.length ? candidates[0] : null;
  if (year !== null) {
    await supabase.from("ct_cards").update({ release_year: year, year_source: "musicbrainz", year_status: "resolved", mb_candidates: candidates }).eq("id", c.id);
    resolved++;
    console.log(`✅ [${i + 1}/${pending.length}] ${c.artist} — ${c.title} → ${year}  [${candidates.join(",")}]`);
  } else {
    await supabase.from("ct_cards").update({ year_status: "needs_review", mb_candidates: candidates }).eq("id", c.id);
    review++;
    console.log(`🟡 [${i + 1}/${pending.length}] ${c.artist} — ${c.title} → needs_review`);
  }
}

console.log(`\n===== RESUMEN =====\n✅ resueltas: ${resolved}\n🟡 a needs_review: ${review}\n⏭️  pending (red falló): ${skipped}`);
