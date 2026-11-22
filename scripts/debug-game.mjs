import { parseLivePage } from '../parse.js';
const [, , lid] = process.argv.slice(2);
const r = parseLivePage(await (await fetch(`https://stats.swehockey.se/ScheduleAndResults/Live/${lid}`, { headers: { 'User-Agent': 'Islage/0.2 (hobbyprojekt)' } })).text());
console.log('LIVEPAGE', r.length); for (const g of r) console.log(JSON.stringify(g));
