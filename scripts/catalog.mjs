/**
 * Bygger data/catalog.json – alla serier/grupper i Sverige för aktuell säsong.
 *
 * Swehockeys struktur (verifierad 2026-11-13):
 *   Menyn på varje sida  → nationella serier, regionala serier och 22 distrikts samlingssidor
 *   Distriktssida        → rullista med distriktets serier ("U14P", "U16F" …), cuper efter "Cups"
 *   Seriesida            → rullista med seriens grupper ("U14P Grundserie 1–4", "Fortsättningsserie A–D")
 * Varje grupp blir en rad i katalogen (den har egen tabell, eget schema och egen poängliga).
 *
 * Cirka 500–600 sidhämtningar, 3 åt gången med paus → några minuter.
 * Kör: node scripts/catalog.mjs   (eller via .github/workflows/update-catalog.yml)
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { parseMenu, parseSelects, parseGameList, decode } from '../parse.js';

const SRC = 'https://stats.swehockey.se';
const PARALLEL = 3, PAUSE_MS = 400;
const SKIP = /träningsmatch|preseason|preseson|preaseason|försäsong|camps|distriktslag|landskamp|veteran|rekreation|paraishockey|inline/i;
const OUT = new URL('../site/data/catalog.json', import.meta.url);
const TEAMS_OUT = new URL('../site/data/teams.json', import.meta.url);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function page(path) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(SRC + path, { headers: { 'User-Agent': 'Islage/0.2 (hobbyprojekt)', 'Accept-Language': 'sv' } });
      if (res.ok) return await res.text();
      if (res.status === 404) return '';
    } catch {}
    await sleep(1500 * (i + 1));
  }
  return '';
}
/** Översiktssidan saknar rullistor för vissa serier (t.ex. Blekinge, Hälsingland, Västmanland) – då har schemasidan dem. */
async function leaguePage(id) {
  const html = await page(`/ScheduleAndResults/Overview/${id}`);
  return /<select/i.test(html) ? html : (await page(`/ScheduleAndResults/Schedule/${id}`)) || html;
}
async function pool(items, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n]); await sleep(PAUSE_MS); }
  }));
  return out;
}
/** Säsong för en sida = texten i säsongslistan för sidans eget ID, t.ex. "2026-27". */
function seasonOf(html, id) {
  for (const s of html.matchAll(/<select[^>]*>([\s\S]*?)<\/select>/gi)) {
    for (const o of s[1].matchAll(/<option[^>]*value="[^"]*\/(\d+)"[^>]*>\s*(\d{4}-\d{2})\s*<\/option>/gi)) if (o[1] === id) return o[2];
  }
  return null;
}

export function classify(name, gender = 'H') {
  const n = decode(name).toUpperCase();
  const age = (n.match(/\b[UJF]\s?(\d{1,2})(?!\d)/) || [])[1];
  let g = gender;
  if (/\bU\d{1,2}(\/U\d{1,2})?\s?F\b|\bF\d{2}\b|FLICK|\bDAM|SDHL|NDHL|U19 DAM|\bTKH F/.test(n)) g = 'F';
  else if (/\bU\d{1,2}\s?P\b|POJK|\bTKH P/.test(n)) g = 'P';
  else if (age && +age <= 16 && g === 'H') g = 'P';
  return { age: age ? +age : null, gender: g, kind: age && +age <= 20 ? 'ungdom' : 'senior' };
}

console.log('Läser menyn …');
const menu = parseMenu(await page('/District/Skane'));
console.log(`  ${menu.national.length} nationella, ${menu.regional.length} regionala, ${menu.districts.length} distrikt`);

const families = [
  ...menu.national.map(f => ({ ...f, area: 'Nationell', region: '' })),
  ...menu.regional.map(f => ({ ...f, area: f.region, region: f.region })),
];
console.log('Läser distriktens serielistor …');
await pool(menu.districts, async d => {
  const sel = parseSelects(await leaguePage(d.id));
  for (const f of sel.families) families.push({ id: f.id, name: f.name, gender: 'H', area: d.name, region: d.region });
  console.log(`  ${d.name}: ${sel.families.length} serier`);
});

const fams = [...new Map(families.map(f => ({ ...f, name: decode(f.name) })).filter(f => !SKIP.test(f.name)).map(f => [f.id, f])).values()];
console.log(`Läser grupperna i ${fams.length} serier …`);

// Aktuell säsong = SHL:s säsong, t.ex. "2026-27"
const season = seasonOf(await page('/ScheduleAndResults/Overview/20961'), '20961') || '';
const Y = +season.slice(0, 4) || new Date().getFullYear() - (new Date().getMonth() < 7 ? 1 : 0);
const curDate = new RegExp(`\\b(${Y}-(0[89]|1[0-2])|${Y + 1}-0[1-7])-\\d\\d\\b`);
const leaves = new Map(); let old = 0;
await pool(fams, async f => {
  const html = await leaguePage(f.id);
  if (!html) return;
  const own = seasonOf(html, f.id), main = html.slice(html.indexOf('TSMstats'));
  const groups = parseSelects(html).groups.map(g => ({ id: g.id, name: decode(g.name) })).filter(g => !SKIP.test(g.name));
  // Gamla serier ligger kvar i distriktens listor. Aktuell om sidans säsong stämmer, eller om den har
  // datum från säsongen, eller om den har grupper och ett nytt ID. Nationella menyn räknas alltid som aktuell.
  const current = own ? own === season : (f.area === 'Nationell' || curDate.test(main) || (groups.length > 0 && +f.id >= 20500));
  if (!current) { old++; return; }
  const list = groups.length ? groups : [{ id: f.id, name: f.name }];
  for (const g of list) {
    const first = f.name.split(' ')[0];
    const name = g.name === f.name || g.name.includes(first) ? g.name : `${f.name} · ${g.name}`;
    leaves.set(g.id, { id: g.id, name, family: f.name, district: decode(f.area), region: f.region, ...classify(g.name.includes(f.name) ? g.name : `${f.name} ${g.name}`, f.gender) });
  }
});
console.log(`  ${old} gamla serier hoppades över`);

const TOP = { '20961': 0, '20962': 1, '21041': 2, '20960': 3 };
const series = [...leaves.values()].sort((a, b) =>
  (a.district === 'Nationell' ? -1 : b.district === 'Nationell' ? 1 : a.district.localeCompare(b.district, 'sv'))
  || (TOP[a.id] ?? 9) - (TOP[b.id] ?? 9) || (a.age ?? 99) - (b.age ?? 99) || a.name.localeCompare(b.name, 'sv'));
const current = season;

/* Lagregister: lagnamn → serier där laget spelar. Appen följer ett favoritlag i alla serier i samma
   åldersklass – även nya serier (fortsättningsserier, DM) när katalogen uppdateras. */
console.log(`Läser lagen i ${series.length} serier …`);
const teams = {}; let noTeams = 0;
await pool(series, async s => {
  const games = parseGameList(await page(`/ScheduleAndResults/Schedule/${s.id}`), { leagueId: s.id });
  const names = new Set(games.flatMap(g => [g.home, g.away]).filter(Boolean).map(n => decode(n).trim()));
  if (!names.size) noTeams++;
  for (const n of names) (teams[n] ||= []).push(s.id);
});
const sortedTeams = Object.fromEntries(Object.keys(teams).sort((a, b) => a.localeCompare(b, 'sv')).map(k => [k, teams[k].sort()]));
console.log(`  ${Object.keys(sortedTeams).length} lag, ${noTeams} serier utan schema`);

await mkdir(new URL('./', OUT), { recursive: true });
if (Object.keys(sortedTeams).length > 100) await writeFile(TEAMS_OUT, JSON.stringify({ season: current, updated: new Date().toISOString(), teams: sortedTeams }));
await writeFile(OUT, JSON.stringify({ season: current, updated: new Date().toISOString(), count: series.length, series }));
console.log(`✓ ${series.length} serier/grupper för säsongen ${current}`);
if (series.length < 50) { console.error('För få serier – har swehockey ändrat sidorna? Kontrollera parse.js.'); process.exit(1); }
