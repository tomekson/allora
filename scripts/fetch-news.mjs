/* allora. — denní zprávy: Wikipedia Current events (CC BY-SA) → DeepL (EN→IT, EN→CS) → data/news/daily.json
   Běží v GitHub Actions (Node 20+, bez závislostí). Bez DEEPL_API_KEY jen vypíše, co by přeložil. */
'use strict';

import { writeFileSync, mkdirSync } from 'node:fs';

const STORIES_MAX = 5;
const KEY = process.env.DEEPL_API_KEY || '';

/* datum v Praze */
const now = new Date();
const praha = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); // YYYY-MM-DD
const [y, m, d] = praha.split('-').map(Number);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const page = `Portal:Current_events/${y}_${MONTHS[m - 1]}_${d}`;

/* ---- 1. stáhni wikitext ---- */
const api = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&format=json&prop=wikitext&formatversion=2`;
const res = await fetch(api, { headers: { 'User-Agent': 'allora-news/1.0 (personal learning app; github.com/tomekson/allora)' } });
const body = await res.json();
if (body.error) {
  console.log(`Stránka ${page} zatím neexistuje (${body.error.code}), končím bez chyby.`);
  process.exit(0);
}
const wikitext = body.parse.wikitext;

/* ---- 2. vytáhni věty z odrážek ---- */
function cleanWiki(s) {
  return s
    .replace(/\[https?:\/\/[^\]]*\]/g, '')        // externí odkazy [url (Zdroj)]
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')  // [[cíl|text]] → text
    .replace(/\[\[([^\]]*)\]\]/g, '$1')           // [[text]] → text
    .replace(/'''?/g, '')                         // tučné/kurzíva
    .replace(/\{\{[^}]*\}\}/g, '')                // šablony
    .replace(/<[^>]*>/g, '')                      // html komentáře/tagy
    .replace(/\s+/g, ' ')
    .trim();
}

const stories = [];
for (const line of wikitext.split('\n')) {
  if (!/^\*+\s*\S/.test(line)) continue;
  const text = cleanWiki(line.replace(/^\*+/, ''));
  // jen skutečné věty, ne nadpisy témat (ty nemají tečku ani sloveso navíc)
  if (text.length < 60 || !/[.!?]$/.test(text)) continue;
  stories.push(text);
  if (stories.length >= STORIES_MAX) break;
}

/* ---- 2b. české zprávy: cs.wikipedia Portál:Aktuality (CC BY-SA) ---- */
const CZ_MAX = 4;
const CZ_MONTHS = { ledna: 1, 'února': 2, 'března': 3, dubna: 4, 'května': 5, 'června': 6, 'července': 7, srpna: 8, 'září': 9, 'října': 10, listopadu: 11, prosince: 12 };

async function fetchCzAktuality() {
  const url = 'https://cs.wikipedia.org/w/api.php?action=parse&page=' +
    encodeURIComponent('Portál:Aktuality/vlastní text') + '&format=json&prop=wikitext&formatversion=2';
  const r = await fetch(url, { headers: { 'User-Agent': 'allora-news/1.0 (personal learning app; github.com/tomekson/allora)' } });
  const j = await r.json();
  if (!j.parse) return [];
  const items = [];
  let day = null;
  for (const line of j.parse.wikitext.split('\n')) {
    const dm = line.match(/^;\s*\[\[\s*\d+\.\s*[^|]+\|\s*(\d+)\.\s*([a-zěščřžýáíéůú]+)\s*\]\]/i);
    if (dm && CZ_MONTHS[dm[2].toLowerCase()]) {
      day = `${y}-${String(CZ_MONTHS[dm[2].toLowerCase()]).padStart(2, '0')}-${String(+dm[1]).padStart(2, '0')}`;
      continue;
    }
    const tm = line.match(/^\s*\|\s*text\s*=\s*(.+)$/);
    if (tm && day) {
      const text = cleanWiki(tm[1].replace(/<ref[\s\S]*$/, ''));
      if (text.length >= 40) items.push({ date: day, text });
    }
  }
  // jen poslední 3 dny; nejnovější napřed
  items.sort((a, b) => b.date.localeCompare(a.date));
  const cutoff = new Date(`${praha}T00:00:00Z`).getTime() - 3 * 86400000;
  return items.filter(i => new Date(i.date + 'T00:00:00Z').getTime() >= cutoff).slice(0, CZ_MAX);
}

const czItems = await fetchCzAktuality();

if (!stories.length && !czItems.length) {
  console.log('Žádné položky k překladu, končím.');
  process.exit(0);
}
console.log(`Nalezeno ${stories.length} světových zpráv (${page}) + ${czItems.length} českých (Portál:Aktuality):`);
stories.forEach((s, i) => console.log(`  W${i + 1}. ${s.slice(0, 100)}…`));
czItems.forEach((s, i) => console.log(`  CZ${i + 1}. [${s.date}] ${s.text.slice(0, 100)}…`));

if (!KEY) {
  console.log('DEEPL_API_KEY není nastaven, daily.json nezapisuji (dry run).');
  process.exit(0);
}

/* ---- 3. DeepL překlad ---- */
const endpoint = KEY.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';

async function translate(texts, source, target) {
  if (!texts.length) return [];
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: texts, source_lang: source, target_lang: target }),
  });
  if (!r.ok) throw new Error(`DeepL ${source}→${target}: HTTP ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.translations.map(t => t.text);
}

const [it, cz, czIt] = await Promise.all([
  translate(stories, 'EN', 'IT'),
  translate(stories, 'EN', 'CS'),
  translate(czItems.map(i => i.text), 'CS', 'IT'),
]);

/* ---- 4. zapiš JSON — české zprávy napřed ---- */
const out = {
  date: praha,
  source: 'Wikipedia: Portál:Aktuality + Portal:Current events (CC BY-SA 4.0)',
  sourceUrl: `https://en.wikipedia.org/wiki/${page.replaceAll(' ', '_')}`,
  translator: 'DeepL',
  stories: [
    ...czItems.map((item, i) => ({ it: czIt[i], cz: item.text, origin: 'cz' })),
    ...stories.map((en, i) => ({ en, it: it[i], cz: cz[i], origin: 'world' })),
  ],
};
mkdirSync('data/news', { recursive: true });
writeFileSync('data/news/daily.json', JSON.stringify(out, null, 2) + '\n');
console.log(`Zapsáno data/news/daily.json (${out.stories.length} zpráv, ${praha}).`);
