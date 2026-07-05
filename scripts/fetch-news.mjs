/* allora. — denní zprávy: Wikipedia Current events (CC BY-SA) → DeepL (EN→IT, EN→CS) → data/news/daily.json
   Běží v GitHub Actions (Node 20+, bez závislostí). Bez DEEPL_API_KEY jen vypíše, co by přeložil. */
'use strict';

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const STORIES_MAX = 5;
const KEY = process.env.DEEPL_API_KEY || '';

/* ---- filtr témat (data/news-filter.json, editovatelný bez zásahu do kódu) ---- */
const FILTER = JSON.parse(readFileSync('data/news-filter.json', 'utf8'));
const anyMatch = (patterns, text) => patterns.some(p => new RegExp(p, 'i').test(text));
const isBlocked = item =>
  anyMatch(FILTER.block, item.text) ||
  (item.section && anyMatch(FILTER.blockSections, item.section));
const scoreOf = item => {
  let s = FILTER.prefer.filter(p => new RegExp(p, 'i').test(item.text)).length;
  if (item.section && anyMatch(FILTER.preferSections, item.section)) s += 1;
  return s;
};

/* datum v Praze */
const now = new Date();
const prahaFmt = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t); // YYYY-MM-DD
const praha = prahaFmt(now);
const vcera = prahaFmt(new Date(now.getTime() - 86400000));
const [y] = praha.split('-').map(Number);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pageFor(dateStr) {
  const [yy, mm, dd] = dateStr.split('-').map(Number);
  return `Portal:Current_events/${yy}_${MONTHS[mm - 1]}_${dd}`;
}
const page = pageFor(praha);

/* ---- pomocné ---- */
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

/* ---- 1+2. světové zprávy: dnešní stránka, doplněná ze včerejška ---- */
async function fetchWorld(dateStr) {
  const p = pageFor(dateStr);
  const api = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(p)}&format=json&prop=wikitext&formatversion=2`;
  const res = await fetch(api, { headers: { 'User-Agent': 'allora-news/1.0 (personal learning app; github.com/tomekson/allora)' } });
  const body = await res.json();
  if (body.error) {
    console.log(`Stránka ${p} zatím neexistuje (${body.error.code}).`);
    return [];
  }
  const items = [];
  let lastTopic = null; // článek události z nadřazené odrážky (pro Approfondimento)
  let section = null;   // '''Armed conflicts and attacks''' apod.
  for (const line of body.parse.wikitext.split('\n')) {
    const sm = line.match(/^'''(.+?)'''/);
    if (sm) { section = sm[1]; lastTopic = null; continue; }
    if (!/^\*+\s*\S/.test(line)) continue;
    const text = cleanWiki(line.replace(/^\*+/, ''));
    const isSentence = text.length >= 60 && /[.!?]$/.test(text);
    if (!isSentence) {
      const lm = line.match(/^\*+\s*\[\[([^\]|]+)/);
      if (lm) lastTopic = lm[1].trim();
      continue;
    }
    items.push({ text, topic: lastTopic, section });
  }
  return items;
}

/* dnešek + včerejšek → filtr → řazení podle preferencí */
const poolToday = await fetchWorld(praha);
const poolYesterday = await fetchWorld(vcera);
const seen = new Set();
const pool = [];
for (const it of [...poolToday, ...poolYesterday]) {
  if (seen.has(it.text)) continue;
  seen.add(it.text);
  pool.push(it);
}
const blockedCount = pool.filter(isBlocked).length;
const stories = pool
  .filter(it => !isBlocked(it))
  .map((it, i) => ({ ...it, score: scoreOf(it), order: i }))
  .sort((a, b) => b.score - a.score || a.order - b.order)
  .slice(0, STORIES_MAX);
console.log(`Světový pool: ${pool.length} zpráv, ${blockedCount} odfiltrováno (konflikty/sport), vybráno ${stories.length} podle preferencí.`);

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
  return items.filter(i => new Date(i.date + 'T00:00:00Z').getTime() >= cutoff);
}

/* ---- 2c2. Dall'UE — tiskové zprávy Evropské komise s OFICIÁLNÍMI překlady (IT/CS feedy) ---- */
const EU_UA = { headers: { 'User-Agent': 'allora-news/1.0 (personal learning app; github.com/tomekson/allora)' } };

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const g = re => ((m[1].match(re) || [])[1] || '').trim();
    return { title: g(/<title>([\s\S]*?)<\/title>/), desc: g(/<description>([\s\S]*?)<\/description>/), link: g(/<link>([\s\S]*?)<\/link>/) };
  });
}

function euText(title, desc) {
  const d = desc
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/^.{0,90}?\d{1,2}[.\s]+[\wěščřžýáíéůú]+[.\s]+\d{4}\s*/i, '') // úvodní boilerplate s datem
    .replace(/\s+/g, ' ').trim();
  let text = title.replace(/[.!?]$/, '') + '. ' + d;
  if (text.length > 320) {
    const cut = text.slice(0, 320);
    text = cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.')) + 1) || cut;
  }
  return text;
}

const docId = link => (link.match(/detail\/[a-z]{2}\/([a-z]+_\d+_\d+)/) || [])[1] || null;
const isOfficial = (link, lang) => link.includes(`/detail/${lang}/`);

async function fetchEu() {
  try {
    const [en, itF, csF] = await Promise.all(['en', 'it', 'cs'].map(async l => {
      const r = await fetch(`https://ec.europa.eu/commission/presscorner/api/rss?language=${l}`, EU_UA);
      return parseRss(await r.text());
    }));
    const byId = (list, lang) => Object.fromEntries(list.filter(x => isOfficial(x.link, lang)).map(x => [docId(x.link), x]));
    const itMap = byId(itF, 'it');
    const csMap = byId(csF, 'cs');
    const cands = [];
    en.forEach((item, order) => {
      const id = docId(item.link);
      if (!id || /^mex_/.test(id) || /^Daily News/i.test(item.title)) return; // denní agregát přeskočit
      const enText = euText(item.title, item.desc);
      if (anyMatch(FILTER.block, enText)) return;
      cands.push({
        order,
        pressRelease: /^ip_/.test(id),
        en: enText,
        it: itMap[id] ? euText(itMap[id].title, itMap[id].desc) : null,
        cz: csMap[id] ? euText(csMap[id].title, csMap[id].desc) : null,
      });
    });
    // přednost: oficiálně přeložené, pak tiskové zprávy, pak pořadí ve feedu
    cands.sort((a, b) =>
      ((b.it && b.cz) ? 1 : 0) - ((a.it && a.cz) ? 1 : 0) ||
      (b.pressRelease ? 1 : 0) - (a.pressRelease ? 1 : 0) ||
      a.order - b.order);
    // šablonovité zprávy (schválení platby z fondu obnovy pro různé země znějí skoro identicky) — nejvýš jedna
    const templateSig = c => (c.en.match(/greenlights?.{0,40}payment request|payment request.{0,40}(approved|greenlight)/i) ? 'ngeu-payment' : null);
    const out = [];
    const usedTemplates = new Set();
    for (const c of cands) {
      const sig = templateSig(c);
      if (sig && usedTemplates.has(sig)) continue;
      if (sig) usedTemplates.add(sig);
      out.push(c);
      if (out.length >= 3) break;
    }
    return out;
  } catch (e) {
    console.log('EU RSS selhal:', e.message);
    return [];
  }
}

const euRaw = await fetchEu();
const euOfficial = euRaw.filter(e => e.it && e.cz).length;
console.log(`Dall'UE: ${euRaw.length} zpráv, z toho ${euOfficial} s oficiálním překladem IT+CS.`);

/* ---- 2c3. Economia — tiskové zprávy České národní banky (reuse s uvedením zdroje "the CNB") ---- */
async function fetchCnb() {
  try {
    const r = await fetch('https://www.cnb.cz/en/.content/rss-feed/rss-feed_tz.xml', EU_UA);
    const items = parseRss(await r.text());
    const out = [];
    for (const item of items) {
      if (!item.title) continue;
      const text = euText(item.title, item.desc);
      if (anyMatch(FILTER.block, text)) continue;
      out.push(text);
      if (out.length >= 2) break;
    }
    return out;
  } catch (e) {
    console.log('ČNB RSS selhal:', e.message);
    return [];
  }
}
const cnbItems = await fetchCnb();
console.log(`Economia (ČNB): ${cnbItems.length} zpráv.`);

/* ---- 2c4. Economia — Istat, statistické releasy (CC BY 3.0, uvedení zdroje) ---- */
async function fetchIstat() {
  try {
    const r = await fetch('https://www.istat.it/en/feed/', EU_UA);
    const items = parseRss(await r.text());
    const out = [];
    for (const item of items) {
      if (!item.title) continue;
      const text = euText(item.title.replace(/&#8211;/g, '-'), item.desc);
      if (anyMatch(FILTER.block, text)) continue;
      out.push(text);
      if (out.length >= 2) break;
    }
    return out;
  } catch (e) {
    console.log('Istat RSS selhal:', e.message);
    return [];
  }
}
const istatItems = await fetchIstat();
console.log(`Economia (Istat): ${istatItems.length} zpráv.`);

/* ---- 2c5. Giornale — The Guardian Open Platform (developer key, nekomerční, zdarma)
   Bez GUARDIAN_API_KEY se přeskočí, nic nespadne. Registrace: https://bonobo.capi.gutools.co.uk/register/developer */
const GUARDIAN_KEY = process.env.GUARDIAN_API_KEY || '';
async function fetchGuardian() {
  if (!GUARDIAN_KEY) return [];
  try {
    const sections = ['business', 'technology', 'money'];
    const u = `https://content.guardianapis.com/search?section=${sections.join('|')}&order-by=newest&page-size=15&show-fields=trailText&api-key=${GUARDIAN_KEY}`;
    const r = await fetch(u);
    const j = await r.json();
    const results = (j.response && j.response.results) || [];
    const out = [];
    for (const item of results) {
      const trail = (item.fields && item.fields.trailText || '').replace(/<[^>]*>/g, '').trim();
      const text = trail ? `${item.webTitle}. ${trail}` : item.webTitle;
      if (anyMatch(FILTER.block, text)) continue;
      out.push(text);
      if (out.length >= 3) break;
    }
    return out;
  } catch (e) {
    console.log('Guardian API selhal:', e.message);
    return [];
  }
}
const guardianItems = await fetchGuardian();
console.log(`Giornale (Guardian): ${guardianItems.length} zpráv${GUARDIAN_KEY ? '' : ' (bez klíče, přeskočeno)'}.`);

/* ---- 2d. Lo sapevi? — Did you know z Wikipedie (CC BY-SA), pozitivní kuriozity ---- */
async function fetchDyk() {
  const u = 'https://en.wikipedia.org/w/api.php?action=parse&page=' + encodeURIComponent('Template:Did you know') + '&format=json&prop=wikitext&formatversion=2';
  const r = await fetch(u, { headers: { 'User-Agent': 'allora-news/1.0 (personal learning app; github.com/tomekson/allora)' } });
  const j = await r.json();
  if (!j.parse) return [];
  const out = [];
  for (const line of j.parse.wikitext.split('\n')) {
    if (!/^\*\s*\.\.\.\s*that/i.test(line.trim())) continue;
    let text = cleanWiki(line.replace(/^\*\s*/, '')).replace(/^\.\.\.\s*that\s+/i, '').replace(/\(pictured[^)]*\)\s*/i, '');
    if (!/\?$/.test(text) || text.length < 50 || text.length > 220) continue;
    text = 'Did you know that ' + text;
    if (anyMatch(FILTER.block, text)) continue;
    out.push(text);
    if (out.length >= 2) break;
  }
  return out;
}
const dykItems = await fetchDyk();
console.log(`Lo sapevi?: ${dykItems.length} kuriozity.`);

const czPool = await fetchCzAktuality();
const czItems = czPool
  .filter(i => !anyMatch(FILTER.block, i.text))
  .map((i, idx) => ({ ...i, score: FILTER.prefer.filter(p => new RegExp(p, 'i').test(i.text)).length, order: idx }))
  .sort((a, b) => b.score - a.score || a.order - b.order)
  .slice(0, CZ_MAX);
console.log(`Český pool: ${czPool.length} zpráv, ${czPool.filter(i => anyMatch(FILTER.block, i.text)).length} odfiltrováno, vybráno ${czItems.length}.`);

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
stories.forEach((s, i) => console.log(`  W${i + 1}. [${s.score}b|${s.section || '?'}] ${s.text.slice(0, 90)}…`));
czItems.forEach((s, i) => console.log(`  CZ${i + 1}. [${s.score}b|${s.date}] ${s.text.slice(0, 90)}…`));

if (process.env.DRY_RUN) {
  console.log('DRY_RUN: končím před překladem, nic nezapisuji.');
  process.exit(0);
}

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
const euNeedIt = euRaw.filter(e => !e.it).map(e => e.en);
const euNeedCz = euRaw.filter(e => !e.cz).map(e => e.en);
const [it, cz, czIt, artIt, artCz, dykIt, dykCz, euItMt, euCzMt, cnbIt, cnbCz, istatIt, istatCz, guardianIt, guardianCz] = await Promise.all([
  translate(worldTexts, 'EN', 'IT'),
  translate(worldTexts, 'EN', 'CS'),
  translate(czItems.map(i => i.text), 'CS', 'IT'),
  translate(article ? [article.en] : [], 'EN', 'IT'),
  translate(article ? [article.en] : [], 'EN', 'CS'),
  translate(dykItems, 'EN', 'IT'),
  translate(dykItems, 'EN', 'CS'),
  translate(euNeedIt, 'EN', 'IT'),
  translate(euNeedCz, 'EN', 'CS'),
  translate(cnbItems, 'EN', 'IT'),
  translate(cnbItems, 'EN', 'CS'),
  translate(istatItems, 'EN', 'IT'),
  translate(istatItems, 'EN', 'CS'),
  translate(guardianItems, 'EN', 'IT'),
  translate(guardianItems, 'EN', 'CS'),
]);
let itIdx = 0, czIdx = 0;
const euItems = euRaw.map(e => ({
  en: e.en,
  it: e.it || euItMt[itIdx++],
  cz: e.cz || euCzMt[czIdx++],
}));

/* ---- 3b. shadow věta dne: nejkratší vhodná IT věta + rule-based fonetika ---- */

function transcribe(w) {
  let out = '';
  for (let i = 0; i < w.length; i++) {
    const c = w[i], n = w[i + 1] || '', n2 = w[i + 2] || '';
    if (c === 'g' && n === 'l' && n2 === 'i') { out += 'lj'; i += 2; continue; }
    if (c === 'g' && n === 'n') { out += 'ň'; i += 1; continue; }
    if (c === 's' && n === 'c' && n2 === 'i' && /[aeiouàèéìòóù]/.test(w[i + 3] || '')) { out += 'š'; i += 2; continue; }
    if (c === 's' && n === 'c' && /[eiéèì]/.test(n2)) { out += 'š'; i += 1; continue; }
    if (c === 'c' && n === 'h') { out += 'k'; i += 1; continue; }
    if (c === 'g' && n === 'h') { out += 'g'; i += 1; continue; }
    if (c === 'c' && n === 'i' && /[aeiouàèéòóù]/.test(n2)) { out += 'č'; i += 1; continue; }
    if (c === 'c' && /[eiéèì]/.test(n)) { out += 'č'; continue; }
    if (c === 'c') { out += 'k'; continue; }
    if (c === 'g' && n === 'i' && /[aeiouàèéòóù]/.test(n2)) { out += 'dž'; i += 1; continue; }
    if (c === 'g' && /[eiéèì]/.test(n)) { out += 'dž'; continue; }
    if (c === 'q' && n === 'u') { out += 'kv'; i += 1; continue; }
    if (c === 'h') continue;
    if (c === 'z') { out += 'c'; continue; }
    if (c === 's' && /[aeiouàèéìòóù]/.test(w[i - 1] || '') && /[aeiouàèéìòóù]/.test(n)) { out += 'z'; continue; }
    out += c;
  }
  return out;
}

function syllabify(t) {
  const V = /[aeiouàèéìòóù]/;
  const sy = [];
  let cur = '';
  let i = 0;
  while (i < t.length) {
    cur += t[i];
    if (V.test(t[i])) {
      while (V.test(t[i + 1] || '')) { i++; cur += t[i]; } // dvojhlásky drž pohromadě
      let j = i + 1, cons = '';
      while (j < t.length && !V.test(t[j])) { cons += t[j]; j++; }
      if (j >= t.length) { cur += cons; sy.push(cur); return sy; }
      if (cons.length <= 1) { sy.push(cur); cur = ''; i++; continue; }
      let take = Math.ceil(cons.length / 2);
      if (cons[take - 1] === 'd' && cons[take] === 'ž') take -= 1; // dž nedělit
      cur += cons.slice(0, take);
      sy.push(cur);
      cur = '';
      i += take + 1;
      continue;
    }
    i++;
  }
  if (cur) sy.push(cur);
  return sy;
}

const ACUTE = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', à: 'á', è: 'é', ì: 'í', ò: 'ó', ù: 'ú' };

function phonWord(word) {
  const w = word.toLowerCase().replace(/[^a-zàèéìòóù]/g, '');
  if (!w) return null;
  const sy = syllabify(transcribe(w));
  if (sy.length === 1 || w.length <= 3) return sy.join('-');
  let idx = sy.findIndex(s => /[àèéìòóù]/.test(s));
  if (idx === -1) idx = sy.length - 2;
  sy[idx] = sy[idx].replace(/[aeiouàèéìòóù]/, v => ACUTE[v] || v).toUpperCase();
  return sy.join('-');
}

function phonSentence(sent) {
  return '[' + sent.split(/\s+/).map(phonWord).filter(Boolean).join(' ') + ']';
}

function firstSentence(t) {
  const m = t.match(/^.+?[.!?](\s|$)/);
  return (m ? m[0] : t).trim();
}

function pickShadow(pairs) { // [{it, cz}]
  const cands = pairs.map(p => ({ it: firstSentence(p.it), cz: firstSentence(p.cz) }));
  const good = cands.filter(s => s.it.length >= 35 && s.it.length <= 90);
  const pool = good.length ? good : cands;
  pool.sort((a, b) => a.it.length - b.it.length);
  return pool[0] || null;
}

/* ---- 4. zapiš JSON — české zprávy napřed ---- */
const out = {
  date: praha,
  source: 'Wikipedia: Portál:Aktuality + Portal:Current events (CC BY-SA 4.0)',
  sourceUrl: `https://en.wikipedia.org/wiki/${page.replaceAll(' ', '_')}`,
  translator: engine,
  stories: [
    ...czItems.map((item, i) => ({ it: czIt[i], cz: item.text, origin: 'cz' })),
    ...euItems.map(e => ({ en: e.en, it: e.it, cz: e.cz, origin: 'eu' })),
    ...cnbItems.map((en, i) => ({ en, it: cnbIt[i], cz: cnbCz[i], origin: 'econ' })),
    ...istatItems.map((en, i) => ({ en, it: istatIt[i], cz: istatCz[i], origin: 'econ' })),
    ...guardianItems.map((en, i) => ({ en, it: guardianIt[i], cz: guardianCz[i], origin: 'guardian' })),
    ...stories.map((s, i) => ({ en: s.text, it: it[i], cz: cz[i], origin: 'world' })),
    ...dykItems.map((en, i) => ({ en, it: dykIt[i], cz: dykCz[i], origin: 'dyk' })),
  ],
  article: article ? {
    topic: article.topic,
    url: `https://en.wikipedia.org/wiki/${article.topic.replaceAll(' ', '_')}`,
    en: article.en,
    it: artIt[0],
    cz: artCz[0],
  } : null,
};

/* shadow věty: víc kandidátů, app mezi nimi rotuje */
out.shadows = out.stories
  .map(p => ({ it: firstSentence(p.it), cz: firstSentence(p.cz) }))
  .filter(s => s.it.length >= 30 && s.it.length <= 110)
  .map(s => ({ ...s, phon: phonSentence(s.it) }));
const sh = out.shadows[0] || null;
if (sh) out.shadow = sh;
mkdirSync('data/news', { recursive: true });
writeFileSync('data/news/daily.json', JSON.stringify(out, null, 2) + '\n');
console.log(`Zapsáno data/news/daily.json (${out.stories.length} zpráv, ${praha}).`);

/* ---- 5. archiv — trvale ukládat každý den, aby se nepřepisoval ---- */
mkdirSync('data/news/archive', { recursive: true });
const archiveEntry = {
  date: out.date,
  stories: out.stories,
  article: out.article,
};
writeFileSync(`data/news/archive/${praha}.json`, JSON.stringify(archiveEntry, null, 2) + '\n');

const indexPath = 'data/news/archive/index.json';
let archiveIndex = [];
try { archiveIndex = JSON.parse(readFileSync(indexPath, 'utf8')); } catch (e) { /* první běh */ }
archiveIndex = archiveIndex.filter(d => d.date !== praha);
archiveIndex.push({ date: praha, count: out.stories.length });
archiveIndex.sort((a, b) => b.date.localeCompare(a.date));
writeFileSync(indexPath, JSON.stringify(archiveIndex, null, 2) + '\n');
console.log(`Archiv: uloženo ${praha}.json, index má ${archiveIndex.length} dnů.`);
