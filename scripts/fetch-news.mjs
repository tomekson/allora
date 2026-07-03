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

if (!stories.length) {
  console.log('Žádné položky k překladu, končím.');
  process.exit(0);
}
console.log(`Nalezeno ${stories.length} zpráv (${page}):`);
stories.forEach((s, i) => console.log(`  ${i + 1}. ${s.slice(0, 100)}…`));

if (!KEY) {
  console.log('DEEPL_API_KEY není nastaven, daily.json nezapisuji (dry run).');
  process.exit(0);
}

/* ---- 3. DeepL překlad ---- */
const endpoint = KEY.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';

async function translate(texts, target) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: texts, source_lang: 'EN', target_lang: target }),
  });
  if (!r.ok) throw new Error(`DeepL ${target}: HTTP ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.translations.map(t => t.text);
}

const [it, cz] = await Promise.all([translate(stories, 'IT'), translate(stories, 'CS')]);

/* ---- 4. zapiš JSON ---- */
const out = {
  date: praha,
  source: 'Wikipedia, Portal:Current events (CC BY-SA 4.0)',
  sourceUrl: `https://en.wikipedia.org/wiki/${page.replaceAll(' ', '_')}`,
  translator: 'DeepL',
  stories: stories.map((en, i) => ({ en, it: it[i], cz: cz[i] })),
};
mkdirSync('data/news', { recursive: true });
writeFileSync('data/news/daily.json', JSON.stringify(out, null, 2) + '\n');
console.log(`Zapsáno data/news/daily.json (${out.stories.length} zpráv, ${praha}).`);
