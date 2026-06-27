// Segundo intento para cartas 'needs_review': reintenta en MusicBrainz con el título
// LIMPIO (sin sufijos "- Remaster", "(feat...)", etc.) y, si no aparece, cae a Deezer.
// Scope: las listas pasadas por args (default: Mariano, Magui, Ari). Escribe en la base.
//
// Uso: node scripts/reresolve-review.mjs            (las 3 listas)
//      node scripts/reresolve-review.mjs all        (todo el needs_review)
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
const cleanTitle = (t) => t.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s-\s.*$/, " ").replace(/\s+/g, " ").trim();
const firstArtist = (a) => a.split(/[,&]|feat/i)[0].trim();

async function fetchJson(url, opts = {}, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 503 || res.status === 429) { await sleep(2000); continue; }
      if (!res.ok) return null;
      return await res.json();
    } catch { await sleep(2000); }
  }
  return null;
}
const yearsFrom = (recs) => [...new Set((recs ?? []).map((r) => parseYear(r["first-release-date"])).filter(Boolean))].sort((a, b) => a - b);

async function mbByIsrc(isrc) {
  const d = await fetchJson(`https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}?inc=recordings&fmt=json`, { headers: { "User-Agent": UA } });
  return yearsFrom(d?.recordings);
}
async function mbByTitleArtist(title, artist) {
  const q = `recording:"${title}" AND artist:"${firstArtist(artist)}"`;
  const d = await fetchJson(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=15`, { headers: { "User-Agent": UA } });
  return yearsFrom(d?.recordings);
}
async function deezerYear(title, artist) {
  const q = `artist:"${firstArtist(artist)}" track:"${cleanTitle(title)}"`;
  const sb = await fetchJson(`https://api.deezer.com/search?limit=1&q=${encodeURIComponent(q)}`);
  const albumId = sb?.data?.[0]?.album?.id;
  if (!albumId) return null;
  const alb = await fetchJson(`https://api.deezer.com/album/${albumId}`);
  return parseYear(alb?.release_date);
}

// --- seleccionar cartas needs_review ---
const args = process.argv.slice(2);
let cardIds = null;
if (args[0] !== "all") {
  const patterns = args.length ? args : ["Mariano", "Magui", "Ari"];
  const or = patterns.map((p) => `name.ilike.%${p}%`).join(",");
  const { data: decks } = await supabase.from("ct_deck_filters").select("id,name").or(or);
  console.log("Listas:", decks.map((d) => d.name).join(" | "));
  const { data: links } = await supabase.from("ct_card_filters").select("card_id").in("filter_id", decks.map((d) => d.id));
  cardIds = [...new Set(links.map((l) => l.card_id))];
}

let q = supabase.from("ct_cards").select("id, isrc, title, artist").eq("year_status", "needs_review");
if (cardIds) q = q.in("id", cardIds);
const { data: cards, error } = await q;
if (error) { console.error(error); process.exit(1); }

console.log(`Reintentando ${cards.length} cartas needs_review (MB título limpio + Deezer)...\n`);

let mbOk = 0, dzOk = 0, still = 0;
for (let i = 0; i < cards.length; i++) {
  const c = cards[i];
  // 1) MB por ISRC, 2) MB por título LIMPIO + artista
  let cands = c.isrc ? await mbByIsrc(c.isrc) : [];
  await sleep(1100);
  if (!cands.length) { cands = await mbByTitleArtist(cleanTitle(c.title), c.artist); await sleep(1100); }

  if (cands.length) {
    await supabase.from("ct_cards").update({ release_year: cands[0], year_source: "musicbrainz", year_status: "resolved", mb_candidates: cands }).eq("id", c.id);
    mbOk++;
    console.log(`✅MB [${i + 1}/${cards.length}] ${c.artist} — ${c.title} → ${cands[0]}`);
    continue;
  }
  // 3) Deezer como último recurso (puede ser año de reedición → revisar después)
  const dz = await deezerYear(c.title, c.artist);
  await sleep(200);
  if (dz) {
    await supabase.from("ct_cards").update({ release_year: dz, year_source: "deezer", year_status: "resolved" }).eq("id", c.id);
    dzOk++;
    console.log(`🟡DZ [${i + 1}/${cards.length}] ${c.artist} — ${c.title} → ${dz} (Deezer)`);
  } else {
    still++;
    console.log(`❌   [${i + 1}/${cards.length}] ${c.artist} — ${c.title} (sigue sin año)`);
  }
}

console.log(`\n===== RESUMEN =====\n✅ resueltas por MusicBrainz: ${mbOk}\n🟡 resueltas por Deezer (revisar): ${dzOk}\n❌ siguen sin año: ${still}`);
