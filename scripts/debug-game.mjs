// Tillfällig felsökning: hittar dagens match för två lag och visar hur den tolkas.
import { parseGameList, parseGame } from '../parse.js';
const [a, b] = process.argv.slice(2);
const SRC = 'https://stats.swehockey.se', H = { 'User-Agent': 'Islage/0.2 (hobbyprojekt)' };
const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const list = parseGameList(await (await fetch(`${SRC}/GamesByDate/${date}/ByTime/null`, { headers: H })).text(), { date });
const hits = list.filter(g => (g.home + g.away).includes(a) && (g.home + g.away).includes(b));
console.log('LIST', JSON.stringify(hits, null, 1));
for (const g of hits) {
  if (!/^\d+$/.test(g.id)) { console.log('ingen Game/Events-länk för', g.id); continue; }
  const html = await (await fetch(`${SRC}/Game/Events/${g.id}`, { headers: H })).text();
  const d = parseGame(html, g.id);
  console.log('PARSED', JSON.stringify({ status: d.status, clock: d.clock, hs: d.hs, as: d.as, periods: d.periods, events: d.events.length }));
  const i = html.indexOf('tdInfoArea');
  console.log('INFO', html.slice(i - 200, i + 900).replace(/\s+/g, ' '));
}
// även raden i GamesByDate
const raw = await (await fetch(`${SRC}/GamesByDate/${date}/ByTime/null`, { headers: H })).text();
const j = raw.indexOf(a); let k = j; while (k >= 0 && !raw.slice(k, k + 400).includes(b)) k = raw.indexOf(a, k + 1);
if (k >= 0) console.log('ROW', raw.slice(raw.lastIndexOf('<tr', k), raw.indexOf('</tr>', k) + 5).replace(/\s+/g, ' '));
