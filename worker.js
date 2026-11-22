/**
 * Isläge API – Cloudflare Worker
 * Hämtar sidor från stats.swehockey.se, tolkar HTML → JSON, cachar och lägger på CORS.
 *
 *   GET /api/games?date=YYYY-MM-DD      alla matcher i Sverige en dag   ← /GamesByDate/{date}/ByTime/null
 *   GET /api/league/{id}/games          gruppens schema och resultat    ← /ScheduleAndResults/Schedule/{id}
 *   GET /api/league/{id}/standings      tabell                          ← /ScheduleAndResults/Standings/{id}
 *   GET /api/league/{id}/scorers        poängliga                       ← /Players/Statistics/ScoringLeaders/{id}
 *   GET /api/league/{id}/groups         seriens övriga grupper          ← /ScheduleAndResults/Overview/{id}
 *   GET /api/game/{id}                  matchrapport                    ← /Game/Events/{id}
 *   GET /api/game/{id}/lineup           laguppställning                 ← /Game/LineUps/{id}
 *
 * Allt annat (appen, data/catalog.json …) serveras från mappen site/ via ASSETS (wrangler.jsonc).
 * Adresser och tolkning verifierade mot riktiga sidor 2026-11-13.
 */
import HIDDEN from './hidden.json';
import { attachStreams } from './streams.js';
import { parseGameList, parseStandings, parseScorers, parseGame, parseSelects, parseLineups } from './parse.js';

const SRC = 'https://stats.swehockey.se';
const TTL = { live: 20, day: 120, league: 600, final: 3600 };
const LIVE_CHECKS = 30;
const FINALS = new Map();   // match-ID → slutresultat, så att färdiga matcher inte kontrolleras igen   // max antal matchrapporter som kontrolleras per anrop (Workers har gräns för antal hämtningar)

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    const url = new URL(req.url);
    const p = url.pathname.split('/').filter(Boolean);
    try {
      if (p[0] !== 'api') return env.ASSETS ? env.ASSETS.fetch(req) : json({ error: 'not found' }, 404);

      if (p[1] === 'games') {
        const date = url.searchParams.get('date') || today();
        const isToday = date === today();
        const games = parseGameList(await get(`/GamesByDate/${date}/ByTime/null`, isToday ? TTL.live : TTL.day, ctx), { date });
        if (isToday) await checkLive(games, ctx);
        await attachStreams(games, date, (u, ttl) => getJson(u, ttl, ctx));
        return json(games, 200, isToday ? TTL.live : TTL.day);
      }
      if (p[1] === 'league' && /^\d+$/.test(p[2] || '')) {
        const id = p[2];
        if (p[3] === 'games')     return json(parseGameList(await get(`/ScheduleAndResults/Schedule/${id}`, TTL.league, ctx), { leagueId: id }), 200, TTL.league);
        if (p[3] === 'standings') return json(parseStandings(await get(`/ScheduleAndResults/Standings/${id}`, TTL.league, ctx)), 200, TTL.league);
        if (p[3] === 'scorers')   return json(parseScorers(await get(`/Players/Statistics/ScoringLeaders/${id}`, TTL.league, ctx), HIDDEN), 200, TTL.league);
        if (p[3] === 'groups')    return json(parseSelects(await get(`/ScheduleAndResults/Overview/${id}`, TTL.final, ctx)).groups, 200, TTL.final);
      }
      if (p[1] === 'game' && /^\d+$/.test(p[2] || '') && p[3] === 'lineup') {
        const lu = parseLineups(await get(`/Game/LineUps/${p[2]}`, TTL.league, ctx), HIDDEN);
        return json(lu, 200, lu.available ? TTL.league : TTL.live);
      }
      if (p[1] === 'game' && /^\d+$/.test(p[2] || '')) {
        const game = parseGame(await get(`/Game/Events/${p[2]}`, TTL.live, ctx), p[2]);
        if (game.date) await attachStreams([game], game.date, (u, ttl) => getJson(u, ttl, ctx));
        return json(game, 200, game.status === 'final' ? TTL.final : TTL.live);
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  }
};

/** Dagens datum i Sverige */
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const nowMinutes = () => { const [h, m] = new Date().toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour12: false }).split(':'); return +h * 60 + +m; };

/**
 * GamesByDate visar inte om en match pågår. Matcher som startat de senaste 3,5 timmarna
 * kontrolleras mot matchrapporten, som har status ("Final Score" eller periodtext).
 */
async function checkLive(games, ctx) {
  const now = nowMinutes();
  const started = g => { const [h, m] = (g.time || '').split(':').map(Number); if (isNaN(h)) return false; const t = h * 60 + m; return t <= now && now - t < 210; };
  const startMin = g => { const [h, m] = g.time.split(':').map(Number); return h * 60 + m; };
  /* färdiga matcher kommer vi ihåg (per Worker-instans), så kontrollerna räcker till dem som kan pågå */
  for (const g of games) { const f = FINALS.get(g.id); if (f) Object.assign(g, f); }
  const candidates = games.filter(g => /^\d+$/.test(g.id) && g.status !== 'cancelled' && g.status !== 'final' && !FINALS.has(g.id) && started(g))
    .sort((a, b) => startMin(b) - startMin(a))      /* senast startade först – mest troligt att de pågår */
    .slice(0, LIVE_CHECKS);
  await Promise.all(candidates.map(async g => {
    try {
      const d = parseGame(await get(`/Game/Events/${g.id}`, TTL.live, ctx), g.id);
      g.status = d.status; g.clock = d.clock;
      if (d.hs != null) { g.hs = d.hs; g.as = d.as; g.periods = d.periods; }
      if (d.status === 'final') { FINALS.set(g.id, { status: 'final', clock: null, hs: d.hs, as: d.as, periods: d.periods }); if (FINALS.size > 5000) FINALS.delete(FINALS.keys().next().value); }
    } catch { /* behåll det vi har */ }
  }));
}

/* ---------------- hämtning + cache ---------------- */
async function get(path, ttl, ctx) {
  const cache = caches.default, key = new Request(SRC + path);
  let res = await cache.match(key);
  if (!res) {
    res = await fetch(SRC + path, { headers: { 'User-Agent': 'Islage/0.2 (hobbyprojekt)', 'Accept-Language': 'sv' } });
    if (!res.ok) throw new Error(`swehockey ${res.status}`);
    res = new Response(res.body, res);
    res.headers.set('Cache-Control', `public, max-age=${ttl}`);
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res.text();
}
async function getJson(url, ttl, ctx) {
  const cache = caches.default, key = new Request(url);
  let res = await cache.match(key);
  if (!res) {
    res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    res = new Response(res.body, res); res.headers.set('Cache-Control', `public, max-age=${ttl}`);
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res.json();
}
const cors = r => { r.headers.set('Access-Control-Allow-Origin', '*'); r.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS'); return r; };
const json = (d, s = 200, ttl = 0) => cors(new Response(JSON.stringify(d), {
  status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` }
}));
