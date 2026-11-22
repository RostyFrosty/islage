import { parseGame } from '../parse.js';
const [a, b, lid] = process.argv.slice(2);
const SRC = 'https://stats.swehockey.se', H = { 'User-Agent': 'Islage/0.2 (hobbyprojekt)' };
const raw = await (await fetch(`${SRC}/ScheduleAndResults/Live/${lid}`, { headers: H })).text();
let k = raw.indexOf(a); while (k >= 0 && !raw.slice(Math.max(0, k - 600), k + 600).includes(b)) k = raw.indexOf(a, k + 1);
console.log('CTX', raw.slice(Math.max(0, k - 1500), k + 1200).replace(/\s+/g, ' '));
const ids = [...raw.matchAll(/openonlinewindow\('\/Game\/Events\/(\d+)'/g)].map(m => m[1]);
console.log('IDS', [...new Set(ids)].join(','));
const near = raw.slice(Math.max(0, k - 3000), k + 3000).match(/Game\/Events\/(\d+)/g);
console.log('NEAR', near);
for (const id of [...new Set((near || []).map(x => x.split('/').pop()))]) { const d = parseGame(await (await fetch(`${SRC}/Game/Events/${id}`, { headers: H })).text(), id); console.log('PARSED', id, d.home, '-', d.away, JSON.stringify({ status: d.status, clock: d.clock, hs: d.hs, as: d.as, ev: d.events.length })); }
console.log('STRUCT', (raw.match(/<(table|div)[^>]*class="[^"]*"/g) || []).slice(20, 40).join(' '));
