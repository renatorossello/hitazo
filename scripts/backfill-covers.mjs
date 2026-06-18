// Completa cover_url de las cartas que quedaron sin imagen, buscando la carátula
// del álbum en Deezer (búsqueda pública por artista+título). Escribe en la base.
//
// Uso: node scripts/backfill-covers.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Limpia sufijos que ensucian la búsqueda ("- 2013 Remaster", "- Live", "(feat. ...)").
const cleanTitle = (t) => t.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s-\s.*$/, " ").trim();
const firstArtist = (a) => a.split(/[,&]|feat/i)[0].trim();

async function findCover(title, artist) {
  const a = firstArtist(artist);
  const queries = [
    `artist:"${a}" track:"${cleanTitle(title)}"`, // estricta
    `${cleanTitle(title)} ${a}`,                    // suelta
  ];
  for (const q of queries) {
    try {
      const res = await fetch(`https://api.deezer.com/search?limit=1&q=${encodeURIComponent(q)}`);
      const body = await res.json().catch(() => ({}));
      const album = body?.data?.[0]?.album;
      const cover = album?.cover_big || album?.cover_medium || album?.cover;
      if (cover) return cover;
    } catch { /* sigue con la próxima query */ }
    await sleep(120);
  }
  return null;
}

const { data: cards, error } = await supabase
  .from("ct_cards")
  .select("id, title, artist")
  .is("cover_url", null)
  .order("artist", { ascending: true });
if (error) { console.error(error); process.exit(1); }

console.log(`Completando carátulas de ${cards.length} cartas sin imagen...\n`);

let ok = 0, miss = 0;
for (let i = 0; i < cards.length; i++) {
  const c = cards[i];
  const cover = await findCover(c.title, c.artist);
  if (cover) {
    const { error: upErr } = await supabase.from("ct_cards").update({ cover_url: cover }).eq("id", c.id);
    if (upErr) { console.log(`⚠️  [${i + 1}/${cards.length}] ${c.artist} — ${c.title}: error al guardar (${upErr.message})`); miss++; }
    else { ok++; console.log(`✅ [${i + 1}/${cards.length}] ${c.artist} — ${c.title}`); }
  } else {
    miss++;
    console.log(`❌ [${i + 1}/${cards.length}] ${c.artist} — ${c.title} (sin resultado en Deezer)`);
  }
  await sleep(120);
}

console.log(`\n===== RESUMEN =====\n✅ completadas: ${ok}\n❌ sin imagen: ${miss}`);
