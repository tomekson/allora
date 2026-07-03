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

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + ' → ' + r.status);
  return r.json();
}

/* ---------------- Notizie ---------------- */

async function renderNotizie(el) {
  if (!data.sessions) data.sessions = await fetchJson('data/sessions/index.json');
  const meta = data.sessions.sessions[data.sessions.sessions.length - 1];
  if (!data.sessionCache[meta.file]) {
    data.sessionCache[meta.file] = await fetchJson('data/sessions/' + meta.file);
  }
  const s = data.sessionCache[meta.file];
  const defaultLevel = weekLevel(state.week);

  let html = `
    <div class="session-meta">
      <h2>${esc(s.title)}</h2>
      <span class="muted">tappa ${s.week} · ${s.date}</span>
    </div>
    <p class="muted">České zprávy v italštině. Obtížnost si u každé zprávy přepneš tlačítky.</p>`;

  s.notizie.forEach((n, i) => {
    html += `
    <div class="card notizia" data-idx="${i}">
      <h3>${esc(n.title)}</h3>
      <div class="level-chips" role="group">
        ${['a1', 'a2', 'b1'].map(l =>
          `<button data-level="${l}" class="${l === defaultLevel ? 'active' : ''}">${l}</button>`).join('')}
      </div>
      <p class="testo">${esc(n.levels[defaultLevel])}</p>
      <button class="tts-btn" data-tts="${i}">🔊 Ascolta</button>
      <button class="cz-toggle" data-cz="${i}">🇨🇿 co se stalo</button>
      <div class="cz-text hidden">${esc(n.cz)}</div>
    </div>`;
  });

  html += `
    <div class="shadow-box">
      <div class="muted">Shadow věta: 3× pomalu, 3× normálně</div>
      <div class="it">${esc(s.shadow.it)}</div>
      <div class="phon">${esc(s.shadow.phon)}</div>
      <button class="tts-btn" id="shadow-tts" style="margin-top:8px">🔊 Ascolta</button>
    </div>
    <h2>Pronuncia</h2>`;

  s.drills.forEach(d => {
    html += `
    <div class="card drill">
      <strong>${esc(d.name)}</strong>
      <div class="shadow">${esc(d.shadow)}</div>
      <div class="trap">⚠️ ${esc(d.trap)}</div>
      <div class="fix">✓ ${esc(d.fix)}</div>
    </div>`;
  });

  el.innerHTML = html;

  el.querySelectorAll('.notizia').forEach(card => {
    const idx = +card.dataset.idx;
    const n = s.notizie[idx];
    let level = defaultLevel;
    card.querySelectorAll('.level-chips button').forEach(btn => {
      btn.onclick = () => {
        level = btn.dataset.level;
        card.querySelectorAll('.level-chips button').forEach(b => b.classList.toggle('active', b === btn));
        card.querySelector('.testo').textContent = n.levels[level];
      };
    });
    card.querySelector('[data-tts]').onclick = () => speak(n.levels[level]);
    card.querySelector('[data-cz]').onclick = () =>
      card.querySelector('.cz-text').classList.toggle('hidden');
  });

  $('#shadow-tts').onclick = () => speak(s.shadow.it, 0.75);
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
        <p class="muted">Všech ${total} kartiček zopakováno. Vrať se zítra — bude připravená další dávka opakování.</p>
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
  let html = `
    <h2>Viaggio: 12 tapp po Itálii</h2>
    <p class="muted">Každý týden jedna tappa v jiném městě. Tapni na tu, kde právě jsi.</p>
    <div class="card" style="padding:4px 2px">`;
  for (const w of data.curriculum.weeks) {
    const cls = w.week < state.week ? 'done' : w.week === state.week ? 'current' : '';
    html += `
      <div class="week-row ${cls}" data-week="${w.week}">
        <div class="num">${w.week}</div>
        <div class="info">
          <div class="citta">${esc(w.citta)}</div>
          <div class="g">${esc(w.grammar)}</div>
          <div class="t">${esc(w.topic)} · ${w.level.toUpperCase()}</div>
        </div>
        <div class="ratio">${esc(w.ratio)}</div>
      </div>`;
  }
  html += `</div>`;
  el.innerHTML = html;

  el.querySelectorAll('.week-row').forEach(row => {
    row.onclick = () => {
      state.week = +row.dataset.week;
      save();
      updateWeekBadge();
      renderViaggio(el);
    };
  });
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
      <div class="stat"><div class="val">${state.week}/12</div><div class="lbl">tappa na cestě</div></div>
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
    <p class="muted" style="text-align:center;margin-top:16px">allora v${APP_VERSION}</p>`;

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
      updateWeekBadge();
      renderProgresso(el);
    }).catch(() => alert('Soubor se nepodařilo načíst — je to export z allory?'));
  };
  $('#btn-reset').onclick = () => {
    if (!confirm('Opravdu smazat veškerý progress (SRS, streak, týden)?')) return;
    Object.assign(state, { week: 1, srs: {}, days: [] });
    save();
    updateWeekBadge();
    renderProgresso(el);
  };
}

/* ---------------- router ---------------- */

const tabs = {
  notizie: renderNotizie,
  parole: renderParole,
  viaggio: renderViaggio,
  progresso: renderProgresso,
};

let currentTab = 'parole';

async function show(tab) {
  currentTab = tab;
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

function updateWeekBadge() {
  $('#week-badge').textContent = 'tappa ' + state.week;
}

/* ---------------- update banner + SW ---------------- */

async function checkVersion() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const j = await r.json();
    if (j.v !== APP_VERSION) $('#update-banner').classList.remove('hidden');
  } catch (e) { /* offline — v pohodě */ }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });

$('#update-btn').onclick = async () => {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) await reg.update();
  location.reload();
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

/* ---------------- init ---------------- */

(async function init() {
  document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => show(b.dataset.tab));
  $('#week-badge').onclick = () => show('viaggio');
  updateWeekBadge();
  const [vocab, curriculum] = await Promise.all([
    fetchJson('data/vocab.json'),
    fetchJson('data/curriculum.json'),
  ]);
  data.vocab = vocab;
  data.curriculum = curriculum;
  show(currentTab);
  checkVersion();
})();
