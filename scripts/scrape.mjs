/**
 * Hämtar tabeller, poängligor och spelscheman från stats.swehockey.se
 * och sparar dem som statiska JSON-filer i data/ (serveras av GitHub Pages).
 * Körs av .github/workflows/update-data.yml – eller lokalt: node scripts/scrape.mjs
 *
 * Kräver Node 20+ (inbyggd fetch). Inga beroenden.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { parseGameList, parseStandings, parseScorers } from '../parse.js';

const SRC = 'https://stats.swehockey.se';
const OUT = new URL('../site/data/', import.meta.url);
const PAUSE_MS = 1500; // var snäll mot swehockey: en sida i taget

const HIDDEN = JSON.parse(await readFile(new URL('../hidden.json', import.meta.url), 'utf8').catch(() => '[]'));
const leagues = JSON.parse(await readFile(new URL('../leagues.json', import.meta.url), 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function page(path) {
  const res = await fetch(SRC + path, { headers: { 'User-Agent': 'Islage/0.1 (hobbyprojekt)', 'Accept-Language': 'sv' } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  await sleep(PAUSE_MS);
  return res.text();
}
async function save(file, data) {
  const url = new URL(file, OUT);
  await mkdir(new URL('./', url), { recursive: true });
  await writeFile(url, JSON.stringify(data));
}

async function standings(id) {
  return parseStandings(await page(`/ScheduleAndResults/Standings/${id}`).catch(() => ''));
}

const index = { updated: new Date().toISOString(), leagues: [] };
let failed = 0;

for (const lg of leagues) {
  const result = { ...lg, ok: true };
  try {
    const [standings, scorers, games] = [
      await standings(lg.id),
      parseScorers(await page(`/Players/Statistics/ScoringLeaders/${lg.id}`).catch(() => ''), HIDDEN),
      parseGameList(await page(`/ScheduleAndResults/Schedule/${lg.id}`), { leagueId: lg.id, league: lg.name })
    ];
    // Skydd: skriv inte över bra data med tomt resultat om swehockey ändrat sin HTML
    if (!standings.length && !games.length) throw new Error('tomt resultat – kontrollera tolkarna i parse.js');
    await save(`${lg.id}/standings.json`, standings);
    await save(`${lg.id}/scorers.json`, scorers);
    await save(`${lg.id}/games.json`, games);
    console.log(`✓ ${lg.name}: ${standings.length} lag, ${scorers.length} spelare, ${games.length} matcher`);
  } catch (e) {
    failed++; result.ok = false;
    console.error(`✗ ${lg.name}: ${e.message}`);
  }
  index.leagues.push(result);
}

await save('index.json', index);
if (failed === leagues.length) process.exit(1); // allt misslyckades → markera körningen som fel
