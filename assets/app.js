'use strict';
/* RootDeck UI. Root commands run through window.Native (MainActivity.java → RootShell.java). */

// ───────────────────────── helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const lines = s => (s || '').split('\n').filter(Boolean);
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const lastLine = s => (s || '').trim().split('\n').pop().slice(0, 160);
const nearest = (arr, v) => arr.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), arr[0]);

/** key=value lines → object */
function kv(text) {
  const o = {};
  for (const l of lines(text)) {
    const i = l.indexOf('=');
    if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return o;
}
/** `grep -H . files…` output → [[path, value], …] */
const ghx = text => lines(text).map(l => { const i = l.indexOf(':'); return [l.slice(0, i), l.slice(i + 1).trim()]; });

const store = {
  get(k, d) { try { const v = localStorage.getItem('rd.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rd.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};

const fmt = {
  ghz: khz => (!khz ? '–' : khz >= 1e6 ? (khz / 1e6).toFixed(2) + ' GHz' : Math.round(khz / 1000) + ' MHz'),
  gb: kb => (kb / 1048576).toFixed(kb >= 104857600 ? 0 : 1) + ' GB',
  size: bytes => bytes >= 1073741824 ? (bytes / 1073741824).toFixed(1) + ' GB' : bytes >= 1048576 ? Math.round(bytes / 1048576) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB',
  dur: s => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; },
  date: ms => (ms > 1262304000000 ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Factory'),
  n: n => Number(n).toLocaleString(),
  ago: ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; },
};

// ───────────────────────── native bridge
const N = window.Native;
let seq = 0;
const waiting = new Map();
window.RD_cb = (id, code, out) => {
  const f = waiting.get(id);
  if (f) { waiting.delete(id); f({ code, out }); }
};
const call = fn => new Promise(res => { const id = 'c' + ++seq; waiting.set(id, res); fn(id); });
/** Run as root. lane 1 = separate shell for long jobs so the dashboard keeps updating. */
const sh = (cmd, o = {}) => call(id => N.exec(id, cmd, o.timeout || 30, o.lane || 0));
const run = async (cmd, o) => (await sh(cmd, o)).out;
const okRes = r => r.code === 0 && !/(^|\n)\s*(Error|Failure|Failed|Exception|java\.lang)|Unknown package/i.test(r.out);
const haptic = k => { try { N.haptic(k || 0); } catch (e) { /* no haptics */ } };
function copy(text) {
  N.copy(String(text));
  if (N.sdk() < 33) toast('Copied', 'ok'); // Android 13+ shows its own clipboard confirmation
}
const writeCmd = (path, content, mode = '644') => `printf %s ${q(b64(content))} | base64 -d > ${q(path)} && chmod ${mode} ${q(path)}`;

// ───────────────────────── icons (24px stroke set)
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2.5"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2.5"/><path d="M22 11v2M6 10.5v3"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  memory: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10v4M11 10v4M15 10v4M7 18v2.5M12 18v2.5M17 18v2.5"/>',
  drive: '<rect x="2" y="13" width="20" height="8" rx="2"/><path d="M5 13 7.5 4h9L19 13M6.5 17h.01M10 17h.01"/>',
  thermo: '<path d="M14 14.76V4.5a2.5 2.5 0 0 0-5 0v10.26a4.5 4.5 0 1 0 5 0z"/><path d="M11.5 10v7"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  shieldok: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  terminal: '<rect x="2" y="3.5" width="20" height="17" rx="3"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4M5 17v3M3.5 18.5h3"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  snow: '<path d="M12 2v20M4.2 7l15.6 10M19.8 7 4.2 17"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  open: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="3"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c7 0 10 8 10 8a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 12s3 8 10 8a10.7 10.7 0 0 0 5.4-1.4M2 2l20 20M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>',
  half: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.4 1.3 2.7 2.5 2.7z"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M11 18h2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  trashx: '<path d="M18 6 6 18M6 6l12 12"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
const logo = id => `<svg viewBox="0 0 108 108" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--acc)"/><stop offset="1" style="stop-color:var(--acc2)"/></linearGradient></defs><path d="M54 22 79 31.5v19.5c0 15.5-10.5 27-25 32.5C39.5 78 29 66.5 29 51V31.5z" fill="url(#${id})" fill-opacity=".16" stroke="url(#${id})" stroke-width="5.5" stroke-linejoin="round"/><path d="M50.5 40 47 66.5M63 40l-3.5 26.5M41.5 48.5h26M40 58.5h26" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/></svg>`;
const head = (t, sub = '', right = '') => `<header class="vh"><div><h1>${t}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="vh-r">${right}</div>` : ''}</header>`;
const skel = (n, h = 80) => Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join('');
const empty = (icon, text) => `<div class="empty">${ic(icon)}<div>${esc(text)}</div></div>`;
const sw = (id, on, extra = '') => `<label class="switch"><input type="checkbox" ${id ? `id="${id}"` : ''} ${extra} ${on ? 'checked' : ''}><i></i></label>`;

// ───────────────────────── accents
const ACCENTS = {
  mint: ['#6ff2c1', '#3fb6ff', '#03140d'],
  sky: ['#7ab8ff', '#9b8cff', '#050d1c'],
  violet: ['#b69cff', '#ff86c8', '#120a24'],
  amber: ['#ffbe6b', '#ff7a59', '#1f1203'],
  rose: ['#ff86a8', '#ffb36b', '#22070f'],
};
const colors = { acc: '#6ff2c1', acc2: '#3fb6ff', ok: '#5ee39a' };
function applyAccent(k) {
  const a = ACCENTS[k] || ACCENTS.mint;
  const s = document.documentElement.style;
  s.setProperty('--acc', a[0]);
  s.setProperty('--acc2', a[1]);
  s.setProperty('--ink', a[2]);
  colors.acc = a[0];
  colors.acc2 = a[1];
}

// ───────────────────────── toast / sheet / confirm / pages
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = (kind === 'bad' ? ic('alert') : kind === 'ok' ? ic('check') : '') + `<span>${esc(msg)}</span>`;
  const box = $('#toasts');
  while (box.children.length > 2) box.firstChild.remove();
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, kind === 'bad' ? 3800 : 2400);
}

const sheets = [];
function sheet({ title = '', sub = '', body = '', onClose } = {}) {
  const root = document.createElement('div');
  root.className = 'sheet-wrap';
  root.innerHTML = `<div class="scrim"></div><div class="sheet"><div class="grab"></div>${title ? `<div class="sheet-head"><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div>` : ''}<div class="sheet-body">${body}</div></div>`;
  document.body.appendChild(root);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  const api = {
    el: root,
    body: $('.sheet-body', root),
    close() {
      if (api.closed) return;
      api.closed = true;
      root.classList.remove('open');
      sheets.splice(sheets.indexOf(api), 1);
      setTimeout(() => root.remove(), 380);
      if (onClose) onClose();
    },
  };
  $('.scrim', root).onclick = api.close;
  dragToClose($('.sheet', root), api);
  sheets.push(api);
  return api;
}
function dragToClose(el, api) {
  let y0 = null, dy = 0;
  el.addEventListener('touchstart', e => {
    const atTop = api.body.scrollTop <= 0 || e.target.closest('.grab,.sheet-head');
    if (!atTop || e.target.closest('input,.no-drag')) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 4) { el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (y0 == null) return;
    el.style.transition = ''; el.style.transform = '';
    if (dy > 110) api.close();
    y0 = null;
  });
}
function confirmBox({ title, msg = '', ok = 'Confirm', danger = false, icon = 'alert' }) {
  return new Promise(res => {
    let done = false;
    const s = sheet({
      body: `<div class="confirm${danger ? ' danger' : ''}"><div class="ci">${ic(icon)}</div><h3>${esc(title)}</h3><p>${esc(msg)}</p></div>
        <div class="row-btns" style="margin-top:22px"><button class="btn" data-a="no">Cancel</button><button class="btn ${danger ? 'danger' : 'acc'}" data-a="ok">${esc(ok)}</button></div>`,
      onClose: () => { if (!done) res(false); },
    });
    $('[data-a=ok]', s.el).onclick = () => { done = true; haptic(2); res(true); s.close(); };
    $('[data-a=no]', s.el).onclick = () => s.close();
  });
}
async function busy(btn, fn) {
  if (btn && btn.classList.contains('busy')) return;
  btn && btn.classList.add('busy');
  try { return await fn(); } finally { btn && btn.classList.remove('busy'); }
}

const pages = [];
function openPage(title, build, actions = '') {
  haptic();
  const el = document.createElement('div');
  el.className = 'page';
  el.innerHTML = `<div class="page-bar"><button class="icon-btn" data-back aria-label="Back">${ic('left')}</button><h2>${title}</h2><div class="page-act">${actions}</div></div><div class="page-body"></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  $('[data-back]', el).onclick = closePage;
  const body = $('.page-body', el);
  body.addEventListener('scroll', () => $('.page-bar', el).classList.toggle('sc', body.scrollTop > 4), { passive: true });
  pages.push(el);
  document.body.classList.add('paged');
  updatePoll();
  build(body, el);
  return el;
}
function closePage() {
  const el = pages.pop();
  if (!el) return;
  el.classList.remove('open');
  setTimeout(() => el.remove(), 360);
  document.body.classList.toggle('paged', pages.length > 0);
  updatePoll();
}

window.RD_back = () => {
  if (sheets.length) { sheets[sheets.length - 1].close(); return true; }
  if (pages.length) { closePage(); return true; }
  if (clearSel()) return true;
  if (cur !== 'home') { go('home'); return true; }
  return false;
};
window.RD_insets = i => {
  const s = document.documentElement.style;
  s.setProperty('--sat', i.t + 'px');
  s.setProperty('--sab', i.b + 'px');
  s.setProperty('--sal', i.l + 'px');
  s.setProperty('--sar', i.r + 'px');
  document.body.classList.toggle('ime', !!i.ime);
};
window.RD_vis = v => { state.visible = v; updatePoll(); };

// ───────────────────────── navigation
const state = { root: false, visible: true, info: {}, maxFreq: [], cores: 0 };
const TABS = [['home', 'home', 'Home'], ['tune', 'sliders', 'Tune'], ['apps', 'grid', 'Apps'], ['tools', 'wrench', 'Tools']];
let cur = 'home';

function buildTabbar() {
  $('#tabbar').innerHTML = '<span class="tab-ind"></span>' + TABS.map(([v, i, l]) => `<button class="tab${v === cur ? ' on' : ''}" data-go="${v}">${ic(i)}<span>${l}</span></button>`).join('');
  $$('.tab').forEach(t => (t.onclick = () => go(t.dataset.go)));
}
function go(v) {
  const view = $(`.view[data-view="${v}"]`);
  if (v === cur) { view.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  haptic();
  $(`.view[data-view="${cur}"]`).classList.remove('on');
  view.classList.add('on');
  cur = v;
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.go === v));
  $('.tab-ind').style.transform = `translateX(${TABS.findIndex(t => t[0] === v) * 100}%)`;
  if (v !== 'apps') clearSel();
  if (state.root && v === 'tune' && !tune.loaded) loadTune();
  if (state.root && v === 'apps' && !apps.loaded) loadApps();
  updatePoll();
}

// ───────────────────────── root gate
async function checkRoot() {
  const g = $('#gate');
  g.classList.remove('gone');
  $('#gateT').textContent = 'Requesting root';
  $('#gateP').textContent = 'Approve RootDeck in the Magisk prompt.';
  $('#gateBtn').classList.add('hide');
  $('.logo', g).classList.add('pulse');
  const r = await sh('id -u', { timeout: 40 });
  if (r.code === 0 && r.out.trim() === '0') {
    state.root = true;
    g.classList.add('gone');
    loadInfo();
    updatePoll();
    if (cur === 'tune' && !tune.loaded) loadTune();
    if (cur === 'apps' && !apps.loaded) loadApps();
    return;
  }
  state.root = false;
  $('.logo', g).classList.remove('pulse');
  $('#gateT').textContent = 'Root access needed';
  $('#gateP').innerHTML = 'Open <b>Magisk → Superuser</b>, allow <b>RootDeck</b>, then try again.<br><span class="muted">' + esc(lastLine(r.out)) + '</span>';
  $('#gateBtn').classList.remove('hide');
}

// ───────────────────────── HOME
const QA = [
  { ic: 'power', t: 'Reboot', s: 'Power menu', fn: () => rebootSheet() },
  { ic: 'phone', t: 'SystemUI', s: 'Restart', fn: restartSystemUi },
  { ic: 'memory', t: 'Free RAM', s: 'Drop caches', fn: freeRam },
  { ic: 'sparkles', t: 'Clean', s: 'App caches', fn: cleanCaches },
];
const TH_CATS = [
  ['CPU', /^(big|mid|little|cpu|cluster|apc|cpuss|soc_therm|soc$)/i],
  ['GPU', /g3d|gpu/i],
  ['TPU', /tpu|npu/i],
  ['Skin', /skin|quiet|xo_therm|neutral|disp_therm/i],
  ['Battery', /^batt|battery/i],
  ['Modem', /modem|mdm|^pa_therm/i],
  ['Charger', /usb|chg|charg/i],
];
const HIST = 40;
const live = { prev: null, cpu: [], cur: [] };

function renderHome() {
  $('#home').innerHTML = `
  <header class="brand">
    <div class="logo">${logo('lgH')}</div>
    <div class="brand-t"><b>RootDeck</b><span class="rs" id="rootState">Connecting…</span></div>
    <button class="icon-btn" id="btnMenu" aria-label="Settings">${ic('more')}</button>
  </header>
  <section class="card hero">
    <div class="hero-mesh"></div>
    <div class="hero-in">
      <div class="eyebrow" id="hSoc">&nbsp;</div>
      <h2 id="hDev">Your device</h2>
      <p id="hRom">Reading system…</p>
      <div class="hero-chips" id="hChips"></div>
    </div>
  </section>
  <div class="grid">
    <section class="card span2">
      <div class="card-h"><span class="ttl">${ic('cpu')}Processor</span><span class="muted" id="cpuMeta"></span></div>
      <div class="cpu-main"><div class="big-num"><span id="cpuPct">–</span><i>%</i><small>load</small></div><canvas class="spark" id="cpuSpark"></canvas></div>
      <div class="cores" id="cores"></div>
    </section>
    <section class="card span2">
      <div class="card-h"><span class="ttl">${ic('battery')}Battery</span><span class="pill" id="batSt">–</span></div>
      <div class="bat">
        <div class="ring-wrap" id="batWrap">
          <svg class="ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="ring-bg"/><circle cx="60" cy="60" r="52" class="ring-fg" id="batRing" pathLength="100" stroke-dasharray="0 100"/></svg>
          <div class="ring-c">${ic('bolt')}<b id="batLvl">–</b><span>%</span></div>
        </div>
        <div class="stats">
          <div><span>Current</span><b id="bCur">–</b></div>
          <div><span>Power</span><b id="bPow">–</b></div>
          <div><span>Temperature</span><b id="bTemp">–</b></div>
          <div><span>Voltage</span><b id="bVolt">–</b></div>
          <div><span>Health</span><b id="bHealth">–</b></div>
          <div><span>Cycles</span><b id="bCyc">–</b></div>
        </div>
      </div>
      <canvas class="spark sm" id="curSpark"></canvas>
    </section>
    <section class="card">
      <div class="card-h"><span class="ttl">${ic('memory')}Memory</span></div>
      <div class="mid-num"><b id="ramPct">–</b><i>%</i></div>
      <div class="bar"><i id="ramBar"></i></div>
      <div class="sub" id="ramTxt">–</div>
      <div class="bar thin"><i id="swapBar"></i></div>
      <div class="sub" id="swapTxt">–</div>
    </section>
    <section class="card">
      <div class="card-h"><span class="ttl">${ic('drive')}Storage</span></div>
      <div class="mid-num"><b id="stPct">–</b><i>%</i></div>
      <div class="bar"><i id="stBar"></i></div>
      <div class="sub" id="stTxt">–</div>
      <div class="sub" id="stFree">&nbsp;</div>
    </section>
    <section class="card span2">
      <div class="card-h"><span class="ttl">${ic('thermo')}Thermals</span><span class="muted" id="thMax"></span></div>
      <div class="therm" id="therm"><div class="skel" style="height:58px;grid-column:1/-1"></div></div>
    </section>
  </div>
  <div class="sec-t">Quick actions</div>
  <div class="qa">${QA.map((a, i) => `<button data-qa="${i}"><div class="qi">${ic(a.ic)}</div><b>${a.t}</b><span>${a.s}</span></button>`).join('')}</div>`;
  $('#btnMenu').onclick = settingsSheet;
  $$('[data-qa]').forEach(b => (b.onclick = () => { haptic(); QA[b.dataset.qa].fn(b); }));
}

const INFO = `echo "model=$(getprop ro.product.model)"
echo "market=$(getprop ro.product.marketname)"
echo "device=$(getprop ro.product.device)"
echo "android=$(getprop ro.build.version.release)"
echo "spl=$(getprop ro.build.version.security_patch)"
echo "crd=$(getprop ro.crdroid.build.version)"
echo "lin=$(getprop ro.lineage.build.version)"
echo "disp=$(getprop ro.build.display.id)"
echo "soc=$(getprop ro.soc.model)"
echo "kernel=$(uname -r)"
echo "selinux=$(getenforce 2>/dev/null)"
echo "magisk=$(magisk -v 2>/dev/null)"
echo "magiskf=$(grep -m1 '^MAGISK_VER=' /data/adb/magisk/util_functions.sh 2>/dev/null | cut -d= -f2)"
echo "cores=$(ls -d /sys/devices/system/cpu/cpu[0-9]* | wc -l)"
grep -H . /sys/devices/system/cpu/cpu*/cpufreq/cpuinfo_max_freq 2>/dev/null`;

async function loadInfo() {
  const t = await run(INFO);
  const o = kv(t);
  state.info = o;
  for (const [p, v] of ghx(t.split('\n').filter(l => l.startsWith('/')).join('\n'))) {
    const m = p.match(/cpu(\d+)\/cpufreq/);
    if (m) state.maxFreq[+m[1]] = +v;
  }
  const mg = (o.magisk || '').split(':')[0] || (o.magiskf || '').replace(/['"]/g, '');
  const rom = o.crd ? `crDroid ${o.crd}` : o.lin ? `LineageOS ${o.lin}` : (o.disp || '').split(' ')[0];
  $('#hDev').textContent = o.market || o.model || 'Android device';
  $('#hSoc').textContent = [o.soc, o.device].filter(Boolean).join(' · ') || 'Android';
  $('#hRom').textContent = [rom, o.android && `Android ${o.android}`].filter(Boolean).join(' · ');
  const kernel = (o.kernel || '').split('-')[0];
  $('#hChips').innerHTML = [
    mg && `<span>${ic('shieldok')}Magisk <b>${esc(mg)}</b></span>`,
    kernel && `<span>${ic('cpu')}Kernel <b>${esc(kernel)}</b></span>`,
    o.selinux && `<span>${ic('shield')}SELinux <b>${esc(o.selinux)}</b></span>`,
    `<span>${ic('clock')}Up <b id="hUp">–</b></span>`,
    o.spl && `<span>${ic('info')}Patch <b>${esc(o.spl)}</b></span>`,
  ].filter(Boolean).join('');
  const rs = $('#rootState');
  rs.className = 'rs ok';
  rs.textContent = mg ? `Rooted · Magisk ${mg}` : 'Root access granted';

  const n = +o.cores || state.maxFreq.length || 8;
  state.cores = n;
  const peak = Math.max(0, ...state.maxFreq.filter(Boolean));
  $('#cpuMeta').textContent = `${n} cores${peak ? ' · ' + fmt.ghz(peak) + ' peak' : ''}`;
  const cores = $('#cores');
  cores.style.setProperty('--n', n);
  cores.innerHTML = Array.from({ length: n }, (_, i) => `<div class="core"><div class="cb"><i id="cf${i}"></i></div><b id="cv${i}">–</b><span>C${i}</span></div>`).join('');
}

const LIVE = `head -n1 /proc/stat; echo @@
grep -H . /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq 2>/dev/null; echo @@
grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree):' /proc/meminfo; echo @@
B=/sys/class/power_supply/battery; grep -H . $B/capacity $B/status $B/health $B/temp $B/current_now $B/voltage_now $B/cycle_count $B/charge_full $B/charge_full_design 2>/dev/null; echo @@
grep -H . /sys/class/thermal/thermal_zone*/type /sys/class/thermal/thermal_zone*/temp 2>/dev/null; echo @@
cat /proc/uptime; echo @@
df -k /data 2>/dev/null | tail -n 1`;

const push = (arr, v) => { arr.push(v); if (arr.length > HIST) arr.shift(); };
const tempCls = t => (t < 40 ? 'ok' : t < 48 ? 'warn' : 'bad');

async function refreshLive() {
  const [stat, freq, mem, bat, th, up, df] = (await run(LIVE)).split(/^@@$/m).map(s => s.trim());

  // CPU load from /proc/stat deltas
  const v = (stat || '').split(/\s+/).slice(1, 9).map(Number);
  if (v.length >= 5) {
    const total = v.reduce((a, b) => a + b, 0), idle = v[3] + v[4];
    if (live.prev) {
      const dt = total - live.prev[0], di = idle - live.prev[1];
      if (dt > 0) {
        const pct = clamp(Math.round((1 - di / dt) * 100), 0, 100);
        push(live.cpu, pct);
        $('#cpuPct').textContent = pct;
        spark($('#cpuSpark'), live.cpu, { min: 0, max: 100, color: colors.acc });
      }
    }
    live.prev = [total, idle];
  }
  const seen = new Set();
  for (const [p, val] of ghx(freq)) {
    const m = p.match(/cpu(\d+)\//);
    const bar = m && $('#cf' + m[1]);
    if (!bar) continue;
    const i = +m[1], f = +val;
    seen.add(i);
    bar.style.height = clamp((f / (state.maxFreq[i] || 3e6)) * 100, 4, 100) + '%';
    $('#cv' + i).textContent = (f / 1e6).toFixed(1);
  }
  for (let i = 0; i < state.cores; i++) {
    if (seen.has(i) || !$('#cv' + i)) continue;
    $('#cf' + i).style.height = '0%';
    $('#cv' + i).textContent = 'off';
  }

  // Memory
  const mm = {};
  for (const l of lines(mem)) { const m = l.match(/^(\w+):\s+(\d+)/); if (m) mm[m[1]] = +m[2]; }
  if (mm.MemTotal) {
    const used = mm.MemTotal - (mm.MemAvailable || 0), pct = Math.round((used / mm.MemTotal) * 100);
    $('#ramPct').textContent = pct;
    $('#ramBar').style.width = pct + '%';
    $('#ramTxt').innerHTML = `${fmt.gb(used)} <em>of ${fmt.gb(mm.MemTotal)}</em>`;
  }
  if (mm.SwapTotal) {
    const su = mm.SwapTotal - mm.SwapFree;
    $('#swapBar').style.width = Math.round((su / mm.SwapTotal) * 100) + '%';
    $('#swapTxt').innerHTML = `Swap ${fmt.gb(su)} <em>of ${fmt.gb(mm.SwapTotal)}</em>`;
  } else $('#swapTxt').innerHTML = '<em>No swap / zram</em>';

  // Battery
  const b = {};
  for (const [p, val] of ghx(bat)) b[p.split('/').pop()] = val;
  const lvl = num(b.capacity), st = b.status || '';
  if (lvl != null) {
    $('#batLvl').textContent = lvl;
    const ring = $('#batRing');
    ring.setAttribute('stroke-dasharray', `${lvl} 100`);
    ring.style.stroke = lvl <= 15 ? 'var(--bad)' : lvl <= 30 ? 'var(--warn)' : st === 'Charging' ? 'var(--ok)' : '';
  }
  const pill = $('#batSt');
  pill.textContent = st || '–';
  pill.className = 'pill ' + (st === 'Charging' ? 'ok' : st === 'Full' ? 'acc' : '');
  $('#batWrap').classList.toggle('chg', st === 'Charging');
  let ma = num(b.current_now);
  let volt = num(b.voltage_now);
  if (volt != null) { volt = volt > 1e5 ? volt / 1e6 : volt > 100 ? volt / 1000 : volt; $('#bVolt').textContent = volt.toFixed(2) + ' V'; }
  if (ma != null) {
    ma = Math.abs(ma) > 20000 ? Math.abs(ma) / 1000 : Math.abs(ma); // µA on most kernels
    const charging = st === 'Charging';
    const cur = $('#bCur');
    cur.textContent = `${charging ? '+' : '−'}${Math.round(ma)} mA`;
    cur.style.color = charging ? 'var(--ok)' : '';
    if (volt) $('#bPow').textContent = ((ma / 1000) * volt).toFixed(2) + ' W';
    push(live.cur, ma);
    spark($('#curSpark'), live.cur, { color: charging ? colors.ok : colors.acc2 });
  }
  const tb = num(b.temp);
  const batT = tb == null ? null : tb > 200 ? tb / 10 : tb;
  if (batT != null) { const el = $('#bTemp'); el.textContent = batT.toFixed(1) + ' °C'; el.style.color = `var(--${tempCls(batT)})`; }
  const cf = num(b.charge_full), cd = num(b.charge_full_design);
  const hp = cf && cd ? Math.round((cf / cd) * 100) : null;
  $('#bHealth').textContent = [b.health, hp && hp <= 120 ? hp + '%' : null].filter(Boolean).join(' · ') || '–';
  $('#bCyc').textContent = b.cycle_count || '–';

  // Thermals, grouped into readable categories
  const zones = {};
  for (const [p, val] of ghx(th)) {
    const m = p.match(/thermal_zone(\d+)\/(type|temp)$/);
    if (m) (zones[m[1]] = zones[m[1]] || {})[m[2]] = val;
  }
  const cats = {};
  for (const z of Object.values(zones)) {
    let t = num(z.temp);
    if (!z.type || t == null) continue;
    if (Math.abs(t) >= 1000) t /= 1000; else if (Math.abs(t) >= 200) t /= 10;
    if (t <= 0 || t > 130) continue;
    const c = TH_CATS.find(([, re]) => re.test(z.type));
    if (c) cats[c[0]] = Math.max(cats[c[0]] ?? -1, t);
  }
  if (batT != null && cats.Battery == null) cats.Battery = batT;
  const shown = TH_CATS.map(c => c[0]).filter(k => cats[k] != null);
  $('#therm').innerHTML = shown.length
    ? shown.map(k => `<div class="th ${tempCls(cats[k])}"><span>${k}</span><b>${cats[k].toFixed(1)}<small>°C</small></b></div>`).join('')
    : '<div class="muted">No thermal sensors readable</div>';
  const peak = Math.max(...shown.map(k => cats[k]));
  $('#thMax').textContent = shown.length ? `Peak ${peak.toFixed(0)}°C` : '';

  // Uptime + storage
  const upS = num((up || '').split(' ')[0]);
  const hUp = $('#hUp');
  if (upS != null && hUp) hUp.textContent = fmt.dur(upS);
  const d = (df || '').split(/\s+/);
  const total = +d[1], avail = +d[3];
  if (total) {
    const used = total - avail, pct = Math.round((used / total) * 100);
    $('#stPct').textContent = pct;
    $('#stBar').style.width = pct + '%';
    $('#stTxt').innerHTML = `${fmt.gb(used)} <em>of ${fmt.gb(total)}</em>`;
    $('#stFree').innerHTML = `<em>${fmt.gb(avail)} free</em>`;
  }
}

/** Minimal sparkline: newest sample on the right, soft gradient fill. */
function spark(cv, data, { min, max, color }) {
  if (!cv) return;
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  let lo = min ?? Math.min(...data), hi = max ?? Math.max(...data);
  if (min == null) { const pad = (hi - lo) * 0.25 || 10; lo = Math.max(0, lo - pad); hi += pad; }
  const step = w / (HIST - 1);
  const X = i => w - (data.length - 1 - i) * step;
  const Y = v => h - 3 - ((clamp(v, lo, hi) - lo) / (hi - lo || 1)) * (h - 6);
  c.beginPath();
  data.forEach((v, i) => {
    if (!i) { c.moveTo(X(i), Y(v)); return; }
    const xm = (X(i - 1) + X(i)) / 2;
    c.bezierCurveTo(xm, Y(data[i - 1]), xm, Y(v), X(i), Y(v));
  });
  c.strokeStyle = color; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
  c.lineTo(X(data.length - 1), h); c.lineTo(X(0), h); c.closePath();
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
  c.fillStyle = g; c.fill();
  const lx = X(data.length - 1), ly = Y(data[data.length - 1]);
  c.beginPath(); c.arc(lx - 3, ly, 3, 0, Math.PI * 2); c.fillStyle = color; c.fill();
}

const poll = { on: false, gen: 0 };
function updatePoll() {
  const should = state.root && state.visible && cur === 'home' && !pages.length;
  if (should && !poll.on) {
    poll.on = true;
    const g = ++poll.gen;
    (async () => {
      while (poll.on && g === poll.gen) {
        try { await refreshLive(); } catch (e) { console.error(e); }
        await sleep(store.get('interval', 2000));
      }
    })();
  } else if (!should && poll.on) {
    poll.on = false;
    poll.gen++;
  }
}

async function restartSystemUi() {
  if (await confirmBox({ title: 'Restart SystemUI?', msg: 'Status bar, navigation and lock screen reload for a moment.', ok: 'Restart', icon: 'phone' })) {
    await sh('kill $(pidof com.android.systemui)');
  }
}
async function freeRam(btn) {
  await busy(btn, async () => {
    const r = await run(`a=$(grep MemAvailable /proc/meminfo | tr -dc 0-9); sync; echo 3 > /proc/sys/vm/drop_caches; am kill-all; sleep 1; b=$(grep MemAvailable /proc/meminfo | tr -dc 0-9); echo "$a $b"`, { lane: 1 });
    const [a, b] = r.trim().split(/\s+/).map(Number);
    toast(b > a ? `Freed ${fmt.size((b - a) * 1024)} of RAM` : 'Memory is already lean', 'ok');
  });
}
async function cleanCaches(btn) {
  await busy(btn, async () => {
    const free = `df -k /data | tail -n1 | tr -s ' ' | cut -d' ' -f4`;
    const r = await run(`a=$(${free}); pm trim-caches 999G; sleep 1; b=$(${free}); echo "$a $b"`, { lane: 1, timeout: 180 });
    const [a, b] = r.trim().split(/\s+/).map(Number);
    toast(b > a ? `Cleared ${fmt.size((b - a) * 1024)} of cache` : 'Caches are already clean', 'ok');
  });
}

const REBOOT = [
  { n: 'Reboot', ic: 'refresh', c: 'svc power reboot', col: 'var(--acc)' },
  { n: 'Power off', ic: 'power', c: 'svc power shutdown', col: 'var(--bad)' },
  { n: 'Recovery', ic: 'shield', c: 'reboot recovery', col: 'var(--warn)' },
  { n: 'Bootloader', ic: 'cpu', c: 'reboot bootloader', col: 'var(--info)' },
  { n: 'Fastbootd', ic: 'terminal', c: 'reboot fastboot', col: '#b69cff' },
  { n: 'Soft reboot', ic: 'bolt', c: 'setprop ctl.restart zygote', col: 'var(--acc2)' },
];
function rebootSheet() {
  const s = sheet({
    title: 'Power menu',
    sub: 'Soft reboot restarts Android without rebooting the kernel',
    body: `<div class="reboot">${REBOOT.map((r, i) => `<button data-r="${i}" style="--c:${r.col}">${ic(r.ic)}${r.n}</button>`).join('')}</div>`,
  });
  $$('[data-r]', s.el).forEach(b => (b.onclick = async () => {
    const r = REBOOT[b.dataset.r];
    s.close();
    if (await confirmBox({ title: `${r.n}?`, msg: 'Unsaved work in open apps may be lost.', ok: r.n, danger: true, icon: r.ic })) {
      toast(`${r.n}…`);
      sh(r.c);
    }
  }));
}

function settingsSheet() {
  const acc = store.get('accent', 'mint'), iv = store.get('interval', 2000);
  const s = sheet({
    title: 'Settings',
    body: `<label class="lbl">Accent colour</label>
      <div class="swatches">${Object.entries(ACCENTS).map(([k, a]) => `<button class="sw${k === acc ? ' on' : ''}" data-acc="${k}" style="--c:${a[0]}" aria-label="${k}"></button>`).join('')}</div>
      <label class="lbl" style="margin-top:22px">Dashboard refresh</label>
      <div class="chips">${[1000, 2000, 5000].map(v => `<button class="chip${v === iv ? ' on' : ''}" data-iv="${v}">Every ${v / 1000}s</button>`).join('')}</div>
      <div class="kv" style="margin-top:22px">
        <div><span>Version</span><b>${esc(N.version())}</b></div>
        <div><span>Root</span><b>${state.root ? 'Granted' : 'Not granted'}</b></div>
        <div><span>Boot script</span><b class="mono">/data/adb/service.d/rootdeck.sh</b></div>
      </div>
      <div class="row-btns"><button class="btn" data-a="root">${ic('shield')}Re-check root</button></div>`,
  });
  $$('[data-acc]', s.el).forEach(b => (b.onclick = () => {
    haptic();
    store.set('accent', b.dataset.acc);
    applyAccent(b.dataset.acc);
    $$('[data-acc]', s.el).forEach(x => x.classList.toggle('on', x === b));
  }));
  $$('[data-iv]', s.el).forEach(b => (b.onclick = () => {
    store.set('interval', +b.dataset.iv);
    $$('[data-iv]', s.el).forEach(x => x.classList.toggle('on', x === b));
  }));
  $('[data-a=root]', s.el).onclick = () => { s.close(); checkRoot(); };
}

// ───────────────────────── TUNE
const CPUFREQ = '/sys/devices/system/cpu/cpufreq';
const BOOT_PATH = '/data/adb/service.d/rootdeck.sh';
const BLOCKS = '/sys/block/sd? /sys/block/mmcblk? /sys/block/nvme?n?';
const PROFILES = [
  { id: 'battery', n: 'Battery', ic: 'leaf', d: 'Caps peak clocks ~70% for a cooler phone' },
  { id: 'balanced', n: 'Balanced', ic: 'half', d: 'Stock kernel behaviour' },
  { id: 'perf', n: 'Performance', ic: 'flame', d: 'Raises minimum clocks for snappier response' },
];
const ANIMS = [[0, 'Off'], [0.5, '0.5×'], [0.75, '0.75×'], [1, '1×'], [1.5, '1.5×']];
const tune = { loaded: false, pol: [], sys: {}, stock: null };

const TUNE_READ = `for p in ${CPUFREQ}/policy*; do echo "@@\${p##*/}"; grep -H . $p/related_cpus $p/scaling_governor $p/scaling_available_governors $p/scaling_available_frequencies $p/scaling_min_freq $p/scaling_max_freq $p/cpuinfo_min_freq $p/cpuinfo_max_freq 2>/dev/null; done
echo "@@sys"
for b in ${BLOCKS}; do [ -f $b/queue/scheduler ] && { echo "io=$(cat $b/queue/scheduler)"; break; }; done
echo "tcp=$(cat /proc/sys/net/ipv4/tcp_congestion_control)"
echo "tcpa=$(cat /proc/sys/net/ipv4/tcp_available_congestion_control)"
echo "swap=$(cat /proc/sys/vm/swappiness)"
wm density | sed 's/^Physical density: /dpi_phys=/;s/^Override density: /dpi_over=/'
echo "anim=$(settings get global window_animation_scale)"
echo "peak=$(settings get system peak_refresh_rate)"
echo "minr=$(settings get system min_refresh_rate)"
echo "fps=$(dumpsys display | grep -oE 'fps=[0-9.]+' | sort -u | tr '\\n' ' ')"
for f in /sys/devices/platform/google,charger/charge_stop_level /sys/class/power_supply/battery/charge_control_end_threshold; do [ -f "$f" ] && { echo "chgp=$f"; echo "chg=$(cat $f)"; break; }; done
[ -f ${BOOT_PATH} ] && echo boot=1`;

const ioParse = s => { const list = (s || '').replace(/[[\]]/g, '').split(/\s+/).filter(Boolean); const m = (s || '').match(/\[(.+?)\]/); return { list, cur: m ? m[1] : list[0] }; };
const cpuRange = c => (c.length > 1 ? `CPU ${c[0]}–${c[c.length - 1]}` : `CPU ${c[0] ?? '?'}`);
const applied = () => { const a = store.get('applied', {}); a.pol = a.pol || {}; return a; };

async function loadTune(silent) {
  if (!silent) $('#tune').innerHTML = head('Tune', 'Reading kernel…') + skel(1, 150) + skel(3, 220);
  const t = await run(TUNE_READ, { timeout: 45 });
  const pol = [], sys = {};
  let p = null;
  for (const line of t.split('\n')) {
    if (line.startsWith('@@')) {
      const id = line.slice(2).trim();
      p = id === 'sys' ? null : { id, path: `${CPUFREQ}/${id}` };
      if (p) pol.push(p);
      continue;
    }
    if (p) { const m = line.match(/\/(\w+):(.*)$/); if (m) p[m[1]] = m[2].trim(); continue; }
    const i = line.indexOf('=');
    if (i > 0) sys[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const x of pol) {
    x.cpus = (x.related_cpus || '').split(/\s+/).filter(Boolean).map(Number);
    x.govs = (x.scaling_available_governors || x.scaling_governor || '').split(/\s+/).filter(Boolean);
    x.freqs = (x.scaling_available_frequencies || '').split(/\s+/).filter(Boolean).map(Number).sort((a, b) => a - b);
    if (!x.freqs.length) x.freqs = [+x.cpuinfo_min_freq, +x.cpuinfo_max_freq].filter(Boolean);
    x.gov = x.scaling_governor;
    x.min = +x.scaling_min_freq;
    x.max = +x.scaling_max_freq;
  }
  pol.sort((a, b) => (a.cpus[0] ?? 0) - (b.cpus[0] ?? 0));
  const names = pol.length === 1 ? ['CPU'] : pol.length === 2 ? ['Little', 'Big'] : pol.length === 3 ? ['Little', 'Big', 'Prime'] : ['Little', 'Mid', 'Big', 'Prime'];
  pol.forEach((x, i) => (x.name = names[i] || `Cluster ${i + 1}`));

  // Remember the very first values we ever saw as "stock" so everything can be undone.
  let stock = store.get('stock');
  if (!stock) {
    stock = { pol: {}, io: ioParse(sys.io).cur, tcp: sys.tcp, swap: num(sys.swap) };
    for (const x of pol) stock.pol[x.id] = { gov: x.gov, min: x.min, max: x.max };
    store.set('stock', stock);
  }
  Object.assign(tune, { loaded: true, pol, sys, stock });
  renderTune();
}

function clusterCard(p) {
  const idx = v => Math.max(0, p.freqs.indexOf(nearest(p.freqs, v)));
  const n = p.freqs.length - 1;
  return `<section class="card cl" data-pol="${p.id}">
    <div class="card-h"><span class="ttl"><span class="cl-dot"></span>${p.name}<span class="muted">${cpuRange(p.cpus)}</span></span><span class="pill">${fmt.ghz(+p.cpuinfo_max_freq)}</span></div>
    <label class="lbl">Governor</label>
    <div class="chips">${p.govs.map(g => `<button class="chip${g === p.gov ? ' on' : ''}" data-gov="${esc(g)}">${esc(g)}</button>`).join('')}</div>
    ${n > 0 ? `<div class="range-row"><span>Max frequency</span><output data-o="max">${fmt.ghz(p.max)}</output></div>
    <input type="range" min="0" max="${n}" step="1" value="${idx(p.max)}" data-r="max">
    <div class="range-row"><span>Min frequency</span><output data-o="min">${fmt.ghz(p.min)}</output></div>
    <input type="range" min="0" max="${n}" step="1" value="${idx(p.min)}" data-r="min">` : ''}
  </section>`;
}
const setFill = r => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min || 1)) * 100 + '%');

function renderTune() {
  const { pol, sys } = tune;
  const prof = store.get('profile', 'balanced');
  const io = ioParse(sys.io);
  const tcpa = (sys.tcpa || '').split(/\s+/).filter(Boolean);
  const fpsList = [...new Set((sys.fps || '').split(/\s+/).map(f => Math.round(+f.replace('fps=', ''))).filter(Boolean))].sort((a, b) => a - b);
  const maxFps = fpsList[fpsList.length - 1] || 0;
  const forced = maxFps > 60 && num(sys.minr) >= maxFps - 1;
  const dpi = num(sys.dpi_over) || num(sys.dpi_phys) || 0;
  const anim = sys.anim === 'null' || sys.anim === '' ? 1 : num(sys.anim);
  const chg = num(sys.chg) || 100;

  let h = head('Tune', `${pol.length} CPU clusters · applied instantly`, `<button class="icon-btn" id="tuneRef" aria-label="Reload">${ic('refresh')}</button>`);
  h += `<div class="sec-t">Profile</div>
    <div class="profiles">${PROFILES.map(p => `<button class="prof${prof === p.id ? ' on' : ''}" data-prof="${p.id}"><div class="pi">${ic(p.ic)}</div><b>${p.n}</b><span>${p.d}</span></button>`).join('')}</div>`;
  if (pol.length) h += `<div class="sec-t">CPU clusters</div>` + pol.map(clusterCard).join('');
  if (sys.chgp) {
    h += `<div class="sec-t">Battery</div><section class="card">
      <div class="set-row"><div class="li-t"><b>Charge limit</b><span>Stop charging early to slow battery wear</span></div><span class="pill acc" id="chgOut">${chg >= 100 ? 'Off' : chg + '%'}</span></div>
      <input type="range" min="50" max="100" step="5" value="${chg}" id="chgR" style="margin-top:14px">
    </section>`;
  }
  h += `<div class="sec-t">Display</div><section class="card">
    ${maxFps > 60 ? `<div class="set-row"><div class="li-t"><b>Force ${maxFps} Hz</b><span>Keep the panel at its peak refresh rate</span></div>${sw('fpsSw', forced)}</div><div class="divider"></div>` : ''}
    <div class="set-row"><div class="li-t"><b>Screen density</b><span>${sys.dpi_phys ? `Stock ${sys.dpi_phys} dpi · lower shows more` : 'DPI override'}</span></div></div>
    <div class="set-row"><div class="stepper"><button data-dpi="-10" aria-label="Less">${ic('minus')}</button><output id="dpiOut">${dpi}</output><button data-dpi="10" aria-label="More">${ic('plus')}</button></div>
      <div style="display:flex;gap:8px"><button class="btn" id="dpiReset">Reset</button><button class="btn acc" id="dpiApply">Apply</button></div></div>
    <div class="divider"></div>
    <label class="lbl">Animation speed</label>
    <div class="chips">${ANIMS.map(([v, l]) => `<button class="chip${anim === v ? ' on' : ''}" data-anim="${v}">${l}</button>`).join('')}</div>
  </section>`;
  h += `<div class="sec-t">System</div><section class="card">
    ${io.list.length ? `<label class="lbl">I/O scheduler</label><div class="chips">${io.list.map(s => `<button class="chip${s === io.cur ? ' on' : ''}" data-io="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
    ${tcpa.length ? `<label class="lbl">TCP congestion control</label><div class="chips">${tcpa.map(s => `<button class="chip${s === sys.tcp ? ' on' : ''}" data-tcp="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
    ${sys.swap ? `<div class="range-row"><span>Swappiness</span><output id="swOut">${sys.swap}</output></div><input type="range" min="0" max="200" step="10" value="${sys.swap}" id="swR">` : ''}
  </section>`;
  h += `<div class="sec-t">Persistence</div><section class="card">
    <div class="set-row"><div class="li-t"><b>Apply at boot</b><span>Re-apply CPU, I/O, TCP, swappiness and charge limit after every reboot</span></div>${sw('bootSw', !!sys.boot)}</div>
    <div class="row-btns"><button class="btn danger block" id="stockBtn">${ic('undo')}Restore stock values</button></div>
  </section>
  <div class="note">${ic('info')}<span>Kernel values reset on reboot unless “Apply at boot” is on. Display settings always stick. The power HAL may still boost clocks briefly on touch.</span></div>`;

  const root = $('#tune');
  root.innerHTML = h;
  $('#tuneRef').onclick = () => loadTune();
  $$('[data-prof]', root).forEach(b => (b.onclick = () => applyProfile(b.dataset.prof)));
  $$('.cl', root).forEach(card => {
    const p = tune.pol.find(x => x.id === card.dataset.pol);
    $$('[data-gov]', card).forEach(b => (b.onclick = () => setPolicy(p, { gov: b.dataset.gov })));
    const rMax = $('[data-r=max]', card), rMin = $('[data-r=min]', card);
    if (!rMax) return;
    const sync = () => [rMax, rMin].forEach(x => { setFill(x); $(`[data-o=${x.dataset.r}]`, card).textContent = fmt.ghz(p.freqs[x.value]); });
    sync();
    rMax.oninput = () => { if (+rMax.value < +rMin.value) rMin.value = rMax.value; sync(); };
    rMin.oninput = () => { if (+rMin.value > +rMax.value) rMax.value = rMin.value; sync(); };
    rMax.onchange = rMin.onchange = () => setPolicy(p, { min: p.freqs[rMin.value], max: p.freqs[rMax.value] });
  });

  const chgR = $('#chgR');
  if (chgR) {
    setFill(chgR);
    chgR.oninput = () => { setFill(chgR); $('#chgOut').textContent = +chgR.value >= 100 ? 'Off' : chgR.value + '%'; };
    chgR.onchange = () => setChargeLimit(+chgR.value);
  }
  const fpsSw = $('#fpsSw');
  if (fpsSw) fpsSw.onchange = () => forceFps(fpsSw.checked, maxFps);
  let dpiV = dpi;
  $$('[data-dpi]', root).forEach(b => (b.onclick = () => { haptic(); dpiV = clamp(dpiV + +b.dataset.dpi, 160, 800); $('#dpiOut').textContent = dpiV; }));
  $('#dpiApply').onclick = async () => {
    if (!(await confirmBox({ title: `Set density to ${dpiV}?`, msg: 'Apps relaunch with the new size. Use Reset here if anything looks off.', ok: 'Apply', icon: 'phone' }))) return;
    if (okRes(await sh(`wm density ${dpiV}`))) toast(`Density set to ${dpiV}`, 'ok');
  };
  $('#dpiReset').onclick = async () => {
    await sh('wm density reset');
    toast('Density reset', 'ok');
    $('#dpiOut').textContent = dpiV = num(sys.dpi_phys) || dpiV;
  };
  $$('[data-anim]', root).forEach(b => (b.onclick = async () => {
    haptic();
    const v = b.dataset.anim;
    await sh(['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'].map(k => `settings put global ${k} ${v}`).join('; '));
    $$('[data-anim]', root).forEach(x => x.classList.toggle('on', x === b));
    toast(`Animations ${b.textContent}`, 'ok');
  }));
  $$('[data-io]', root).forEach(b => (b.onclick = () => setSys('io', b.dataset.io, b)));
  $$('[data-tcp]', root).forEach(b => (b.onclick = () => setSys('tcp', b.dataset.tcp, b)));
  const swR = $('#swR');
  if (swR) {
    setFill(swR);
    swR.oninput = () => { setFill(swR); $('#swOut').textContent = swR.value; };
    swR.onchange = () => setSys('swap', +swR.value);
  }
  $('#bootSw').onchange = e => setBoot(e.target.checked);
  $('#stockBtn').onclick = e => restoreStock(e.currentTarget);
}

function refreshCard(p) {
  const card = $(`.cl[data-pol="${p.id}"]`);
  if (!card) return;
  $$('[data-gov]', card).forEach(b => b.classList.toggle('on', b.dataset.gov === p.gov));
  for (const k of ['max', 'min']) {
    const r = $(`[data-r=${k}]`, card);
    if (!r) continue;
    r.value = Math.max(0, p.freqs.indexOf(nearest(p.freqs, p[k])));
    setFill(r);
    $(`[data-o=${k}]`, card).textContent = fmt.ghz(p[k]);
  }
}

async function setPolicy(p, v, quiet) {
  if (!quiet) haptic();
  const P = p.path;
  let c = '';
  if (v.gov) c += `echo ${q(v.gov)} > ${P}/scaling_governor\n`;
  if (v.min != null || v.max != null) {
    // Drop min first so a lower max is never rejected, then set the real min.
    c += `echo ${p.freqs[0]} > ${P}/scaling_min_freq\n`;
    if (v.max != null) c += `echo ${v.max} > ${P}/scaling_max_freq\n`;
    c += `echo ${v.min != null ? v.min : p.min} > ${P}/scaling_min_freq\n`;
  }
  c += `cat ${P}/scaling_governor ${P}/scaling_min_freq ${P}/scaling_max_freq`;
  const out = lines(await run(c)).slice(-3);
  if (out.length === 3) { p.gov = out[0].trim(); p.min = +out[1]; p.max = +out[2]; }
  refreshCard(p);
  const a = applied();
  a.pol[p.id] = { gov: p.gov, min: p.min, max: p.max };
  saveApplied(a);
  if (quiet) return;
  store.set('profile', 'custom');
  $$('[data-prof]').forEach(b => b.classList.remove('on'));
  const rejected = (v.gov && v.gov !== p.gov) || (v.max != null && Math.abs(v.max - p.max) > 1000);
  toast(rejected ? `${p.name}: the kernel adjusted that value` : `${p.name} cluster updated`, rejected ? '' : 'ok');
}

function profileTarget(p, id) {
  const st = tune.stock.pol[p.id] || { gov: p.gov, min: p.min, max: p.max };
  const f = p.freqs, top = f[f.length - 1];
  if (id === 'battery') return { gov: st.gov, min: f[0], max: nearest(f, top * 0.7) };
  if (id === 'perf') return { gov: st.gov, min: nearest(f, top * 0.45), max: top };
  return { gov: st.gov, min: st.min, max: st.max };
}
async function applyProfile(id) {
  haptic();
  $$('[data-prof]').forEach(b => b.classList.toggle('on', b.dataset.prof === id));
  for (const p of tune.pol) await setPolicy(p, profileTarget(p, id), true);
  store.set('profile', id);
  if (id === 'balanced') { const a = applied(); a.pol = {}; saveApplied(a); }
  toast(`${PROFILES.find(x => x.id === id).n} profile applied`, 'ok');
}

const ioCmd = s => `for b in ${BLOCKS}; do [ -f $b/queue/scheduler ] && echo ${q(s)} > $b/queue/scheduler; done\n`;
async function setSys(k, v, btn) {
  haptic();
  const c = k === 'io' ? ioCmd(v) : k === 'tcp' ? `echo ${q(v)} > /proc/sys/net/ipv4/tcp_congestion_control` : `echo ${+v} > /proc/sys/vm/swappiness`;
  const r = await sh(c);
  if (r.out.trim()) { toast(lastLine(r.out), 'bad'); return; }
  if (btn) $$(`[data-${k}]`).forEach(x => x.classList.toggle('on', x === btn));
  const a = applied();
  a[k] = v;
  saveApplied(a);
  toast({ io: 'I/O scheduler', tcp: 'TCP algorithm', swap: 'Swappiness' }[k] + ` → ${v}`, 'ok');
}
async function setChargeLimit(v) {
  const path = tune.sys.chgp;
  let c;
  if (path.includes('google,charger')) {
    const dir = path.replace(/\/[^/]+$/, '');
    c = `echo 0 > ${dir}/charge_start_level; echo ${v >= 100 ? 100 : v} > ${path}`;
    if (v < 100) c += `; echo ${Math.max(0, v - 5)} > ${dir}/charge_start_level`;
  } else c = `echo ${v} > ${q(path)}`;
  const r = await sh(c);
  if (r.out.trim()) return toast(lastLine(r.out), 'bad');
  const a = applied();
  a.chg = v >= 100 ? null : { path, v };
  saveApplied(a);
  toast(v >= 100 ? 'Charge limit off' : `Charging stops at ${v}%`, 'ok');
}
async function forceFps(on, fps) {
  haptic();
  let c;
  if (on) {
    const prev = await run('echo "$(settings get system peak_refresh_rate)|$(settings get system min_refresh_rate)"');
    store.set('fpsPrev', prev.trim());
    c = `settings put system peak_refresh_rate ${fps}.0; settings put system min_refresh_rate ${fps}.0`;
  } else {
    const [pk, mn] = (store.get('fpsPrev', 'null|null') || 'null|null').split('|');
    const put = (k, v) => (v && v !== 'null' ? `settings put system ${k} ${v}` : `settings delete system ${k}`);
    c = `${put('peak_refresh_rate', pk)}; ${put('min_refresh_rate', mn)}`;
  }
  await sh(c);
  toast(on ? `Locked to ${fps} Hz` : 'Adaptive refresh restored', 'ok');
}

function bootScript() {
  const a = applied();
  let s = `#!/system/bin/sh
# Generated by RootDeck. Re-applies kernel tweaks after boot.
# Turn off "Apply at boot" in RootDeck (or delete this file) to stop it.
until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 2; done
sleep 20
w() { [ -e "$2" ] && echo "$1" > "$2"; }
`;
  for (const [id, v] of Object.entries(a.pol)) {
    const P = `${CPUFREQ}/${id}`;
    if (v.gov) s += `w ${q(v.gov)} ${P}/scaling_governor\n`;
    if (v.min) s += `w ${tune.pol.find(p => p.id === id)?.freqs[0] || v.min} ${P}/scaling_min_freq\n`;
    if (v.max) s += `w ${v.max} ${P}/scaling_max_freq\n`;
    if (v.min) s += `w ${v.min} ${P}/scaling_min_freq\n`;
  }
  if (a.io) s += `for b in ${BLOCKS}; do w ${q(a.io)} $b/queue/scheduler; done\n`;
  if (a.tcp) s += `w ${q(a.tcp)} /proc/sys/net/ipv4/tcp_congestion_control\n`;
  if (a.swap != null) s += `w ${+a.swap} /proc/sys/vm/swappiness\n`;
  if (a.chg) {
    if (a.chg.path.includes('google,charger')) {
      const dir = a.chg.path.replace(/\/[^/]+$/, '');
      s += `w 0 ${dir}/charge_start_level\nw ${a.chg.v} ${a.chg.path}\nw ${Math.max(0, a.chg.v - 5)} ${dir}/charge_start_level\n`;
    } else s += `w ${a.chg.v} ${q(a.chg.path)}\n`;
  }
  return s;
}
let bootTimer = 0;
function saveApplied(a) {
  store.set('applied', a);
  if (!tune.sys.boot) return;
  clearTimeout(bootTimer);
  bootTimer = setTimeout(() => run(writeCmd(BOOT_PATH, bootScript(), '755')), 500);
}
async function setBoot(on) {
  haptic();
  const r = on ? await sh(`mkdir -p /data/adb/service.d && ${writeCmd(BOOT_PATH, bootScript(), '755')}`) : await sh(`rm -f ${BOOT_PATH}`);
  if (!okRes(r)) { toast(lastLine(r.out) || 'Could not update boot script', 'bad'); $('#bootSw').checked = !on; return; }
  tune.sys.boot = on ? '1' : '';
  toast(on ? 'Tweaks will re-apply at boot' : 'Boot script removed', 'ok');
}
async function restoreStock(btn) {
  const ok = await confirmBox({
    title: 'Restore stock values?',
    msg: 'Resets CPU governors and clocks, I/O scheduler, TCP and swappiness to what RootDeck saw on first launch, and removes the boot script.',
    ok: 'Restore', icon: 'undo',
  });
  if (!ok) return;
  await busy(btn, async () => {
    const st = tune.stock;
    for (const p of tune.pol) if (st.pol[p.id]) await setPolicy(p, st.pol[p.id], true);
    let c = '';
    if (st.io) c += ioCmd(st.io);
    if (st.tcp) c += `echo ${q(st.tcp)} > /proc/sys/net/ipv4/tcp_congestion_control\n`;
    if (st.swap != null) c += `echo ${st.swap} > /proc/sys/vm/swappiness\n`;
    c += `rm -f ${BOOT_PATH}`;
    await run(c);
    store.set('applied', { pol: {} });
    store.set('profile', 'balanced');
    toast('Stock values restored', 'ok');
    await loadTune(true);
  });
}

// ───────────────────────── APPS
const SELF = 'io.rootdeck';
const FILTERS = [['user', 'User'], ['system', 'System'], ['frozen', 'Frozen'], ['removed', 'Removed'], ['all', 'All']];
const CRITICAL = new Set(['android', 'com.android.systemui', 'com.android.settings', 'com.android.phone', 'com.android.shell',
  'com.android.permissioncontroller', 'com.google.android.permissioncontroller', 'com.android.packageinstaller',
  'com.google.android.packageinstaller', 'com.android.inputmethod.latin', 'com.google.android.inputmethod.latin',
  'com.android.launcher3', 'com.google.android.apps.nexuslauncher', 'com.android.networkstack', 'com.google.android.networkstack',
  'com.android.bluetooth', 'com.google.android.bluetooth', 'com.android.server.telecom', 'com.android.externalstorage',
  'com.android.location.fused', 'com.google.android.gms', 'com.google.android.gsf', 'com.android.vending',
  'com.topjohnwu.magisk', 'com.android.se', 'com.android.nfc', 'com.android.keychain', 'com.android.certinstaller',
  'com.android.webview', 'com.google.android.webview', 'com.google.android.trichromelibrary', 'com.android.documentsui',
  'com.google.android.documentsui', 'com.android.carrierconfig', 'com.android.ims', 'com.android.wifi.resources',
  'com.google.android.wifi.resources', 'com.android.emergency', 'com.google.android.ext.services', 'com.android.ext.services',
  'com.android.dynsystem', 'com.android.modulemetadata', 'com.google.android.modulemetadata', 'com.android.devicelockcontroller']);
const isCritical = p => CRITICAL.has(p) || p.startsWith('com.android.providers.') || p.startsWith('com.android.server.');
const apps = { loaded: false, shell: false, list: [], map: new Map(), filter: 'user', q: '', sel: new Set(), icons: new Map(), io: null };

function renderAppsShell() {
  apps.shell = true;
  $('#apps').innerHTML = `${head('Apps', '<span id="appsSub">Loading packages…</span>', `<button class="icon-btn" id="appsRef" aria-label="Reload">${ic('refresh')}</button>`)}
    <div class="apps-top">
      <label class="field">${ic('search')}<input type="search" id="appsQ" placeholder="Search name or package" autocomplete="off" spellcheck="false"><button id="appsQx" class="hide" aria-label="Clear">${ic('x')}</button></label>
      <div class="chips scroll" id="appsF">${FILTERS.map(([k, l]) => `<button class="chip${k === apps.filter ? ' on' : ''}" data-f="${k}">${l}<span class="n" data-n="${k}"></span></button>`).join('')}</div>
    </div>
    <div class="app-list" id="appList">${skel(8, 64)}</div>`;
  $('#appsRef').onclick = loadApps;
  const inp = $('#appsQ');
  let t = 0;
  inp.oninput = () => {
    $('#appsQx').classList.toggle('hide', !inp.value);
    clearTimeout(t);
    t = setTimeout(() => { apps.q = inp.value.trim().toLowerCase(); renderAppList(); }, 140);
  };
  $('#appsQx').onclick = e => { e.preventDefault(); inp.value = ''; inp.oninput(); };
  $$('[data-f]').forEach(b => (b.onclick = () => {
    haptic();
    apps.filter = b.dataset.f;
    $$('[data-f]').forEach(x => x.classList.toggle('on', x === b));
    renderAppList();
    $('.view[data-view=apps]').scrollTo({ top: 0 });
  }));
  bindAppList($('#appList'));

  const bar = $('#batch');
  bar.innerHTML = `<div class="batch-h"><span id="batchN"></span><button class="icon-btn" id="batchX" style="width:34px;height:34px;border-radius:11px" aria-label="Clear selection">${ic('x')}</button></div>
    <div class="batch-a">
      <button data-b="freeze">${ic('snow')}Freeze</button><button data-b="unfreeze">${ic('play')}Unfreeze</button>
      <button data-b="remove" class="d">${ic('trash')}Remove</button><button data-b="restore">${ic('undo')}Restore</button>
    </div>`;
  $('#batchX').onclick = clearSel;
  $$('[data-b]', bar).forEach(b => (b.onclick = () => runBatch(b.dataset.b)));
}

async function loadApps() {
  if (!apps.shell) renderAppsShell();
  const btn = $('#appsRef');
  btn.classList.add('spin');
  const r = await call(id => N.apps(id));
  btn.classList.remove('spin');
  if (r.code !== 0) { $('#appList').innerHTML = empty('alert', r.out || 'Could not list packages'); return; }
  apps.list = JSON.parse(r.out).sort((a, b) => a.n.localeCompare(b.n, undefined, { sensitivity: 'base' }));
  apps.map = new Map(apps.list.map(a => [a.p, a]));
  apps.loaded = true;
  updateCounts();
  renderAppList();
}
function updateCounts() {
  const c = { user: 0, system: 0, frozen: 0, removed: 0, all: apps.list.length };
  for (const a of apps.list) {
    if (!a.i) { c.removed++; continue; }
    a.s ? c.system++ : c.user++;
    if (!a.e) c.frozen++;
  }
  for (const k in c) { const el = $(`[data-n="${k}"]`); if (el) el.textContent = c[k]; }
}
function appMatches(a) {
  const f = apps.filter;
  if (f === 'user' && (a.s || !a.i)) return false;
  if (f === 'system' && (!a.s || !a.i)) return false;
  if (f === 'frozen' && (a.e || !a.i)) return false;
  if (f === 'removed' && a.i) return false;
  return !apps.q || a.n.toLowerCase().includes(apps.q) || a.p.includes(apps.q);
}
function badges(a, full) {
  const b = [];
  if (!a.i) b.push('<span class="bdg rem">Removed</span>');
  else if (!a.e) b.push('<span class="bdg frz">Frozen</span>');
  if (full) b.push(a.s ? `<span class="bdg">${a.u ? 'System · updated' : 'System'}</span>` : '<span class="bdg upd">User</span>');
  if (isCritical(a.p)) b.push('<span class="bdg crit">Core</span>');
  return b.join('');
}
function appRow(a) {
  const src = apps.icons.get(a.p);
  return `<div class="app-row${!a.i || !a.e ? ' off' : ''}${apps.sel.has(a.p) ? ' sel' : ''}" data-p="${esc(a.p)}">
    <div class="app-ic">${src ? `<img class="ld" src="${src}" alt="">` : '<img alt="">'}<div class="chk">${ic('check')}</div></div>
    <div class="app-meta"><div class="app-name">${esc(a.n)}</div><div class="app-pkg">${esc(a.p)}</div></div>
    <div class="badges">${badges(a)}</div></div>`;
}
function renderAppList() {
  const items = apps.list.filter(appMatches);
  $('#appsSub').textContent = `${items.length} shown · ${apps.list.length} packages · long-press to select`;
  const el = $('#appList');
  if (!items.length) { el.innerHTML = empty('search', apps.q ? 'No matches' : 'Nothing in this list'); return; }
  el.innerHTML = items.map(appRow).join('');
  if (apps.io) apps.io.disconnect();
  apps.io = new IntersectionObserver(ents => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      apps.io.unobserve(e.target);
      paintIcon(e.target);
    }
  }, { root: $('.view[data-view=apps]'), rootMargin: '400px 0px' });
  $$('.app-row', el).forEach(r => { if (!apps.icons.has(r.dataset.p)) apps.io.observe(r); });
}
const iconJobs = new Map();
function getIcon(pkg) {
  if (apps.icons.has(pkg)) return Promise.resolve(apps.icons.get(pkg));
  if (!iconJobs.has(pkg)) {
    iconJobs.set(pkg, call(id => N.icon(id, pkg, 144)).then(r => {
      iconJobs.delete(pkg);
      if (r.code === 0 && r.out) apps.icons.set(pkg, r.out);
      return r.out;
    }));
  }
  return iconJobs.get(pkg);
}
async function paintIcon(row) {
  const src = await getIcon(row.dataset.p);
  const img = $('img', row);
  if (!src || !img) return;
  img.onload = () => img.classList.add('ld');
  img.src = src;
}
function bindAppList(el) {
  let timer = 0, x0 = 0, y0 = 0, long = false;
  el.addEventListener('touchstart', e => {
    const row = e.target.closest('.app-row');
    if (!row) return;
    long = false;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    timer = setTimeout(() => { long = true; haptic(1); toggleSel(row.dataset.p); }, 420);
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (Math.abs(e.touches[0].clientX - x0) > 10 || Math.abs(e.touches[0].clientY - y0) > 10) clearTimeout(timer);
  }, { passive: true });
  el.addEventListener('touchend', () => clearTimeout(timer));
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('click', e => {
    const row = e.target.closest('.app-row');
    if (!row) return;
    if (long) { long = false; return; }
    if (apps.sel.size) toggleSel(row.dataset.p); else appSheet(row.dataset.p);
  });
}
function toggleSel(p) {
  if (p === SELF) return toast('RootDeck can’t act on itself');
  apps.sel.has(p) ? apps.sel.delete(p) : apps.sel.add(p);
  const row = $(`.app-row[data-p="${CSS.escape(p)}"]`);
  if (row) row.classList.toggle('sel', apps.sel.has(p));
  updateBatch();
}
function clearSel() {
  if (!apps.sel.size) return false;
  apps.sel.clear();
  $$('.app-row.sel').forEach(r => r.classList.remove('sel'));
  updateBatch();
  return true;
}
function updateBatch() {
  const n = apps.sel.size;
  $('#batch').classList.toggle('on', n > 0);
  document.body.classList.toggle('selecting', n > 0);
  if (n) $('#batchN').textContent = `${n} selected`;
}

const APP_CMD = {
  stop: a => `am force-stop ${q(a.p)}`,
  freeze: a => `pm disable-user --user 0 ${q(a.p)}`,
  unfreeze: a => `pm enable --user 0 ${q(a.p)}`,
  cache: a => `rm -rf /data/data/${q(a.p)}/cache/* /data/data/${q(a.p)}/code_cache/* /data/media/0/Android/data/${q(a.p)}/cache/*`,
  data: a => `pm clear ${q(a.p)}`,
  remove: a => (a.s ? `pm uninstall -k --user 0 ${q(a.p)}` : `pm uninstall ${q(a.p)}`),
  restore: a => `cmd package install-existing --user 0 ${q(a.p)}`,
};
const DONE = {
  stop: a => `${a.n} stopped`, freeze: a => `${a.n} frozen`, unfreeze: a => `${a.n} unfrozen`, cache: () => 'Cache cleared',
  data: () => 'App data cleared', remove: a => `${a.n} ${a.s ? 'removed' : 'uninstalled'}`, restore: a => `${a.n} restored`,
};
async function doAppAction(k, a, quiet) {
  const r = await sh(APP_CMD[k](a), { timeout: 90 });
  if (!okRes(r)) { if (!quiet) toast(lastLine(r.out) || 'Failed', 'bad'); return false; }
  if (!quiet) toast(DONE[k](a), 'ok');
  if (k === 'freeze') a.e = false;
  if (k === 'unfreeze') a.e = true;
  if (k === 'restore') { a.i = true; a.e = true; }
  if (k === 'remove') {
    if (a.s) a.i = false;
    else { apps.list = apps.list.filter(x => x !== a); apps.map.delete(a.p); }
  }
  return true;
}

function appSheet(pkg) {
  const a = apps.map.get(pkg);
  if (!a) return;
  haptic();
  const s = sheet();
  const draw = () => {
    s.body.innerHTML = appSheetHtml(a);
    if (!apps.icons.has(a.p)) getIcon(a.p).then(src => { const im = $('#adIc', s.el); if (im && src) im.src = src; });
    $$('[data-act]', s.el).forEach(b => (b.onclick = () => appAction(b.dataset.act, a, b, s, draw)));
  };
  draw();
}
function appSheetHtml(a) {
  const self = a.p === SELF, crit = isCritical(a.p);
  const B = (k, icon, label, cls = '', off = false) => `<button class="act ${cls}" data-act="${k}" ${off ? 'disabled' : ''}>${ic(icon)}${label}</button>`;
  const btns = a.i
    ? [B('open', 'open', 'Open', 'g', !a.e), B('stop', 'stop', 'Force stop', '', self),
      a.e ? B('freeze', 'snow', 'Freeze', '', self) : B('unfreeze', 'play', 'Unfreeze', 'g'),
      B('cache', 'sparkles', 'Clear cache'), B('data', 'trash', 'Clear data', 'd', self),
      B('remove', 'x', a.s ? 'Remove' : 'Uninstall', 'd', self), B('apk', 'download', 'Save APK'), B('info', 'info', 'App info')]
    : [B('restore', 'undo', 'Restore', 'g'), B('apk', 'download', 'Save APK')];
  return `<div class="ad-top"><img class="ad-ic" id="adIc" alt="" src="${apps.icons.get(a.p) || 'data:,'}">
      <div style="min-width:0"><h3>${esc(a.n)}</h3><button class="ad-pkg" data-act="copy">${esc(a.p)}</button><div class="badges">${badges(a, true)}</div></div></div>
    ${crit ? `<div class="note bad">${ic('alert')}<span>Core system package. Freezing, removing or clearing it can break your phone or cause a bootloop.</span></div>` : ''}
    <div class="act-grid">${btns.join('')}</div>
    <div class="kv">
      <div><span>Version</span><b>${esc(a.v || '—')}</b></div>
      <div><span>Status</span><b>${!a.i ? 'Removed for this user' : a.e ? 'Enabled' : 'Frozen'}</b></div>
      <div><span>Installed</span><b>${fmt.date(a.t)}</b></div>
      <div><span>Updated</span><b>${fmt.date(a.up)}</b></div>
      <div><span>UID</span><b class="mono">${a.uid}</b></div>
      <div><span>APK</span><b class="mono sel">${esc(a.d)}${a.sp ? ` (+${a.sp} splits)` : ''}</b></div>
    </div>`;
}
async function appAction(k, a, btn, s, redraw) {
  haptic();
  if (k === 'copy') return copy(a.p);
  if (k === 'open') { if (!N.launch(a.p)) toast('This app has no launchable screen', 'bad'); return; }
  if (k === 'info') return N.appInfo(a.p);
  if (k === 'apk') return saveApk(a, btn);
  const CONF = {
    freeze: { title: `Freeze ${a.n}?`, msg: 'It is disabled and hidden until you unfreeze it. Its data is kept.', ok: 'Freeze', icon: 'snow' },
    data: { title: `Clear data of ${a.n}?`, msg: 'Deletes all files, accounts and settings of this app. This cannot be undone.', ok: 'Clear data', danger: true, icon: 'trash' },
    remove: a.s
      ? { title: `Remove ${a.n}?`, msg: 'It is uninstalled for your user only. The system copy stays, so you can restore it from the Removed filter.', ok: 'Remove', danger: true, icon: 'x' }
      : { title: `Uninstall ${a.n}?`, msg: 'The app and all its data will be deleted.', ok: 'Uninstall', danger: true, icon: 'trash' },
  };
  let c = CONF[k];
  if (c) {
    if (isCritical(a.p)) c = { ...c, danger: true, msg: c.msg + ' Warning: this is a core system package and may cause a bootloop.' };
    if (!(await confirmBox(c))) return;
  }
  btn.classList.add('busy');
  const ok = await doAppAction(k, a);
  btn.classList.remove('busy');
  if (!ok) return;
  updateCounts();
  renderAppList();
  if (k === 'remove' && !a.s) s.close(); else redraw();
}
async function saveApk(a, btn) {
  const name = `${a.n}_${a.v || ''}`.replace(/[^\w.-]+/g, '_').replace(/_+$/, '');
  const dir = '/sdcard/Download/RootDeck';
  const c = a.sp
    ? `mkdir -p ${q(`${dir}/${name}`)} && cp ${q(a.d.replace(/[^/]+$/, ''))}*.apk ${q(`${dir}/${name}`)}/`
    : `mkdir -p ${dir} && cp ${q(a.d)} ${q(`${dir}/${name}.apk`)}`;
  btn.classList.add('busy');
  const r = await sh(c, { lane: 1, timeout: 120 });
  btn.classList.remove('busy');
  if (r.code === 0) toast(`Saved to Download/RootDeck${a.sp ? ` (${a.sp + 1} split APKs)` : ''}`, 'ok');
  else toast(lastLine(r.out) || 'Copy failed', 'bad');
}
const BATCH = {
  freeze: { ok: a => a.i && a.e, l: 'Freeze', icon: 'snow' },
  unfreeze: { ok: a => a.i && !a.e, l: 'Unfreeze', icon: 'play' },
  remove: { ok: a => a.i, l: 'Remove', icon: 'trash' },
  restore: { ok: a => !a.i, l: 'Restore', icon: 'undo' },
};
async function runBatch(k) {
  const B = BATCH[k];
  const list = [...apps.sel].map(p => apps.map.get(p)).filter(a => a && B.ok(a));
  if (!list.length) return toast(`Nothing selected can use “${B.l}”`);
  const crit = list.filter(a => isCritical(a.p));
  if (k === 'freeze' || k === 'remove' || crit.length) {
    const msg = (k === 'remove' ? 'System apps are removed for your user and can be restored later. User apps are fully uninstalled.' : k === 'freeze' ? 'You can unfreeze them anytime from the Frozen filter.' : '')
      + (crit.length ? ` Includes ${crit.length} core package${crit.length > 1 ? 's' : ''} (${crit.map(a => a.n).slice(0, 3).join(', ')}) that may cause a bootloop.` : '');
    if (!(await confirmBox({ title: `${B.l} ${list.length} app${list.length > 1 ? 's' : ''}?`, msg, ok: B.l, danger: k === 'remove' || crit.length > 0, icon: B.icon }))) return;
  }
  let done = 0;
  for (const [i, a] of list.entries()) {
    $('#batchN').textContent = `${B.l} ${i + 1} of ${list.length}…`;
    if (await doAppAction(k, a, true)) done++;
  }
  toast(`${B.l}: ${done} of ${list.length} done`, done === list.length ? 'ok' : 'bad');
  clearSel();
  updateCounts();
  renderAppList();
}

// ───────────────────────── TOOLS
const TOOLS = [
  { ic: 'wifi', n: 'Wi‑Fi passwords', d: 'View and copy saved network keys', c: '#7ab8ff', fn: pageWifi },
  { ic: 'shield', n: 'Ad blocker', d: 'System-wide hosts blocking', c: '#ff6b7d', fn: pageAds },
  { ic: 'globe', n: 'Private DNS', d: 'Encrypted DNS in one tap', c: '#b69cff', fn: pageDns },
  { ic: 'box', n: 'Magisk modules', d: 'Enable, disable, remove, run actions', c: '#6ff2c1', fn: pageModules },
  { ic: 'file', n: 'Logcat', d: 'System log with level filters', c: '#ffc35a', fn: pageLogcat },
  { ic: 'terminal', n: 'Terminal', d: 'Run shell commands as root', c: '#5ee39a', fn: pageTerminal },
  { ic: 'hash', n: 'System props', d: 'Search every getprop value', c: '#9fb1cc', fn: pageProps },
  { ic: 'sparkles', n: 'Maintenance', d: 'Trim, clean, optimize, reset stats', c: '#3fb6ff', fn: pageMaint },
  { ic: 'power', n: 'Power menu', d: 'Recovery, bootloader, soft reboot', c: '#ff86a8', fn: rebootSheet },
];
function renderTools() {
  $('#tools').innerHTML = head('Tools', 'Root utilities') +
    `<div class="tools">${TOOLS.map((t, i) => `<button class="tool" data-t="${i}" style="--c:${t.c}"><div class="ti">${ic(t.ic)}</div><div class="tt"><b>${t.n}</b><span>${t.d}</span></div></button>`).join('')}</div>`;
  $$('[data-t]').forEach(b => (b.onclick = () => {
    if (!state.root) return toast('Root access is required', 'bad');
    TOOLS[b.dataset.t].fn();
  }));
}

function pageWifi() {
  openPage('Wi‑Fi passwords', async body => {
    body.innerHTML = skel(4, 112);
    const r = await sh('for f in /data/misc/apexdata/com.android.wifi/WifiConfigStore.xml /data/misc/wifi/WifiConfigStore.xml; do [ -f "$f" ] && { cat "$f"; exit 0; }; done; echo __NOFILE__');
    if (r.out.includes('__NOFILE__')) { body.innerHTML = empty('wifi', 'No saved Wi‑Fi config found'); return; }
    const doc = new DOMParser().parseFromString(r.out, 'text/xml');
    if (doc.querySelector('parsererror')) { body.innerHTML = empty('alert', 'Could not parse WifiConfigStore.xml'); return; }
    const un = s => (s == null ? null : s.replace(/^"([\s\S]*)"$/, '$1'));
    const nets = [];
    doc.querySelectorAll('Network').forEach(n => {
      const wc = n.querySelector('WifiConfiguration');
      if (!wc) return;
      const g = k => { const e = wc.querySelector(`[name="${k}"]`); return e ? e.textContent : null; };
      const key = g('ConfigKey') || '';
      nets.push({
        ssid: un(g('SSID')) || '(hidden network)',
        psk: un(g('PreSharedKey')),
        sec: /SAE/.test(key) ? 'WPA3' : /PSK/.test(key) ? 'WPA2 / WPA' : /EAP/.test(key) ? 'Enterprise' : /OWE/.test(key) ? 'Enhanced open' : /WEP/.test(key) ? 'WEP' : 'Open',
      });
    });
    nets.sort((x, y) => x.ssid.localeCompare(y.ssid));
    body.innerHTML = `<p class="muted" style="margin:0 4px 12px">${nets.length} saved network${nets.length === 1 ? '' : 's'} · stored on this device only</p>
      ${nets.length > 6 ? `<label class="field" style="margin-bottom:12px">${ic('search')}<input type="search" id="wq" placeholder="Search networks" autocomplete="off"></label>` : ''}
      <div id="wl"></div>`;
    const draw = (f = '') => {
      const list = nets.filter(n => !f || n.ssid.toLowerCase().includes(f));
      $('#wl', body).innerHTML = list.map(n => {
        const i = nets.indexOf(n);
        return `<section class="card wifi"><div class="wifi-h">${ic('wifi', 'lead')}<div class="li-t"><b>${esc(n.ssid)}</b><span>${n.sec}</span></div></div>
          ${n.psk ? `<div class="pw"><code data-pw="${i}">${'•'.repeat(Math.min(n.psk.length, 16))}</code><button data-eye="${i}" aria-label="Show">${ic('eye')}</button><button data-cp="${i}" aria-label="Copy">${ic('copy')}</button></div>`
            : `<div class="pw"><code style="color:var(--tx3)">${n.sec === 'Open' || n.sec === 'Enhanced open' ? 'No password' : 'No plain-text key stored'}</code></div>`}
        </section>`;
      }).join('') || empty('search', 'No matches');
      $$('[data-eye]', body).forEach(b => (b.onclick = () => {
        haptic();
        const i = +b.dataset.eye, code = $(`[data-pw="${i}"]`, body), shown = b.classList.toggle('on');
        code.textContent = shown ? nets[i].psk : '•'.repeat(Math.min(nets[i].psk.length, 16));
        code.classList.toggle('sel', shown);
        b.innerHTML = ic(shown ? 'eyeoff' : 'eye');
      }));
      $$('[data-cp]', body).forEach(b => (b.onclick = () => { haptic(); copy(nets[+b.dataset.cp].psk); }));
    };
    draw();
    const wq = $('#wq', body);
    if (wq) wq.oninput = () => draw(wq.value.trim().toLowerCase());
  });
}

const HMOD = '/data/adb/modules/hosts';
const HOSTS_SRC = [
  { n: 'StevenBlack Unified', d: 'Ads + malware · balanced, very popular', u: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts' },
  { n: 'StevenBlack + Fakenews + Gambling', d: 'Unified list plus two extra categories', u: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-gambling/hosts' },
  { n: 'AdAway default', d: 'Light, mobile-focused', u: 'https://adaway.org/hosts.txt' },
  { n: 'Hagezi Pro', d: 'Aggressive, actively maintained', u: 'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/hosts/pro.txt' },
];
const HOST_RE = `'^(0\\.0\\.0\\.0|127\\.0\\.0\\.1)[[:space:]]'`;
function pageAds() {
  openPage('Ad blocker', body => {
    let pick = store.get('hostsSrc', HOSTS_SRC[0].u);
    const draw = async () => {
      body.innerHTML = skel(1, 84) + skel(4, 64);
      const st = kv(await run(`[ -d ${HMOD} ] && echo mod=1
[ -f ${HMOD}/disable ] && echo off=1
echo live=$(grep -E ${HOST_RE} /system/etc/hosts | grep -vc localhost)
[ -f ${HMOD}/system/etc/hosts ] && echo file=$(grep -E ${HOST_RE} ${HMOD}/system/etc/hosts | grep -vc localhost)`));
      const liveN = +st.live || 0, fileN = +st.file || 0;
      let cls = '', title, sub;
      if (!st.mod) [cls, title, sub] = ['warn', 'Not set up yet', 'Enabling creates Magisk’s systemless hosts module'];
      else if (st.off) [cls, title, sub] = ['warn', 'Hosts module is disabled', 'Turn on “Systemless Hosts” in Magisk modules'];
      else if (fileN !== liveN) [cls, title, sub] = ['warn', 'Reboot to apply', `${fmt.n(fileN)} domains staged · ${fmt.n(liveN)} active now`];
      else if (liveN > 0) [cls, title, sub] = ['ok', `Blocking ${fmt.n(liveN)} domains`, store.get('hostsAt') ? `List updated ${fmt.ago(store.get('hostsAt'))}` : 'Active system-wide'];
      else [title, sub] = ['Not blocking', 'Pick a blocklist and enable it'];
      const isCustom = !HOSTS_SRC.some(s => s.u === pick);
      body.innerHTML = `<section class="card status ${cls}"><div class="si">${ic(cls === 'ok' ? 'shieldok' : 'shield')}</div><div><b>${title}</b><span>${sub}</span></div></section>
        <div class="sec-t">Blocklist</div>
        ${HOSTS_SRC.map(s => `<button class="opt${s.u === pick ? ' on' : ''}" data-u="${esc(s.u)}"><span class="radio"></span><div class="li-t"><b>${s.n}</b><span>${s.d}</span></div></button>`).join('')}
        <button class="opt${isCustom ? ' on' : ''}" data-u="custom"><span class="radio"></span><div class="li-t"><b>Custom URL</b><span>Any hosts-format list</span></div></button>
        <label class="field${isCustom ? '' : ' hide'}" id="hcF" style="margin-top:8px">${ic('globe')}<input type="text" id="hc" placeholder="https://…" value="${isCustom ? esc(pick) : ''}" autocomplete="off" spellcheck="false"></label>
        <div class="row-btns">${fileN ? `<button class="btn danger" id="hOff">${ic('x')}Disable</button>` : ''}<button class="btn acc" id="hOn">${ic('download')}${fileN ? 'Update list' : 'Enable'}</button></div>
        <div class="note">${ic('info')}<span>Blocking works in every app and browser. Turn off Private DNS providers that already filter ads to avoid double-blocking surprises. The first activation needs one reboot.</span></div>`;
      $$('[data-u]', body).forEach(b => (b.onclick = () => {
        haptic();
        $$('[data-u]', body).forEach(x => x.classList.toggle('on', x === b));
        $('#hcF', body).classList.toggle('hide', b.dataset.u !== 'custom');
        pick = b.dataset.u === 'custom' ? $('#hc', body).value.trim() || 'custom' : b.dataset.u;
      }));
      $('#hc', body).oninput = e => (pick = e.target.value.trim());
      $('#hOn', body).onclick = e => busy(e.currentTarget, async () => {
        if (!/^https?:\/\//.test(pick)) return toast('Enter a valid http(s) URL', 'bad');
        if (await enableHosts(pick)) draw();
      });
      const off = $('#hOff', body);
      if (off) off.onclick = e => busy(e.currentTarget, async () => {
        await run(`printf '127.0.0.1 localhost\\n::1 ip6-localhost\\n' > ${HMOD}/system/etc/hosts`);
        toast('Ad blocking disabled', 'ok');
        draw();
      });
    };
    draw();
  });
}
async function enableHosts(url) {
  const hasMod = (await run(`[ -d ${HMOD} ] && echo y`)).trim() === 'y';
  if (!hasMod) {
    await run(`mkdir -p ${HMOD}/system/etc
printf 'id=hosts\\nname=Systemless Hosts\\nversion=1.0\\nversionCode=1\\nauthor=Magisk\\ndescription=Magisk app built-in systemless hosts module\\n' > ${HMOD}/module.prop
magisk --clone /system/etc/hosts ${HMOD}/system/etc/hosts 2>/dev/null || { cp /system/etc/hosts ${HMOD}/system/etc/hosts; chcon u:object_r:system_file:s0 ${HMOD}/system/etc/hosts; }
chmod 644 ${HMOD}/system/etc/hosts
touch ${HMOD}/update`);
  }
  toast('Downloading blocklist…');
  const d = await call(id => N.download(id, url));
  if (d.code !== 0) { toast(`Download failed: ${d.out}`, 'bad'); return false; }
  const f = q(d.out);
  // Keep only host entries, normalise to 0.0.0.0, and write in place so the live bind mount updates instantly.
  const r = await run(`n=$(grep -cE ${HOST_RE} ${f})
if [ "$n" -lt 500 ]; then rm -f ${f}; echo "BAD $n"; exit 0; fi
T=/data/local/tmp/rootdeck_hosts
{ printf '127.0.0.1 localhost\\n::1 ip6-localhost\\n'; grep -E ${HOST_RE} ${f} | grep -v localhost | tr -d '\\r' | sed 's/^127\\.0\\.0\\.1/0.0.0.0/'; } > $T
cat $T > ${HMOD}/system/etc/hosts && rm -f $T ${f} && echo "OK $n"`, { lane: 1, timeout: 180 });
  if (!r.startsWith('OK')) { toast(r.startsWith('BAD') ? 'That URL is not a hosts-format list' : lastLine(r) || 'Failed to write hosts', 'bad'); return false; }
  store.set('hostsSrc', url);
  store.set('hostsAt', Date.now());
  toast(hasMod ? 'Blocklist updated' : 'Ad blocker ready. Reboot once to activate', 'ok');
  return true;
}

const DNS = [
  { n: 'Off', m: 'off', d: 'Use the network’s DNS' },
  { n: 'Automatic', m: 'opportunistic', d: 'Encrypt when the network supports it' },
  { n: 'AdGuard', h: 'dns.adguard-dns.com', d: 'Blocks ads and trackers' },
  { n: 'Cloudflare', h: 'one.one.one.one', d: 'Fast and privacy-focused' },
  { n: 'Cloudflare Security', h: 'security.cloudflare-dns.com', d: 'Blocks malware' },
  { n: 'Quad9', h: 'dns.quad9.net', d: 'Malware blocking, non-profit' },
  { n: 'Mullvad Adblock', h: 'adblock.dns.mullvad.net', d: 'Ads + trackers, no logging' },
  { n: 'Google', h: 'dns.google', d: 'Plain, reliable resolver' },
];
function pageDns() {
  openPage('Private DNS', body => {
    const draw = async () => {
      const [mode, spec] = lines(await run('settings get global private_dns_mode; settings get global private_dns_specifier')).map(s => s.trim());
      const curKey = mode === 'hostname' ? spec : mode === 'off' ? 'off' : 'opportunistic';
      const known = DNS.some(x => (x.h || x.m) === curKey);
      body.innerHTML = `<p class="muted" style="margin:0 4px 12px">DNS-over-TLS for every app. Takes effect immediately.</p>
        ${DNS.map(x => `<button class="opt${(x.h || x.m) === curKey ? ' on' : ''}" data-k="${esc(x.h || x.m)}"><span class="radio"></span><div class="li-t"><b>${x.n}</b><span>${x.h ? `<span class="mono">${x.h}</span> · ` : ''}${x.d}</span></div></button>`).join('')}
        <div class="sec-t">Custom provider</div>
        <div style="display:flex;gap:8px"><label class="field" style="flex:1">${ic('globe')}<input type="text" id="dc" placeholder="e.g. abc123.dns.nextdns.io" value="${!known && spec !== 'null' ? esc(spec) : ''}" autocomplete="off" spellcheck="false" autocapitalize="off"></label><button class="btn acc" id="dcGo">Use</button></div>`;
      const apply = async key => {
        haptic();
        const c = key === 'off' || key === 'opportunistic' ? `settings put global private_dns_mode ${key}` : `settings put global private_dns_specifier ${q(key)}; settings put global private_dns_mode hostname`;
        await sh(c);
        toast(key === 'off' ? 'Private DNS off' : key === 'opportunistic' ? 'Private DNS: automatic' : `Using ${key}`, 'ok');
        draw();
      };
      $$('[data-k]', body).forEach(b => (b.onclick = () => apply(b.dataset.k)));
      $('#dcGo', body).onclick = () => {
        const v = $('#dc', body).value.trim();
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return toast('Enter a hostname, not a URL or IP', 'bad');
        apply(v);
      };
    };
    draw();
  });
}

function pageModules() {
  openPage('Magisk modules', body => {
    let dirty = false;
    const draw = async () => {
      const t = await run('for d in /data/adb/modules/*; do [ -f "$d/module.prop" ] || continue; echo "@@$d"; cat "$d/module.prop"; echo; for f in disable remove update action.sh; do [ -e "$d/$f" ] && echo "__$f=1"; done; done');
      const mods = [];
      let m = null;
      for (const l of t.split('\n')) {
        if (l.startsWith('@@')) { m = { dir: l.slice(2).trim() }; mods.push(m); continue; }
        const i = l.indexOf('=');
        if (m && i > 0) m[l.slice(0, i).trim()] = l.slice(i + 1).trim();
      }
      mods.sort((a, b) => (a.name || a.id || '').localeCompare(b.name || b.id || ''));
      body.innerHTML = (dirty ? `<div class="note warn" style="margin:0 0 12px">${ic('alert')}<span style="flex:1">Changes apply after a reboot.</span><button class="btn" id="mReboot" style="min-height:34px;padding:0 12px;font-size:13px">Reboot</button></div>` : '')
        + (mods.map((x, i) => `<section class="card mod${x.__disable || x.__remove ? ' off' : ''}">
          <div class="mod-h"><div class="li-t"><b>${esc(x.name || x.id)}</b><span>${esc(x.version || '')}${x.author ? ' · ' + esc(x.author) : ''}</span></div>${sw('', !x.__disable, `data-tog="${i}" ${x.__remove ? 'disabled' : ''}`)}</div>
          ${x.description ? `<p>${esc(x.description)}</p>` : ''}
          <div class="mod-a">
            ${x.__remove ? `<span class="pill bad">Removed on reboot</span><button class="btn" data-undo="${i}">${ic('undo')}Undo</button>` : `<button class="btn danger" data-rm="${i}">${ic('trash')}Remove</button>`}
            ${x['__action.sh'] && !x.__remove ? `<button class="btn" data-run="${i}">${ic('play')}Action</button>` : ''}
            ${x.__update ? '<span class="pill acc">Updated · reboot</span>' : ''}
          </div></section>`).join('') || empty('box', 'No Magisk modules installed'));
      const touch = async (i, cmd, msg) => { haptic(); await run(cmd.replace(/\$D/g, q(mods[i].dir))); dirty = true; toast(msg, 'ok'); draw(); };
      $$('[data-tog]', body).forEach(s => (s.onchange = () => touch(+s.dataset.tog, s.checked ? 'rm -f $D/disable' : 'touch $D/disable', s.checked ? 'Enabled after reboot' : 'Disabled after reboot')));
      $$('[data-rm]', body).forEach(b => (b.onclick = async () => {
        const x = mods[+b.dataset.rm];
        if (await confirmBox({ title: `Remove ${x.name || x.id}?`, msg: 'The module is deleted on the next reboot. You can undo until then.', ok: 'Remove', danger: true, icon: 'trash' })) touch(+b.dataset.rm, 'touch $D/remove', 'Marked for removal');
      }));
      $$('[data-undo]', body).forEach(b => (b.onclick = () => touch(+b.dataset.undo, 'rm -f $D/remove', 'Removal cancelled')));
      $$('[data-run]', body).forEach(b => (b.onclick = () => busy(b, async () => {
        const x = mods[+b.dataset.run];
        const r = await sh(`cd ${q(x.dir)} && if [ -x /data/adb/magisk/busybox ]; then ASH_STANDALONE=1 /data/adb/magisk/busybox sh ./action.sh; else sh ./action.sh; fi`, { lane: 1, timeout: 300 });
        sheet({ title: esc(x.name || x.id), sub: `Action finished · exit ${r.code}`, body: `<div class="console">${esc(r.out || '(no output)')}</div>` });
      })));
      const rb = $('#mReboot', body);
      if (rb) rb.onclick = rebootSheet;
    };
    body.innerHTML = skel(4, 120);
    draw();
  });
}

const LOG_RE = /^(\d\d-\d\d) (\d\d:\d\d:\d\d)\.\d+\s+\d+\s+\d+\s+([VDIWEF])\s+(.*?)\s*: ?(.*)$/;
function pageLogcat() {
  let lvl = 'W', buf = 'main', filter = '', raw = [];
  const pg = openPage('Logcat', (body, el) => {
    body.innerHTML = `<div class="chips scroll" style="margin-bottom:10px">
        ${[['V', 'All'], ['I', 'Info+'], ['W', 'Warnings+'], ['E', 'Errors'], ['crash', 'Crashes']].map(([k, l]) => `<button class="chip${k === lvl ? ' on' : ''}" data-l="${k}">${l}</button>`).join('')}
      </div>
      <label class="field" style="margin-bottom:12px">${ic('search')}<input type="search" id="lq" placeholder="Filter by tag or text" autocomplete="off" spellcheck="false"></label>
      <div class="console" id="lg">${skel(6, 22)}</div>`;
    const draw = () => {
      const f = filter.toLowerCase();
      const shown = raw.filter(l => !f || l.toLowerCase().includes(f)).slice(-700).reverse();
      $('#lg', body).innerHTML = shown.map(l => {
        const m = l.match(LOG_RE);
        if (!m) return `<div class="log-l"><span class="tm">${esc(l)}</span></div>`;
        return `<div class="log-l ${m[3]}"><span class="lv">${m[3]}</span><span class="tm">${m[2]}</span> <span class="tg">${esc(m[4])}</span> ${esc(m[5])}</div>`;
      }).join('') || empty('file', 'No log lines');
    };
    const load = async () => {
      $('#lg', body).innerHTML = skel(6, 22);
      const c = buf === 'crash' ? 'logcat -d -b crash -v threadtime -t 400' : `logcat -d -v threadtime -t 1500 '*:${lvl}'`;
      raw = lines(await run(c, { lane: 1, timeout: 40 }));
      draw();
    };
    $$('[data-l]', body).forEach(b => (b.onclick = () => {
      haptic();
      $$('[data-l]', body).forEach(x => x.classList.toggle('on', x === b));
      if (b.dataset.l === 'crash') buf = 'crash'; else { buf = 'main'; lvl = b.dataset.l; }
      load();
    }));
    let t = 0;
    $('#lq', body).oninput = e => { clearTimeout(t); t = setTimeout(() => { filter = e.target.value.trim(); draw(); }, 150); };
    el.reload = load;
    el.share = () => N.share(raw.slice(-500).join('\n'));
    load();
  }, `<button class="icon-btn" data-a="share" aria-label="Share">${ic('share')}</button><button class="icon-btn" data-a="ref" aria-label="Reload">${ic('refresh')}</button>`);
  $('[data-a=ref]', pg).onclick = () => pg.reload();
  $('[data-a=share]', pg).onclick = () => pg.share();
}

const TERM_CHIPS = ['getenforce', 'df -h /data', 'top -b -n 1 | head -20', 'dumpsys battery', 'ls /data/adb/modules', 'uname -a', 'free -m'];
function pageTerminal() {
  let cwd = '/';
  const hist = store.get('termHist', []);
  const pg = openPage('Terminal', body => {
    body.innerHTML = `<div class="term console" id="tOut"><div class="muted" style="font-family:var(--ff)">Commands run as root. Interactive programs aren’t supported, so use one-shot flags like <span class="mono">top -b -n 1</span>.</div></div>`;
  }, `<button class="icon-btn" data-a="clr" aria-label="Clear">${ic('trash')}</button>`);
  const foot = document.createElement('div');
  foot.className = 'page-foot';
  foot.innerHTML = `<div class="cwd" id="tCwd">/</div><div class="chips scroll" id="tChips" style="margin-bottom:10px"></div>
    <form class="term-in" id="tForm"><label class="field"><span>#</span><input id="tIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="command" enterkeyhint="send"></label><button class="btn acc" type="submit" aria-label="Run">${ic('play')}</button></form>`;
  pg.appendChild(foot);
  const out = $('#tOut', pg), body = $('.page-body', pg), inp = $('#tIn', pg);
  const chips = () => {
    const list = [...new Set([...hist.slice(0, 5), ...TERM_CHIPS])].slice(0, 10);
    $('#tChips', pg).innerHTML = list.map(c => `<button class="chip mono" data-c="${esc(c)}" style="font-size:12.5px">${esc(c)}</button>`).join('');
    $$('[data-c]', pg).forEach(b => (b.onclick = () => { inp.value = b.dataset.c; inp.focus(); }));
  };
  chips();
  $('[data-a=clr]', pg).onclick = () => (out.innerHTML = '');
  $('#tForm', pg).onsubmit = async e => {
    e.preventDefault();
    const cmd = inp.value.trim();
    if (!cmd) return;
    if (cmd === 'clear') { out.innerHTML = ''; inp.value = ''; return; }
    haptic();
    inp.value = '';
    const i = hist.indexOf(cmd);
    if (i >= 0) hist.splice(i, 1);
    hist.unshift(cmd);
    hist.length = Math.min(hist.length, 30);
    store.set('termHist', hist);
    chips();
    const blk = document.createElement('div');
    blk.className = 'term-b';
    blk.innerHTML = `<div class="cmd">${esc(cmd)}</div><div class="o"><span class="muted">running…</span></div>`;
    out.appendChild(blk);
    body.scrollTop = body.scrollHeight;
    const r = await sh(`cd ${q(cwd)} 2>/dev/null\n${cmd}\n__rc=$?\nprintf '\\n__RDCWD__%s|%s' "$__rc" "$(pwd)"`, { lane: 1, timeout: 60 });
    let text = r.out, rc = r.code;
    const at = text.lastIndexOf('\n__RDCWD__');
    if (at >= 0) {
      const [code, dir] = text.slice(at + 10).split('|');
      rc = +code;
      cwd = dir || cwd;
      text = text.slice(0, at);
      $('#tCwd', pg).textContent = cwd;
    }
    const o = $('.o', blk);
    o.className = 'o' + (rc !== 0 ? ' err' : '');
    o.textContent = text.replace(/\s+$/, '') || (rc === 0 ? '' : `exit ${rc}`);
    body.scrollTop = body.scrollHeight;
  };
  setTimeout(() => inp.focus(), 400);
}

function pageProps() {
  openPage('System props', async body => {
    body.innerHTML = `<label class="field" style="position:sticky;top:0;z-index:2;margin-bottom:8px;background:var(--s2)">${ic('search')}<input type="search" id="pq" placeholder="Search props" autocomplete="off" spellcheck="false" autocapitalize="off"></label><div id="pl">${skel(8, 44)}</div>`;
    const props = [];
    for (const l of lines(await run('getprop'))) { const m = l.match(/^\[(.+?)\]: \[(.*)\]$/); if (m) props.push([m[1], m[2]]); }
    const draw = (f = '') => {
      const list = props.filter(([k, v]) => !f || k.includes(f) || v.toLowerCase().includes(f));
      $('#pl', body).innerHTML = `<p class="muted" style="margin:4px 2px 4px">${list.length} of ${props.length} properties · tap to copy</p>`
        + list.slice(0, 400).map(([k, v]) => `<div class="prop" data-k="${esc(k)}"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')
        + (list.length > 400 ? `<p class="muted" style="text-align:center;padding:16px">${list.length - 400} more, refine your search</p>` : '');
    };
    draw();
    let t = 0;
    $('#pq', body).oninput = e => { clearTimeout(t); t = setTimeout(() => draw(e.target.value.trim().toLowerCase()), 150); };
    $('#pl', body).onclick = e => {
      const row = e.target.closest('[data-k]');
      if (!row) return;
      haptic();
      const p = props.find(x => x[0] === row.dataset.k);
      copy(`${p[0]}=${p[1]}`);
    };
  });
}

const MAINT = [
  { ic: 'drive', n: 'Trim storage', d: 'Runs fstrim to keep flash storage fast', c: 'sm fstrim', t: 600, ok: 'Storage trimmed' },
  { ic: 'sparkles', n: 'Clear all app caches', d: 'Frees cached files across every app', c: 'pm trim-caches 999G', t: 180, ok: 'All caches cleared' },
  { ic: 'bolt', n: 'Optimize apps', d: 'Compiles apps ahead of time (bg-dexopt). Takes a few minutes', c: 'cmd package bg-dexopt-job', t: 1800, ok: 'Apps optimized' },
  { ic: 'memory', n: 'Drop RAM caches', d: 'Flushes page cache and reclaims memory', c: 'sync; echo 3 > /proc/sys/vm/drop_caches', t: 60, ok: 'Page cache dropped' },
  { ic: 'stop', n: 'Kill background apps', d: 'Stops every cached background process', c: 'am kill-all', t: 60, ok: 'Background apps killed' },
  { ic: 'battery', n: 'Reset battery stats', d: 'Clears the usage history shown in Settings › Battery', c: 'dumpsys batterystats --reset', t: 60, ok: 'Battery stats reset' },
];
function pageMaint() {
  openPage('Maintenance', body => {
    body.innerHTML = MAINT.map((m, i) => `<section class="card"><div class="set-row"><div style="display:flex;gap:12px;align-items:center;min-width:0">${ic(m.ic, 'lead')}<div class="li-t"><b>${m.n}</b><span>${m.d}</span></div></div><button class="btn" data-m="${i}" style="min-height:40px">Run</button></div></section>`).join('');
    $$('[data-m]', body).forEach(b => (b.onclick = () => busy(b, async () => {
      haptic();
      const m = MAINT[+b.dataset.m];
      const r = await sh(m.c, { lane: 1, timeout: m.t });
      toast(r.code === 0 ? m.ok : lastLine(r.out) || 'Failed', r.code === 0 ? 'ok' : 'bad');
    })));
  });
}

// ───────────────────────── boot
function boot() {
  applyAccent(store.get('accent', 'mint'));
  try { window.RD_insets(JSON.parse(N.insets())); } catch (e) { /* keep CSS defaults */ }
  $('#gate .logo').innerHTML = logo('lgG');
  $('#gateBtn').onclick = checkRoot;
  buildTabbar();
  renderHome();
  renderTools();
  $('#tune').innerHTML = head('Tune', 'Waiting for root…');
  checkRoot();
}
boot();
