/**
 * Kopplar swehockey-matcher till sändningar på svenskhockey.tv.
 *
 * Läget 2026-11-13: svenskhockey.tv drivs av LiveArena. Deras matchlista ligger i ett
 * privat API (api.livearenasports.com, site-id SIF) som kräver en token. Det använder vi
 * INTE utan tillstånd. Kontakta LiveArena eller Svenska Ishockeyförbundet och fråga om ett
 * partnerflöde eller en öppen schemafil. Tills dess länkar appen till svenskhockey.tv:s startsida.
 *
 * När ni har ett godkänt flöde: sätt SCHEDULE_URL, anpassa toItem() och GAME_URL.
 * Matchningen (datum + tid ±45 min + normaliserade lagnamn) är klar och testad.
 */
export const SCHEDULE_URL = null;  // t.ex. 'https://…livearenasports…/api/…?date={date}'
export const GAME_URL = id => `https://www.svenskhockey.tv/sv/broadcast/${id}`; // sändningssidornas mönster, verifiera med godkänt flöde

/** Gör om ett objekt från svenskhockey.tv:s schema till { id, start(Date), home, away, live }. */
function toItem(raw) {
  return {
    id: raw.id ?? raw._id,
    start: new Date(raw.startTime ?? raw.start ?? raw.date),
    home: raw.homeTeam?.name ?? raw.home?.name ?? raw.homeTeamName ?? '',
    away: raw.awayTeam?.name ?? raw.away?.name ?? raw.awayTeamName ?? '',
    live: !!(raw.isLive ?? raw.live ?? raw.status === 'live')
  };
}

/* "IF Malmö Redhawks U16" / "Malmö Redhawks" → "malmo redhawks" */
const STOP = /\b(if|ik|hc|bk|sk|hk|is|hf|aif|ishf|ishockeyklubb|hockey|ungdom|u\d+\w*|j\d+|vit|bl[aå]|r[oö]d|gr[oö]n|svart|gul|\d)\b/g;
export const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(STOP, ' ').replace(/\s+/g, ' ').trim();
// "AIK" blir tomt efter normalisering → använd då hela namnet
const same = (a, b) => { const x = norm(a) || a.toLowerCase(), y = norm(b) || b.toLowerCase(); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

/** Hittar sändning för en match. */
export function findStream(game, items) {
  const kick = new Date(`${game.date}T${game.time || '12:00'}:00+01:00`); // ⚠ sommartid: +02:00
  const hit = items.find(it => same(game.home, it.home) && same(game.away, it.away)
    && Math.abs(it.start - kick) <= 45 * 60 * 1000);
  return hit ? { url: GAME_URL(hit.id), live: hit.live } : null;
}

/** Lägger på game.stream för alla matcher en dag. fetchJson = (url, ttl) => Promise<json>. */
export async function attachStreams(games, date, fetchJson) {
  if (!SCHEDULE_URL) return games;
  try {
    const raw = await fetchJson(SCHEDULE_URL.replace('{date}', date), 300);
    const items = (Array.isArray(raw) ? raw : raw.items ?? raw.data ?? raw.events ?? []).map(toItem);
    for (const g of games) g.stream = findStream(g, items);
  } catch { /* svenskhockey.tv nere → visa matcherna ändå, utan TV-länkar */ }
  return games;
}
