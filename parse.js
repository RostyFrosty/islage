/**
 * Tolkare för stats.swehockey.se – delas av worker.js och scripts/*.mjs.
 * Byggd och verifierad mot riktiga sidor 2026-11-13.
 *
 * Swehockey renderar tabeller med två kopior av vissa celler: en för mobil
 * (class "d-table-cell d-sm-none") och en för dator ("d-none d-sm-table-cell").
 * Mobilkopiorna kastas, så att kolumnerna stämmer med rubrikraden.
 * Workers saknar DOMParser, därför en liten egen tabelltolkare.
 */

/* ---------------- grundverktyg ---------------- */
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", aring: 'å', auml: 'ä', ouml: 'ö',
  Aring: 'Å', Auml: 'Ä', Ouml: 'Ö', eacute: 'é', Eacute: 'É', uuml: 'ü', Uuml: 'Ü', oslash: 'ø', aelig: 'æ' };
export const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
export const text = s => decode(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (a, name) => (a.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) || [])[1] || '';
/** "Lodin, Viktor" → "Viktor Lodin" */
export const flipName = n => { const m = n.match(/^([^,]+),\s*(.+)$/); return m ? `${m[2]} ${m[1]}` : n; };

/**
 * Alla <tr> i dokumentordning (inre tabeller före yttre) som
 * { cls, cells:[{tag, cls, attrs, html, text}] }. Mobilkopior är bortfiltrerade.
 */
export function rows(html) {
  const out = [], stack = [];
  const re = /<(\/?)(table|tr|td|th)\b([^>]*)>/gi;
  let m;
  const nearestRow = () => { for (let i = stack.length - 1; i >= 0; i--) { if (stack[i].t === 'table') return null; if (stack[i].t === 'tr') return stack[i]; } return null; };
  const closeCell = end => {
    const c = stack[stack.length - 1];
    if (c && (c.t === 'td' || c.t === 'th')) { stack.pop(); c.html = html.slice(c.start, end); const r = nearestRow(); if (r) r.cells.push(c); }
  };
  const finishRow = () => {
    const r = stack.pop();
    const cells = r.cells.filter(c => !/\bd-sm-none\b/.test(c.cls))
      .map(c => ({ tag: c.t, cls: c.cls, attrs: c.attrs, html: c.html, text: text(c.html) }));
    if (cells.length) out.push({ cls: r.cls, cells });
  };
  while ((m = re.exec(html))) {
    const close = m[1], t = m[2].toLowerCase(), attrs = m[3];
    if (!close) {
      if (t === 'table') stack.push({ t });
      else if (t === 'tr') { closeCell(m.index); if (stack.at(-1)?.t === 'tr') finishRow(); stack.push({ t, cls: attr(attrs, 'class'), cells: [] }); }
      else { closeCell(m.index); stack.push({ t, cls: attr(attrs, 'class'), attrs, start: re.lastIndex }); }
    } else if (t === 'td' || t === 'th') { if (stack.at(-1)?.t === t) closeCell(m.index); }
    else if (t === 'tr') { closeCell(m.index); if (stack.at(-1)?.t === 'tr') finishRow(); }
    else if (t === 'table') {
      while (stack.length && stack.at(-1).t !== 'table') { if (stack.at(-1).t === 'tr') finishRow(); else closeCell(m.index); }
      stack.pop();
    }
  }
  return out;
}

const isTitleRow = r => r.cells.every(c => /tdTitle|tdSubTitle/.test(c.cls));
const isHeaderRow = r => r.cells.every(c => c.tag === 'th') && r.cells.some(c => /tdHeader/.test(c.cls));
const hasNested = r => r.cells.some(c => /<table/i.test(c.html));

/** Delar upp sidan i sektioner: { title, header:[kolumnnamn i gemener], rows:[cells] } */
export function sections(html) {
  const out = []; let title = '', cur = null;
  for (const r of rows(html)) {
    if (hasNested(r)) continue;
    if (isTitleRow(r)) { title = r.cells[0].text; cur = null; continue; }
    if (isHeaderRow(r)) { cur = { title, header: r.cells.map(c => c.text.toLowerCase()), rows: [] }; out.push(cur); continue; }
    if (!cur) { cur = { title, header: null, rows: [] }; out.push(cur); }
    cur.rows.push(r.cells);
  }
  return out;
}
const col = (header, ...names) => header.findIndex(h => names.includes(h));
const num = s => { const n = parseInt(String(s).replace(/\s/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const leagueLink = html => html.match(/\/ScheduleAndResults\/(?:Schedule|Overview|Live|Standings)\/(\d+)/);
const gameIdIn = html => (html.match(/\/Game\/Events\/(\d+)/) || [])[1] || null;

/* ---------------- tabell ---------------- */
const SIDE_TABLES = /^(home|away|last \d+ games|equal strength|power ?play|short ?handed|pp|sh)\b/i;
export function parseStandings(html) {
  const res = [];
  for (const s of sections(html)) {
    if (!s.header || col(s.header, 'rk') < 0 || col(s.header, 'team') < 0 || SIDE_TABLES.test(s.title)) continue;
    const h = s.header, i = {
      rk: col(h, 'rk'), team: col(h, 'team'), gp: col(h, 'gp'), w: col(h, 'w'), t: col(h, 't'), l: col(h, 'l'),
      gfga: h.findIndex(x => x.startsWith('gf:ga')), tp: col(h, 'tp'), otw: col(h, 'otw'), otl: col(h, 'otl')
    };
    const group = /^standings$/i.test(s.title) ? '' : s.title;
    for (const c of s.rows) {
      if (!/^\d+$/.test(c[i.rk]?.text || '')) continue;
      const g = (c[i.gfga]?.text || '').match(/(\d+)\s*:\s*(\d+)/) || [0, 0, 0];
      res.push({ team: c[i.team].text, gp: num(c[i.gp]?.text), w: num(c[i.w]?.text), t: num(c[i.t]?.text), l: num(c[i.l]?.text),
        gf: +g[1], ga: +g[2], tp: num(c[i.tp]?.text), otw: num(c[i.otw]?.text), otl: num(c[i.otl]?.text), ...(group && { group }) });
    }
  }
  return res;
}

/* ---------------- poängliga ---------------- */
export function parseScorers(html, hidden = []) {
  const hide = new Set(hidden.flatMap(n => [n.toLowerCase(), flipName(n).toLowerCase()]));
  for (const s of sections(html)) {
    if (!s.header || col(s.header, 'name') < 0 || col(s.header, 'tp') < 0) continue;
    const h = s.header, i = { name: col(h, 'name'), team: col(h, 'team'), pos: col(h, 'pos'), gp: col(h, 'gp'), g: col(h, 'g'), a: col(h, 'a'), tp: col(h, 'tp'), pim: col(h, 'pim') };
    return s.rows.filter(c => c[i.name] && /^\d+$/.test(c[0]?.text || '')).map(c => ({
      name: flipName(c[i.name].text), team: attr(c[i.team]?.html || '', 'title') || c[i.team]?.text || '', code: c[i.team]?.text || '',
      pos: c[i.pos]?.text || '', gp: num(c[i.gp]?.text), g: num(c[i.g]?.text), a: num(c[i.a]?.text), tp: num(c[i.tp]?.text), pim: num(c[i.pim]?.text)
    })).filter(r => !hide.has(r.name.toLowerCase()));
  }
  return [];
}

/* ---------------- matchlistor: /GamesByDate/… och /ScheduleAndResults/Schedule/… ---------------- */
export function parseGameList(html, opts = {}) {
  const games = [];
  let header = null, curDate = opts.date || null, league = { id: opts.leagueId || null, name: opts.league || '', district: '' };
  for (const r of rows(html)) {
    if (hasNested(r)) continue;
    const c = r.cells;
    if (isTitleRow(r)) continue;
    if (isHeaderRow(r)) { header = c.map(x => x.text.toLowerCase()); continue; }
    // Serierubrik på GamesByDate: en cell med länk "U19 Dam Nationell Norra, Svenska Ishockeyförbundet"
    if (c.length === 1) {
      const l = leagueLink(c[0].html);
      if (l) { const [name, ...rest] = c[0].text.split(/,\s*/); league = { id: l[1], name: name.trim(), district: rest.join(', ') }; }
      continue;
    }
    const gi = header ? col(header, 'game') : 1;
    const gameCell = c[gi >= 0 ? gi : 1]?.text || '';
    const teams = gameCell.split(/\s+-\s+/);
    if (teams.length < 2 || !teams[0] || !teams[1]) continue;
    const rowText = c.map(x => x.text).join(' | ');
    const resCell = c.find(x => /\/Game\/Events\//.test(x.html)) || (header ? c[col(header, 'result')] : c[2]);
    const sc = (resCell?.text || '').match(/^(\d+)\s*-\s*(\d+)/);
    const d = rowText.match(/\b(20\d\d-\d\d-\d\d)\b/); if (d) curDate = d[1];
    const time = (rowText.match(/\b(\d{1,2}:\d\d)\b/) || [])[1] || '';
    const per = c.map(x => x.text).find(t => /^\(\s*\d+\s*-\s*\d+/.test(t));
    const vi = header ? col(header, 'venue') : c.length - 1, si = header ? col(header, 'spectators') : -1;
    const ri = header ? col(header, 'round') : -1;
    games.push({
      id: gameIdIn(r.cells.map(x => x.html).join('')) || `${curDate}-${teams[0]}-${teams[1]}`.replace(/\s+/g, '_'),
      leagueId: league.id, league: league.name, district: league.district,
      date: curDate, time, home: teams[0].trim(), away: teams.slice(1).join(' - ').trim(),
      hs: sc ? +sc[1] : null, as: sc ? +sc[2] : null,
      periods: per ? per.replace(/[()]/g, '').split(',').map(p => p.trim().split('-').map(Number)) : [],
      status: /cancel|inställ|postpon|uppskjut/i.test(rowText) ? 'cancelled' : sc ? 'final' : 'upcoming',
      venue: c[vi]?.text || '', spectators: si >= 0 ? (num(c[si]?.text) || null) : null,
      ...(ri >= 0 && c[ri]?.text && { round: c[ri].text })
    });
  }
  return games;
}

/* ---------------- matchrapport: /Game/Events/{id} ---------------- */
const PERIOD = t => { const m = t.match(/(\d)(?:st|nd|rd|th)\s+period/i); if (m) return +m[1]; if (/overtime|förläng/i.test(t)) return 4; if (/shot|straff/i.test(t)) return 5; return null; };
export function parseGame(html, id) {
  const all = rows(html);
  const g = { id: String(id), league: '', date: null, time: '', home: '', away: '', hs: null, as: null, periods: [], status: 'upcoming',
    clock: null, venue: '', spectators: null, shots: [], pim: [0, 0], events: [], goalies: [] };
  // Lagkoder ur <title>: "BIF - SKE  (10-4)"
  const tt = text((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').match(/^(\S+)\s+-\s+(\S+)/);
  const code = { home: tt?.[1] || '', away: tt?.[2] || '' };
  const teamOf = c => c === code.home ? g.home : c === code.away ? g.away : c;
  let period = null, inGk = false, perShots = null;
  for (const r of all) {
    const c = r.cells, t0 = c[0]?.text || '';
    if (!g.home && c.length === 1 && /tdTitle/.test(c[0].cls) && / - /.test(t0)) { [g.home, g.away] = t0.split(/\s+-\s+/); continue; }
    if (!g.date && c.length >= 3 && c.every(x => /tdSubTitle/.test(x.cls))) {
      const dt = t0.match(/(20\d\d-\d\d-\d\d)\s*(\d\d:\d\d)?/); if (dt) { g.date = dt[1]; g.time = dt[2] || ''; }
      g.league = c[1].text; g.venue = c[2].text; continue;
    }
    if (t0 === 'Shots') {
      const info = c.find(x => /tdInfoArea/.test(x.cls));
      if (info) {
        const divs = [...info.html.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)].map(x => text(x[1]));
        const sc = (divs[0] || '').match(/(\d+)\s*-\s*(\d+)/);
        if (sc) { g.hs = +sc[1]; g.as = +sc[2]; }
        const per = divs.find(x => /^\(/.test(x)); if (per) g.periods = per.replace(/[()]/g, '').split(',').map(p => p.trim().split('-').map(Number));
        const st = divs.find(x => x && !/^\(|^\d+\s*-\s*\d+|spectators/i.test(x)) || '';
        g.status = /final|game finished|slut/i.test(st) ? 'final' : sc ? 'live' : 'upcoming';
        if (g.status === 'live') g.clock = st ? st.replace(/(\d)(st|nd|rd|th)\s+period/i, 'P$1').replace(/overtime/i, 'Förlängning').replace(/intermission/i, 'Periodpaus').replace(/^P(\d)\s+ended$/i, 'Paus efter P$1').replace(/^overtime ended$/i,'Förlängning slut') : null;
        g.spectators = num((divs.find(x => /spectators/i.test(x)) || '').replace(/\D/g, '')) || null;
      }
      /* Skott per period "(8:10)"; pågående period står som "-" tills den är rapporterad, t.ex. "(7:-)" */
      const ps = c.filter(x => /^\([\d:\-\s]+\)$/.test(x.text) && /\d/.test(x.text)).map(x => x.text.replace(/[()\s]/g, '').split(':').map(v => /^\d+$/.test(v) ? +v : null));
      if (ps.length === 2 && c.some(x => /^shots$/i.test(x.text))) {
        /* totalen står i cellen efter "Shots" – är den större än periodernas summa hör skillnaden till pågående period */
        const tot = c.map((x, i) => /^shots$/i.test(x.text) ? num(c[i + 1]?.text) : null).filter(v => v != null);
        perShots = ps.map((arr, k) => {
          const out = arr.slice(), known = out.reduce((a, v) => a + (v || 0), 0), gap = out.indexOf(null);
          if (gap >= 0) out[gap] = Math.max(0, (tot[k] ?? known) - known);
          return out.map(v => v ?? 0);
        });
      }
      continue;
    }
    if (t0 === 'PIM') { const v = c.filter(x => /^\d+$/.test(x.text)).map(x => +x.text); if (v.length >= 2) g.pim = [v[0], v[1]]; continue; }
    if (c.length === 1 && /tdSubTitle/.test(c[0].cls)) { inGk = /goalkeeper/i.test(t0); period = PERIOD(t0) ?? period; continue; }
    if (c.length < 4) continue;
    const [time, type, team, who, extra] = c;
    if (inGk && !time.text && /%/.test(extra?.text || '')) {
      const m = extra.text.match(/\((\d+)\/(\d+)\)/);
      g.goalies.push({ team: teamOf(team.text), name: flipName(who.text.replace(/^\d+\.\s*/, '')), sv: m ? +m[1] : 0, sa: m ? +m[2] : 0 });
      continue;
    }
    if (!/^\d{1,3}:\d\d$/.test(time.text) || period == null) continue;
    const goal = type.text.match(/^(\d+)\s*-\s*(\d+)(?:\s*\(([^)]+)\))?/);
    if (goal) {
      const scorer = text(who.html.split(/<span|<div/i)[0]).replace(/^\d+\.\s*/, '');
      const assists = [...who.html.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)].map(x => flipName(text(x[1]).replace(/^\d+\.\s*/, ''))).filter(Boolean);
      g.events.push({ period, time: time.text, type: 'goal', team: teamOf(team.text), title: 'Mål – ' + flipName(scorer),
        text: [assists.length ? 'Assist: ' + assists.join(', ') : 'Ingen assist', goal[3] && goal[3] !== 'EQ' ? goal[3] : ''].filter(Boolean).join(' · '),
        score: `${goal[1]}–${goal[2]}` });
    } else if (/(\d+)\s*min/i.test(type.text)) {
      g.events.push({ period, time: time.text, type: 'pen', team: teamOf(team.text), title: `Utvisning ${type.text}`,
        text: [flipName(who.text.replace(/^\d+\.\s*/, '')), (extra?.text || '').replace(/\(.*$/, '').trim()].filter(Boolean).join(' · ') });
    } else if (/GK\s*(In|Out)/i.test(type.text)) {
      g.events.push({ period, time: time.text, type: 'gk', team: teamOf(team.text), title: /out/i.test(type.text) ? 'Målvakt ut' : 'Målvakt in',
        text: flipName(who.text.replace(/^\d+\.\s*/, '')) });
    }
  }
  if (perShots) g.shots = perShots[0].map((h, i) => [h, perShots[1][i] ?? 0]);
  return g;
}

/* ---------------- katalog ---------------- */
/** Menyn som finns på varje sida: nationella, regionala och distriktens samlingssidor. */
export function parseMenu(html) {
  const re = /<h([23])[^>]*>([\s\S]*?)<\/h\1>|<a[^>]+href="\/ScheduleAndResults\/\w+\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const out = { national: [], regional: [], districts: [] }, seen = new Set();
  let h2 = '', h3 = '', m;
  while ((m = re.exec(html))) {
    if (m[1] === '2') { h2 = text(m[2]); h3 = ''; continue; }
    if (m[1] === '3') { h3 = text(m[2]); continue; }
    const id = m[3], name = text(m[4]); if (!name || seen.has(id)) continue; seen.add(id);
    const gender = /women/i.test(h3) ? 'F' : 'H';
    if (/^(National )?Leagues$/i.test(h2)) out.national.push({ id, name, gender });
    else if (/^Region /i.test(h2) && /^districts$/i.test(h3)) out.districts.push({ id, name, region: h2 });
    else if (/^Region /i.test(h2)) out.regional.push({ id, name, gender, region: h2 });
  }
  return out;
}
/**
 * Rullistorna på en seriesida: families = distriktets/regionens serier (före "Cups"),
 * cups = cuper, groups = grupperna i den här serien (t.ex. "U14P Grundserie 1–4").
 */
export function parseSelects(html) {
  const lists = [];
  for (const s of html.matchAll(/<select[^>]*>([\s\S]*?)<\/select>/gi)) {
    const opts = [...s[1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/gi)].map(o => ({ v: o[1], name: text(o[2]) }));
    if (opts.some(o => /^\d{4}-\d{2}$/.test(o.name))) continue;                  // säsongslistan
    const items = opts.filter(o => /\/ScheduleAndResults\/(Overview|Schedule|Live|Standings)\/\d+$/.test(o.v)).map(o => ({ id: o.v.match(/(\d+)$/)[1], name: o.name }));
    if (new Set(items.map(x => x.id)).size < 2) continue;                       // vy-menyer (Live/Overview/Schedule för samma sida)
    if (!items.length) continue;
    const key = items.map(x => x.id).join(',');
    if (lists.some(l => l.key === key)) continue;                                 // mobilkopia av samma lista
    const cupAt = opts.findIndex(o => /\/Overview\/1$/.test(o.v) || /^cups$/i.test(o.name));
    lists.push({ key, items, hasCups: cupAt >= 0, cupIds: cupAt >= 0 ? new Set(opts.slice(cupAt + 1).map(o => (o.v.match(/(\d+)$/) || [])[1])) : new Set() });
  }
  // Distriktssidor har [serier i distriktet (med "Cups"-avdelare), grupper i serien]; andra sidor bara [grupper] eller inget
  const fam = lists.find(l => l.hasCups) || (lists.length >= 2 ? lists[0] : null);
  const grp = lists.find(l => l !== fam) || null;
  return {
    families: fam ? fam.items.filter(x => !fam.cupIds.has(x.id) && x.id !== '1') : [],
    cups: fam ? fam.items.filter(x => fam.cupIds.has(x.id)) : [],
    groups: grp && grp !== fam ? grp.items : []
  };
}

/* ---------------- laguppställning: /Game/LineUps/{id} ----------------
 * Sidan är text i ordningen: Referee(s) … Linesmen … Hemmalag (Färg) Head Coach: … Goalies …
 * 1st Line … Extra Players … Bortalag (Färg) … (bortalagets sektioner kan komma i omvänd ordning).
 * Varje nyckelord står före sina spelare, så tolkningen går på nyckelord, inte på ordning.
 */
const LU_KEYS = /(Head Coach:|Assistant Coach:|Goalies|Extra Players|(\d)(?:st|nd|rd|th) Line)/g;
const luPlayers = (s, hide) => s.split(/\s+(?=\d{1,3}\.\s)/).map(x => x.trim())
  .map(x => x.match(/^(\d{1,3})\.\s+(.+?),\s+(.+?)(?:\s+\((\w{1,2})\))?$/))
  .filter(Boolean).map(m => ({ no: +m[1], name: `${m[3]} ${m[2]}`.replace(/\s+/g, ' ').trim(), pos: m[4] || '' }))
  .filter(p => !hide.has(p.name.toLowerCase()));
const luCoach = s => { const m = s.trim().match(/^([^,]{2,40}),\s*(\S+)/); return m ? `${m[2]} ${m[1]}` : ''; };
function luTeam(seg, name, hide) {
  const team = { name, color: (seg.match(/^.*?\(([^)]*)\)/) || [])[1] || '', coach: '', assistant: '', goalies: [], lines: [], extra: [] };
  const keys = [...seg.matchAll(LU_KEYS)];
  keys.forEach((k, i) => {
    const body = seg.slice(k.index + k[0].length, i + 1 < keys.length ? keys[i + 1].index : seg.length);
    if (k[0] === 'Head Coach:') team.coach = luCoach(body);
    else if (k[0] === 'Assistant Coach:') team.assistant = luCoach(body);
    else if (k[0] === 'Goalies') team.goalies = luPlayers(body, hide);
    else if (k[0] === 'Extra Players') team.extra = luPlayers(body, hide);
    else team.lines[+k[2] - 1] = luPlayers(body, hide);
  });
  team.lines = team.lines.filter(l => l && l.length);
  return team;
}
// Bortalaget är spegelvänt på sidan (forwards före backar, reserv före ordinarie målvakt)
const mirror = t => ({ ...t, goalies: [...t.goalies].reverse(), lines: t.lines.map(l => [...l].reverse()) });
export function parseLineups(html, hidden = []) {
  const hide = new Set(hidden.flatMap(n => [n.toLowerCase(), flipName(n).toLowerCase()]));
  let home = '', away = '';
  for (const r of rows(html)) {
    const c = r.cells;
    if (c.length === 1 && /tdTitle/.test(c[0].cls) && / - /.test(c[0].text)) { [home, away] = c[0].text.split(/\s+-\s+/); break; }
  }
  const t = text(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' '));
  const start = Math.max(0, t.search(/Referee\(s\)|Line Up\s+Last update/));
  const body = t.slice(start);
  const hi = home ? body.indexOf(home + ' (') : -1, ai = away ? body.indexOf(away + ' (', hi + 1) : -1;
  if (hi < 0 || ai < 0) return { available: false, referees: '', linesmen: '', teams: [] };
  const pre = body.slice(0, hi);
  return {
    available: true,
    referees: ((pre.match(/Referee\(s\)\s+(.*?)(?:\s+Linesmen|$)/) || [])[1] || '').trim(),
    linesmen: ((pre.match(/Linesmen\s+(.*)$/) || [])[1] || '').trim(),
    teams: [luTeam(body.slice(hi, ai), home, hide), mirror(luTeam(body.slice(ai), away, hide))]
  };
}
