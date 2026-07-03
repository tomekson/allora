/* allora — vanilla SPA, žádný build step, data = JSON, progress = localStorage */
'use strict';

const STORE_KEY = 'allora-progress';
const DAY = 86400000;

/* ---------------- state ---------------- */

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s === 'object') return Object.assign({ week: 1, srs: {}, days: [] }, s);
  } catch (e) { /* poškozený JSON → čistý start */ }
  return { week: 1, srs: {}, days: [] };
}

const state = loadState();
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(state));

const data = { vocab: null, curriculum: null, sessions: null, sessionCache: {} };

const todayStr = () => new Date().toISOString().slice(0, 10);

function markActivity() {
  const t = todayStr();
  if (!state.days.includes(t)) { state.days.push(t); save(); }
}

/* ---------------- TTS (Web Speech API, it-IT) ----------------
   iOS: speak() musí běžet z tap handleru — všechna volání jsou onclick. */

let itVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('it'));
  itVoice = voices.find(v => v.localService) || voices[0] || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function speak(text, rate = 0.88) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'it-IT';
  if (itVoice) u.voice = itVoice;
  u.rate = rate;
  speechSynthesis.speak(u);
}

/* ---------------- SRS (SM-2 lite) ---------------- */

function srsGrade(id, q) { // q: 0 znovu · 3 těžké · 4 dobré · 5 snadné
  const s = state.srs[id] || { ef: 2.5, reps: 0, interval: 0 };
  if (q < 3) {
    s.reps = 0;
    s.interval = 0;
  } else {
    if (s.reps === 0) s.interval = 1;
    else if (s.reps === 1) s.interval = 3;
    else s.interval = Math.round(s.interval * s.ef);
    s.reps++;
    s.ef = Math.max(1.3, s.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  }
  s.due = Date.now() + s.interval * DAY;
  state.srs[id] = s;
  markActivity();
  save();
}

function dueWords() {
  const now = Date.now();
  const due = [];
  const fresh = [];
  for (const w of data.vocab.words) {
    const s = state.srs[w.id];
    if (!s) fresh.push(w);
    else if (s.due <= now) due.push(w);
  }
  return due.concat(fresh);
}

/* ---------------- helpers ---------------- */

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function weekLevel(week) {
  if (week <= 4) return 'a1';
  if (week <= 8) return 'a2';
  return 'b1';
}

/* aktuální tappa = nejvyšší týden, pro který existuje lekce (stav obsahu, ne ruční přepínač) */
function currentWeek() {
  const ss = (data.sessions && data.sessions.sessions) || [];
  return ss.length ? Math.max(...ss.map(s => s.week)) : 1;
}

async function fetchJson(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(path + ' → ' + r.status);
  return r.json();
}

/* ---------------- Notizie ---------------- */

async function renderNotizie(el) {
  let daily = null;
  try { daily = await fetchJson('data/news/daily.json', { cache: 'no-cache' }); } catch (e) { /* zatím žádné denní zprávy */ }

  if (!daily || !daily.stories || !daily.stories.length) {
    el.innerHTML = `<h2>Notizie del giorno</h2>
      <div class="card"><p class="muted">Dnešní zprávy zatím nejsou k dispozici. Zkus to později.</p></div>`;
    return;
  }

  let html = '';
  if (daily && daily.shadow) {
    html += `
    <div class="shadow-box" style="margin-top:10px">
      <div class="muted">Shadow věta dne: 3× pomalu, 3× normálně</div>
      <div class="it">${esc(daily.shadow.it)}</div>
      <div class="phon">${esc(daily.shadow.phon)}</div>
      <div style="margin-top:8px">
        <button class="tts-btn" id="dshadow-tts">🔊 Ascolta</button>
        ${daily.shadow.cz ? '<button class="cz-toggle" id="dshadow-cz">🇨🇿 česky</button>' : ''}
      </div>
      ${daily.shadow.cz ? `<div class="cz-text hidden" id="dshadow-cztext">${esc(daily.shadow.cz)}</div>` : ''}
    </div>`;
  }
  if (daily && daily.stories && daily.stories.length) {
    html += `
    <div class="session-meta">
      <h2>Notizie del giorno</h2>
      <span class="muted">${daily.date}</span>
    </div>
    <p class="muted">Každé ráno čerstvé. Tapnutím na zprávu rozbalíš češtinu.</p>`;

    const groups = [
      { title: 'Dalla Cechia', items: daily.stories.filter(n => n.origin === 'cz') },
      { title: 'Dal mondo', items: daily.stories.filter(n => n.origin !== 'cz') },
    ].filter(g => g.items.length);

    groups.forEach((g, gi) => {
      html += `<div class="card digest"><h3>${esc(g.title)}</h3>`;
      g.items.forEach((n, i) => {
        html += `
        <div class="digest-item" data-g="${gi}" data-i="${i}">
          <button class="tts-mini" title="Ascolta">🔊</button>
          <div class="digest-text">
            <p class="testo">${esc(n.it)}</p>
            <p class="cz-line hidden">${esc(n.cz)}</p>
          </div>
          <span class="chev" aria-hidden="true">🇨🇿</span>
        </div>`;
      });
      html += `</div>`;
    });

    if (daily.article) {
      html += `
      <div class="card article">
        <h3>Approfondimento</h3>
        <p class="testo">${esc(daily.article.it)}</p>
        <button class="tts-btn" id="art-tts">🔊 Ascolta</button>
        <button class="cz-toggle" id="art-cz">🇨🇿 česky</button>
        <div class="cz-text hidden">${esc(daily.article.cz)}</div>
      </div>`;
    }

    html += `<p class="fonte">Zdroj: <a href="${esc(daily.sourceUrl)}">Wikipedia</a> (CC BY-SA) · překlad ${esc(daily.translator || 'automatický')}</p>`;

    // připrav skupiny pro event handlery
    renderNotizie._groups = groups;
  }

  el.innerHTML = html;

  if (daily.shadow) {
    $('#dshadow-tts').onclick = () => speak(daily.shadow.it, 0.75);
    const czBtn = $('#dshadow-cz');
    if (czBtn) czBtn.onclick = () => $('#dshadow-cztext').classList.toggle('hidden');
  }
  const groups = renderNotizie._groups || [];
  el.querySelectorAll('.digest-item').forEach(row => {
    const n = groups[+row.dataset.g].items[+row.dataset.i];
    row.querySelector('.tts-mini').onclick = e => { e.stopPropagation(); speak(n.it); };
    row.onclick = () => {
      row.querySelector('.cz-line').classList.toggle('hidden');
      row.classList.toggle('open');
    };
  });
  if (daily.article) {
    $('#art-tts').onclick = () => speak(daily.article.it);
    $('#art-cz').onclick = () => el.querySelector('.article .cz-text').classList.toggle('hidden');
  }
}

/* ---------------- Lezione ---------------- */

async function renderLezione(el) {
  if (!data.sessions) data.sessions = await fetchJson('data/sessions/index.json');
  const meta = data.sessions.sessions[data.sessions.sessions.length - 1];
  if (!data.sessionCache[meta.file]) {
    data.sessionCache[meta.file] = await fetchJson('data/sessions/' + meta.file);
  }
  const s = data.sessionCache[meta.file];
  const defaultLevel = weekLevel(currentWeek());

  let html = `
    <div class="session-meta">
      <h2>Lezione: ${esc(s.title)}</h2>
      <span class="muted">tappa ${s.week} · ${s.date}</span>
    </div>
    <p class="muted">Zprávy z lekce ve třech úrovních. Obtížnost přepneš tlačítky A1/A2/B1, čeština se přepne s ní.</p>
    <div class="card grammar">
      <h3>Grammatica: ${esc(s.grammar.point)}</h3>
      <p class="testo">${esc(s.grammar.summary)}</p>
    </div>`;

  s.notizie.forEach((n, i) => {
    html += `
    <div class="card notizia" data-idx="${i}">
      <h3>${esc(n.title)}</h3>
      <div class="level-chips" role="group">
        ${['a1', 'a2', 'b1'].map(l =>
          `<button data-level="${l}" class="${l === defaultLevel ? 'active' : ''}">${l}</button>`).join('')}
      </div>
      <p class="testo">${esc(n.levels[defaultLevel].it)}</p>
      <button class="tts-btn" data-tts="${i}">🔊 Ascolta</button>
      <button class="cz-toggle" data-cz="${i}">🇨🇿 česky</button>
      <div class="cz-text hidden">${esc(n.levels[defaultLevel].cz)}</div>
    </div>`;
  });

  html += `
    <div class="shadow-box">
      <div class="muted">Shadow věta: 3× pomalu, 3× normálně</div>
      <div class="it">${esc(s.shadow.it)}</div>
      <div class="phon">${esc(s.shadow.phon)}</div>
      <div style="margin-top:8px">
        <button class="tts-btn" id="shadow-tts">🔊 Ascolta</button>
        ${s.shadow.cz ? '<button class="cz-toggle" id="shadow-cz">🇨🇿 česky</button>' : ''}
      </div>
      ${s.shadow.cz ? `<div class="cz-text hidden" id="shadow-cztext">${esc(s.shadow.cz)}</div>` : ''}
    </div>
    <details class="pronuncia">
      <summary>Pronuncia · ${s.drills.length} výslovnostní drily</summary>`;

  s.drills.forEach(d => {
    html += `
    <div class="card drill">
      <strong>${esc(d.name)}</strong>
      <div class="shadow">${esc(d.shadow)}</div>
      <div class="trap">⚠️ ${esc(d.trap)}</div>
      <div class="fix">✓ ${esc(d.fix)}</div>
    </div>`;
  });

  html += `</details>`;

  el.innerHTML = html;

  el.querySelectorAll('.notizia').forEach(card => {
    const idx = +card.dataset.idx;
    const n = s.notizie[idx];
    let level = defaultLevel;
    card.querySelectorAll('.level-chips button').forEach(btn => {
      btn.onclick = () => {
        level = btn.dataset.level;
        card.querySelectorAll('.level-chips button').forEach(b => b.classList.toggle('active', b === btn));
        card.querySelector('.testo').textContent = n.levels[level].it;
        card.querySelector('.cz-text').textContent = n.levels[level].cz;
      };
    });
    card.querySelector('[data-tts]').onclick = () => speak(n.levels[level].it);
    card.querySelector('[data-cz]').onclick = () =>
      card.querySelector('.cz-text').classList.toggle('hidden');
  });

  $('#shadow-tts').onclick = () => speak(s.shadow.it, 0.75);
  const shCz = $('#shadow-cz');
  if (shCz) shCz.onclick = () => $('#shadow-cztext').classList.toggle('hidden');
}

/* ---------------- Parole (SRS flashcards) ---------------- */

let queue = [];
let flipped = false;

function renderParole(el) {
  queue = dueWords();
  drawCard(el);
}

function drawCard(el) {
  const total = data.vocab.words.length;
  if (!queue.length) {
    el.innerHTML = `
      <h2>Parole</h2>
      <div class="card done-box">
        <div class="big">🇮🇹</div>
        <h3>Perfetto! Na dnešek hotovo.</h3>
        <p class="muted">Všech ${total} kartiček zopakováno. Vrať se zítra, bude připravená další dávka opakování.</p>
      </div>`;
    return;
  }
  const w = queue[0];
  flipped = false;
  el.innerHTML = `
    <h2>Parole</h2>
    <p class="queue-info muted">zbývá ${queue.length} · celkem ${total} slov</p>
    <div class="flashcard" id="fc">
      <div class="front-word">${esc(w.it)}</div>
      <div class="pos">${esc(w.pos)}</div>
      <div id="fc-back" class="hidden">
        <div class="cz">${esc(w.cz)}</div>
        <div class="phon">${esc(w.phon)}</div>
        ${w.note ? `<div class="note">${esc(w.note)}</div>` : ''}
      </div>
      <div class="hint" id="fc-hint">tapni pro otočení</div>
    </div>
    <div style="text-align:center;margin-bottom:12px">
      <button class="tts-btn" id="fc-tts">🔊 Ascolta</button>
    </div>
    <div class="grade-row hidden" id="grades">
      <button class="g-again">Znovu</button>
      <button class="g-hard">Těžké</button>
      <button class="g-good">Dobré</button>
      <button class="g-easy">Snadné</button>
    </div>`;

  const ttsText = w.it.split('/')[0].trim();
  $('#fc-tts').onclick = e => { e.stopPropagation(); speak(ttsText); };
  $('#fc').onclick = () => {
    if (flipped) return;
    flipped = true;
    $('#fc-back').classList.remove('hidden');
    $('#fc-hint').classList.add('hidden');
    $('#grades').classList.remove('hidden');
  };
  const grade = q => { srsGrade(w.id, q); queue.shift(); if (q < 3) queue.push(w); drawCard(el); };
  el.querySelector('.g-again').onclick = () => grade(0);
  el.querySelector('.g-hard').onclick = () => grade(3);
  el.querySelector('.g-good').onclick = () => grade(4);
  el.querySelector('.g-easy').onclick = () => grade(5);
}

/* ---------------- Viaggio ---------------- */

function renderViaggio(el) {
  const week = currentWeek();
  let html = `
    <h2>Viaggio: cesta italštinou</h2>
    <p class="muted">Mapa tvé cesty. 12 týdnů, 12 měst, od začátků v Napoli po volnou konverzaci. Tappa se posune sama, jakmile v aplikaci přibude lekce dalšího města — nic tu nenastavuješ, jen vidíš, kde jsi a co tě čeká.</p>
    <div class="card" style="padding:4px 2px">`;
  for (const w of data.curriculum.weeks) {
    const cls = w.week < week ? 'done' : w.week === week ? 'current' : '';
    html += `
      <div class="week-row ${cls}">
        <div class="num">${w.week < week ? '✓' : w.week}</div>
        <div class="info">
          <div class="citta">${esc(w.citta)}</div>
          <div class="g">${esc(w.grammar)}</div>
          <div class="t">${esc(w.topic)}</div>
          ${w.week === week ? '<div class="muted" style="margin-top:4px">Tady právě jsi. Texty jedou na úrovni ' + weekLevel(week).toUpperCase() + '.</div>' : ''}
        </div>
      </div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
}

/* ---------------- Progresso ---------------- */

function streak() {
  const days = new Set(state.days);
  let n = 0;
  let d = new Date();
  if (!days.has(todayStr())) d = new Date(Date.now() - DAY); // dnešek ještě nemusí být
  while (days.has(d.toISOString().slice(0, 10))) { n++; d = new Date(d.getTime() - DAY); }
  return n;
}

function renderProgresso(el) {
  const total = data.vocab.words.length;
  const learned = Object.values(state.srs).filter(s => s.interval >= 21).length;
  const started = Object.keys(state.srs).length;
  const due = dueWords().length;

  el.innerHTML = `
    <h2>Progresso</h2>
    <div class="stat-grid">
      <div class="stat"><div class="val">${streak()} ☕</div><div class="lbl">dní v řadě</div></div>
      <div class="stat"><div class="val">${currentWeek()}/12</div><div class="lbl">tappa na cestě</div></div>
      <div class="stat"><div class="val">${started}/${total}</div><div class="lbl">slov v oběhu</div></div>
      <div class="stat"><div class="val">${learned}</div><div class="lbl">naučeno dlouhodobě</div></div>
      <div class="stat"><div class="val">${due}</div><div class="lbl">k opakování teď</div></div>
      <div class="stat"><div class="val">${state.days.length}</div><div class="lbl">dní s italštinou</div></div>
    </div>
    <h2>Data</h2>
    <div class="card">
      <p class="muted">Pokrok se ukládá jen v tomto zařízení. Přenos jinam: export → import.</p>
      <div class="btn-row">
        <button class="btn" id="btn-export">⬇️ Export</button>
        <button class="btn" id="btn-import">⬆️ Import</button>
        <button class="btn danger" id="btn-reset">Smazat progress</button>
      </div>
      <input type="file" id="import-file" accept=".json" class="hidden">
    </div>
`;

  $('#btn-export').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'allora-progress-' + todayStr() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#btn-import').onclick = () => $('#import-file').click();
  $('#import-file').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then(t => {
      const s = JSON.parse(t);
      if (!s || typeof s.srs !== 'object') throw new Error('bad file');
      Object.assign(state, { week: 1, srs: {}, days: [] }, s);
      save();
      renderProgresso(el);
    }).catch(() => alert('Soubor se nepodařilo načíst — je to export z allory?'));
  };
  $('#btn-reset').onclick = () => {
    if (!confirm('Opravdu smazat veškerý progress (SRS, streak, týden)?')) return;
    Object.assign(state, { week: 1, srs: {}, days: [] });
    save();
    renderProgresso(el);
  };
}

/* ---------------- router ---------------- */

const tabs = {
  notizie: renderNotizie,
  lezione: renderLezione,
  parole: renderParole,
  viaggio: renderViaggio,
  progresso: renderProgresso,
};

let currentTab = 'notizie';

function tabFromHash() {
  const t = (location.hash || '').replace(/^#\/?/, '');
  return tabs[t] ? t : 'notizie';
}

async function show(tab) {
  currentTab = tab;
  if (tabFromHash() !== tab) location.hash = tab;
  document.querySelectorAll('.tabbar button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  const el = $('#main');
  el.innerHTML = '<p class="muted" style="padding:20px">Caricamento…</p>';
  try {
    await tabs[tab](el);
  } catch (e) {
    el.innerHTML = `<div class="card"><strong>Chyba načítání dat</strong><p class="muted">${esc(e.message)}</p></div>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => {
  const t = tabFromHash();
  if (t !== currentTab) show(t);
});


/* ---------------- update banner + SW ---------------- */

async function checkVersion() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j.v !== APP_VERSION) $('#update-banner').classList.remove('hidden');
  } catch (e) { /* offline — v pohodě */ }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

async function applyUpdate() {
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(regs.map(r => r.update().catch(() => {})));
  } catch (e) { /* i tak reloadneme */ }
  location.reload();
}

$('#update-btn').onclick = () => {
  const btn = $('#update-btn');
  btn.disabled = true;
  btn.textContent = 'Aktualizuji…';
  applyUpdate();
};

/* ---------------- pull-to-refresh (mobil) ---------------- */

const ptr = $('#ptr');
let ptrStart = 0;
let ptrDist = 0;
let ptrActive = false;

async function ptrRefresh() {
  ptr.textContent = 'Aktualizuji…';
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j.v !== APP_VERSION) { await applyUpdate(); return; }
    data.sessions = null;
    data.sessionCache = {};
    await show(currentTab);
  } catch (e) { /* offline, nevadí */ }
  ptr.classList.add('hidden');
}

window.addEventListener('touchstart', e => {
  if (window.scrollY <= 0) {
    ptrStart = e.touches[0].clientY;
    ptrDist = 0;
    ptrActive = true;
  }
}, { passive: true });

window.addEventListener('touchmove', e => {
  if (!ptrActive) return;
  ptrDist = e.touches[0].clientY - ptrStart;
  if (ptrDist > 25 && window.scrollY <= 0) {
    ptr.classList.remove('hidden');
    ptr.textContent = ptrDist > 80 ? '↻ pusť pro obnovení' : '↓ přetáhni pro obnovení';
    ptr.style.transform = `translate(-50%, ${Math.min(ptrDist / 2.5, 44)}px)`;
  }
}, { passive: true });

window.addEventListener('touchend', () => {
  if (!ptrActive) return;
  ptrActive = false;
  ptr.style.transform = 'translate(-50%, 12px)';
  if (ptrDist > 80 && window.scrollY <= 0) ptrRefresh();
  else ptr.classList.add('hidden');
}, { passive: true });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

/* ---------------- plovoucí nahoru ---------------- */

const toTop = $('#to-top');
window.addEventListener('scroll', () => {
  toTop.classList.toggle('hidden', window.scrollY < 400);
}, { passive: true });
toTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

/* ---------------- init ---------------- */

(async function init() {
  document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => show(b.dataset.tab));
  $('#footer-version').textContent = 'v' + APP_VERSION;
  const [vocab, curriculum, sessions] = await Promise.all([
    fetchJson('data/vocab.json'),
    fetchJson('data/curriculum.json'),
    fetchJson('data/sessions/index.json'),
  ]);
  data.vocab = vocab;
  data.curriculum = curriculum;
  data.sessions = sessions;
  show(tabFromHash());
  checkVersion();
})();
