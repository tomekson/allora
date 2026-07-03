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
let lastTopic = null; // článek události z nadřazené odrážky (pro Approfondimento)
for (const line of wikitext.split('\n')) {
  if (!/^\*+\s*\S/.test(line)) continue;
  const text = cleanWiki(line.replace(/^\*+/, ''));
  const isSentence = text.length >= 60 && /[.!?]$/.test(text);
  if (!isSentence) {
    const lm = line.match(/^\*+\s*\[\[([^\]|]+)/);
    if (lm) lastTopic = lm[1].trim();
    continue;
  }
  stories.push({ text, topic: lastTopic });
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

/* ---- 2c. Approfondimento: úvod wiki článku k první události s tématem ---- */
async function fetchExtract(title) {
  const u = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&format=json&formatversion=2&redirects=1`;
  const r = await fetch(u, { headers: { 'User-Agent': 'allora-news/1.0 (personal learning app; github.com/tomekson/allora)' } });
  const j = await r.json();
  const p = j.query && j.query.pages && j.query.pages[0];
  return p && !p.missing ? (p.extract || '').trim() : '';
}

let article = null;
const seenTopics = new Set();
for (const s of stories) {
  if (!s.topic || seenTopics.has(s.topic)) continue;
  seenTopics.add(s.topic);
  let extract = await fetchExtract(s.topic);
  if (extract.length > 800) {
    const cut = extract.slice(0, 800);
    extract = cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.')) + 1) || cut;
  }
  if (extract.length >= 250) { article = { topic: s.topic, en: extract }; break; }
}

if (!stories.length && !czItems.length) {
  console.log('Žádné položky k překladu, končím.');
  process.exit(0);
}
console.log(`Nalezeno ${stories.length} světových zpráv (${page}) + ${czItems.length} českých (Portál:Aktuality)${article ? ` + approfondimento: ${article.topic}` : ''}:`);
stories.forEach((s, i) => console.log(`  W${i + 1}. ${s.text.slice(0, 100)}…`));
czItems.forEach((s, i) => console.log(`  CZ${i + 1}. [${s.date}] ${s.text.slice(0, 100)}…`));

/* ---- 3. překlad: DeepL (pokud je klíč), jinak/při selhání MyMemory ---- */
const endpoint = KEY.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
let engine = KEY ? 'DeepL' : 'MyMemory';

async function deepl(texts, source, target) {
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

/* MyMemory bere max ~500 znaků na dotaz → delší texty dělíme po větách */
function sentenceChunks(text, max = 440) {
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  const chunks = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > max && cur) { chunks.push(cur.trim()); cur = p; }
    else cur += p;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

async function myMemory(text, source, target) {
  const out = [];
  for (const chunk of sentenceChunks(text)) {
    const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${source.toLowerCase()}|${target.toLowerCase()}`;
    const r = await fetch(u);
    const j = await r.json();
    if (!j.responseData || j.responseStatus !== 200) throw new Error(`MyMemory ${source}→${target}: ${JSON.stringify(j.responseStatus)} ${j.responseDetails || ''}`);
    out.push(j.responseData.translatedText);
  }
  return out.join(' ');
}

async function translate(texts, source, target) {
  if (!texts.length) return [];
  if (KEY) {
    try {
      return await deepl(texts, source, target);
    } catch (e) {
      console.log(`DeepL selhal (${e.message.slice(0, 120)}), přepínám na MyMemory.`);
      engine = 'MyMemory (DeepL fallback)';
    }
  }
  const out = [];
  for (const t of texts) out.push(await myMemory(t, source, target));
  return out;
}

const worldTexts = stories.map(s => s.text);
const [it, cz, czIt, artIt, artCz] = await Promise.all([
  translate(worldTexts, 'EN', 'IT'),
  translate(worldTexts, 'EN', 'CS'),
  translate(czItems.map(i => i.text), 'CS', 'IT'),
  translate(article ? [article.en] : [], 'EN', 'IT'),
  translate(article ? [article.en] : [], 'EN', 'CS'),
]);

/* ---- 4. zapiš JSON — české zprávy napřed ---- */
const out = {
  date: praha,
  source: 'Wikipedia: Portál:Aktuality + Portal:Current events (CC BY-SA 4.0)',
  sourceUrl: `https://en.wikipedia.org/wiki/${page.replaceAll(' ', '_')}`,
  translator: engine,
  stories: [
    ...czItems.map((item, i) => ({ it: czIt[i], cz: item.text, origin: 'cz' })),
    ...stories.map((s, i) => ({ en: s.text, it: it[i], cz: cz[i], origin: 'world' })),
  ],
  article: article ? {
    topic: article.topic,
    url: `https://en.wikipedia.org/wiki/${article.topic.replaceAll(' ', '_')}`,
    en: article.en,
    it: artIt[0],
    cz: artCz[0],
  } : null,
};
mkdirSync('data/news', { recursive: true });
writeFileSync('data/news/daily.json', JSON.stringify(out, null, 2) + '\n');
console.log(`Zapsáno data/news/daily.json (${out.stories.length} zpráv, ${praha}).`);
