// Tillfällig felsökning: var finns länken till dagens match?
import { parseGame } from '../parse.js';
const [a, b, lid] = process.argv.slice(2);
const SRC = 'https://stats.swehockey.se', H = { 'User-Agent': 'Islage/0.2 (hobbyprojekt)' };
for (const path of [`/ScheduleAndResults/Schedule/${lid}`, `/ScheduleAndResults/Live/${lid}`, `/ScheduleAndResults/Overview/${lid}`]) {
  const raw = await (await fetch(SRC + path, { headers: H })).text();
  let k = raw.indexOf(a); while (k >= 0 && !raw.slice(Math.max(0, k - 600), k + 600).includes(b)) k = raw.indexOf(a, k + 1);
  console.log('\n==', path, raw.length, k >= 0 ? '' : 'INGEN TRÄFF');
  if (k >= 0) {
    const row = raw.slice(raw.lastIndexOf('<tr', k), raw.indexOf('</tr>', k) + 5).replace(/\s+/g, ' ');
    console.log(row.slice(0, 1500));
    const id = (row.match(/Game\/(?:Events|LineUps)\/(\d+)/) || row.match(/(\d{7})/) || [])[1];
    if (id) { const d = parseGame(await (await fetch(`${SRC}/Game/Events/${id}`, { headers: H })).text(), id); console.log('PARSED', id, JSON.stringify({ status: d.status, clock: d.clock, hs: d.hs, as: d.as, ev: d.events.length })); }
  }
  console.log('länkar till Game:', [...new Set([...raw.matchAll(/Game\/(\w+)\/(\d+)/g)].map(m => m[1]))].join(','), ' onclick/js:', (raw.match(/openGame|javascript:[^"]{0,60}/g) || []).slice(0, 3).join(' | '));
}
