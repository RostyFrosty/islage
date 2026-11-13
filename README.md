# Isläge – svensk hockey live

Mobilapp (PWA) med matcher, tabeller, poängligor och matchrapporter för alla serier i Sverige,
byggd på stats.swehockey.se. Kan senare paketeras med Capacitor till Android/iOS.

## Status (testat mot riktiga sidor 2026-11-13)
| Del | Status |
|---|---|
| Tabell, poängliga, schema, matchrapport (`parse.js`) | ✅ Verifierat: SHL, HA, ungdomsgrupper |
| Alla matcher en dag inkl. ungdom (`/GamesByDate/{datum}/ByTime/null`) | ✅ 1 356 matcher / 184 serier en söndag |
| Seriekatalog hela Sverige (`scripts/catalog.mjs`) | ✅ 454 aktuella serier/grupper, ~25 s |
| Livestatus, liveuppdatering av matchsidan och laguppställning | ✅ Verifierat i appen 2026-11-13 under kvällens matcher |
| svenskhockey.tv-länkar till enskilda sändningar | ⛔ Kräver tillstånd (privat API) – länkar till startsidan tills vidare |

## Struktur
Samma upplägg som games-sajten: **en Cloudflare Worker** som publiceras automatiskt när något pushas till `main`.
- `worker.js` svarar på `/api/*` (hämtar och tolkar swehockey, cachar). Allt annat serveras från `site/`.
- `site/` – appen (`index.html`, PWA-filer, ikoner) och `site/data/` (katalog och förhämtad data).
- `parse.js` – tolkarna, delas av Worker och skript. `streams.js` – svenskhockey.tv-koppling (vilande).
- `scripts/catalog.mjs` – bygger `site/data/catalog.json` (måndagar). `scripts/scrape.mjs` – förhämtar `leagues.json` (morgon/kväll).
- `.github/workflows/` – kör skripten och committar ny data → Cloudflare publicerar om.
- `hidden.json` – namn som döljs i poängligor på begäran. `MIN_PLAYER_AGE` i `site/index.html` (13).
- Appen känner själv av om den körs på riktiga sajten (riktig data) eller i en förhandsvisning (demodata).

## Kom igång (en gång)
1. Installera GitHub CLI och logga in: `winget install GitHub.cli`, sedan `gh auth login`.
2. Kör i PowerShell i den här mappen: `powershell -ExecutionPolicy Bypass -File .\setup.ps1`
   (flyttar workflow-filerna till `.github/workflows/`, skapar repot `geapanenbanan/islage` och pushar).
   Vill du ha repot under Rostyfrosty: `.\setup.ps1 -Repo Rostyfrosty/islage`.
3. Cloudflare → Workers & Pages → Create → **Import a repository** → välj repot. Inställningarna läses från `wrangler.jsonc`.
   Sajten hamnar på **https://islage.geapanenbanan.com** (ändra under `routes` om du vill ha en annan adress).
4. GitHub → repot → Actions → "Uppdatera seriekatalog" → Run workflow (kör en gång direkt).

Testa lokalt: `npx wrangler dev` → http://localhost:8787

## Swehockeys struktur (för underhåll)
- Menyn på varje sida: nationella serier (rubrik "Leagues"), regionala, och distriktens samlingssidor.
- Distriktssida: rullista med distriktets serier; allt efter "Cups" är cuper.
- Seriesida: rullista med seriens grupper. Varje grupp har eget ID med Standings/Schedule/ScoringLeaders.
- Tabellceller finns i mobil- (`d-sm-none`) och datorversion; mobilkopiorna kastas.
- Matchrapportens `<title>` ger lagkoderna: `"BIF - SKE  (10-4)"`.
