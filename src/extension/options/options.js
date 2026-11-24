import { DEFAULT_CONFIG, MAX_KNOWN_ACCOUNTS, MAX_ROSTER, normalizeConfig } from '../../core/config.js';
import * as achModule from 'w62-achievements'; // alias esbuild: src/core/data/achievements.js atau stub kosong
import {
  KEYS,
  loadConfig,
  saveConfig,
  errorsOf,
  detailedErrorsOf,
  warningsOf,
  loadLogs,
  onStorageChange,
  logLine,
  loadStatus,
  statusFields,
  formatRupiah,
} from '../shared.js';

const $ = (id) => document.getElementById(id);
const fields = () => [...document.querySelectorAll('[data-path]')];
let draft = null;

// ---- pelacakan perubahan ---------------------------------------------------
// Hanya path yang diubah di form ini yang ditulis saat Simpan, supaya perubahan dari popup
// (nick, peran, mode, akun) tidak tertimpa nilai lama di form.
const dirty = new Set();
let dirtyAll = false; // impor JSON / kembalikan bawaan: seluruh form menggantikan config.
/** Tanda tangan config terakhir yang dimuat/disimpan (tanpa `enabled`) untuk mengenali perubahan dari luar. */
let knownSig = '';
const sigOf = (cfg) => JSON.stringify({ ...normalizeConfig(cfg || {}), enabled: null });
const isDirty = () => dirtyAll || dirty.size > 0;
function markDirty(path) {
  if (path) dirty.add(path);
  $('save-state').textContent = 'Belum disimpan.';
}
function clearDirty() {
  dirty.clear();
  dirtyAll = false;
  $('ext-change').hidden = true;
}
/** Config terbaru dari storage + perubahan yang belum disimpan dari form ini. */
function overlayDirty(latest) {
  const out = structuredClone(latest);
  for (const path of dirty) {
    const v = getPath(draft, path);
    setPath(out, path, v === undefined ? v : structuredClone(v));
  }
  return out;
}

// ---- util path -------------------------------------------------------------
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k, i) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
}

// ---- field <-> draft -------------------------------------------------------
function readField(el) {
  const kind = el.dataset.kind;
  if (el.type === 'checkbox') return el.checked;
  if (kind === 'num') return el.value === '' ? NaN : Number(el.value);
  if (kind === 'auto-num') return el.value === 'auto' ? 'auto' : Number(el.value);
  if (kind === 'lines') {
    return el.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (el.type === 'text') return el.value.trim();
  return el.value;
}
function writeField(el, value) {
  const kind = el.dataset.kind;
  if (el.type === 'checkbox') el.checked = Boolean(value);
  else if (el.type === 'radio') el.checked = el.value === String(value);
  else if (kind === 'lines') el.value = Array.isArray(value) ? value.join('\n') : '';
  else el.value = value === undefined || value === null ? '' : String(value);
}

function renderForm() {
  for (const el of fields()) writeField(el, getPath(draft, el.dataset.path));
  renderAccounts();
  renderCatalogChecks();
  $('risk-out').textContent = Number(draft.strategy?.riskTolerance ?? 0).toFixed(2);
}

function onFieldInput(e) {
  const el = e.target.closest('[data-path]');
  if (!el) return;
  if (el.type === 'radio' && !el.checked) return;
  setPath(draft, el.dataset.path, readField(el));
  if (el.dataset.path === 'strategy.riskTolerance') $('risk-out').textContent = Number(readField(el)).toFixed(2);
  if (ROSTER_INPUTS.has(el.dataset.path)) renderAccounts();
  markDirty(el.dataset.path);
  showErrors();
}

// ---- validasi --------------------------------------------------------------
// Daftar galat sengaja tanpa role="alert" (dibangun ulang tiap ketikan); jumlahnya diumumkan
// lewat #save-state saat Simpan. Field terkait ditandai aria-invalid + aria-describedby.
function showErrors() {
  const errs = detailedErrorsOf(normalizeSafe(draft));
  const ul = $('errors');
  ul.hidden = !errs.length;
  for (const el of document.querySelectorAll('[aria-invalid]')) {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  }
  const byField = new Map();
  ul.replaceChildren(
    ...errs.map((e, i) => {
      const li = document.createElement('li');
      li.id = `err-${i}`;
      li.textContent = e.message;
      const sel = `[data-path="${e.path}"], [data-err-path="${e.path}"]`;
      for (const el of e.path ? document.querySelectorAll(sel) : []) {
        byField.set(el, [...(byField.get(el) || []), li.id]);
      }
      return li;
    }),
  );
  for (const [el, ids] of byField) {
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', ids.join(' '));
  }
  for (const b of $('tabs').querySelectorAll('[role="tab"]')) {
    b.classList.toggle('has-error', Boolean($(b.getAttribute('aria-controls')).querySelector('[aria-invalid]')));
  }
  return errs.map((e) => e.message);
}
function normalizeSafe(cfg) {
  try {
    return normalizeConfig(structuredClone(cfg));
  } catch (_e) {
    return cfg;
  }
}

// ---- daftar akun & akun yang ikut main -------------------------------------
/** Field yang memengaruhi roster (nick otomatis ikut / batas kursi). */
const ROSTER_INPUTS = new Set(['myName', 'hostName', 'winnerName', 'mode', 'role', 'room.maxPlayers']);
const lc = (s) => String(s).trim().toLowerCase();
const inList = (list, n) => (list || []).some((x) => lc(x) === lc(n));

function renderAccounts() {
  const list = draft.accounts || [];
  $('accounts').replaceChildren(
    ...list.map((nick) => {
      const li = document.createElement('li');
      li.append(document.createTextNode(nick));
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'x';
      b.setAttribute('aria-label', `Hapus ${nick}`);
      b.addEventListener('click', () => {
        // Nick yang dihapus dari daftar akun juga keluar dari Akun yang ikut main.
        draft.accounts = (draft.accounts || []).filter((n) => lc(n) !== lc(nick));
        draft.roster = (draft.roster || []).filter((n) => lc(n) !== lc(nick));
        renderAccounts();
        markDirty('accounts');
        markDirty('roster');
        showErrors();
      });
      li.append(b);
      return li;
    }),
  );
  $('accounts-count').textContent = `${list.length} akun (maks. ${MAX_KNOWN_ACCOUNTS}).`;
  $('nick-list').replaceChildren(
    ...list.map((n) => {
      const o = document.createElement('option');
      o.value = n;
      return o;
    }),
  );
  renderRoster();
}

/** Centang Akun yang ikut main. Nick sendiri/host/pemenang selalu ikut (dikunci). */
function renderRoster() {
  const view = normalizeSafe(draft);
  const auto = new Set(
    [view.myName, view.hostName, view.mode === 'grind' ? view.winnerName : ''].filter(Boolean).map(lc),
  );
  const names = [...(view.accounts || [])];
  const roster = view.roster || [];
  $('roster').replaceChildren(
    ...names.map((nick) => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = inList(roster, nick);
      cb.disabled = auto.has(lc(nick));
      cb.addEventListener('change', () => {
        const cur = (normalizeSafe(draft).roster || []).filter((n) => lc(n) !== lc(nick));
        draft.roster = cb.checked ? [...cur, nick] : cur;
        markDirty('roster');
        renderRoster();
        showErrors();
      });
      const text = document.createElement('span');
      text.textContent = auto.has(lc(nick)) ? `${nick} (otomatis)` : nick;
      label.append(cb, text);
      return label;
    }),
  );
  const max = view.room?.maxPlayers ?? 4;
  $('roster-count').textContent = `${roster.length} dari maks. ${max} pemain (Maks. pemain room).`;
  const warn = $('roster-warn');
  const msgs = [];
  if (roster.length > max) {
    msgs.push(`Terlalu banyak: ${roster.length} akun dicentang, room hanya ${max} kursi.`);
  }
  msgs.push(...warningsOf(view).map((w) => w.message));
  warn.hidden = !msgs.length;
  warn.textContent = msgs.join(' ');
}

function addAccount() {
  const input = $('new-account');
  const nick = input.value.trim();
  if (!nick) return;
  draft.accounts = draft.accounts || [];
  if (inList(draft.accounts, nick)) {
    $('save-state').textContent = `Nick ${nick} sudah ada.`;
  } else if (draft.accounts.length >= MAX_KNOWN_ACCOUNTS) {
    $('save-state').textContent = `Maksimal ${MAX_KNOWN_ACCOUNTS} akun.`;
  } else {
    draft.accounts.push(nick);
    // Ada kursi kosong: langsung ikut main (bisa dilepas centangnya).
    const view = normalizeSafe(draft);
    const roster = view.roster || [];
    if (roster.length < Math.min(MAX_ROSTER, view.room?.maxPlayers ?? 4)) {
      draft.roster = [...roster, nick];
      markDirty('roster');
    }
    input.value = '';
    markDirty('accounts');
  }
  renderAccounts();
  showErrors();
}

// ---- katalog pencapaian (opsional) -----------------------------------------
function findCatalog() {
  for (const v of Object.values(achModule)) {
    if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && 'id' in v[0]) return v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const vals = Object.values(v);
      if (vals.length && vals.every((x) => x && typeof x === 'object' && 'id' in x)) return vals;
    }
  }
  return [];
}
const catalog = findCatalog();

function renderCatalogChecks() {
  if (!catalog.length) return;
  $('ach-catalog').hidden = false;
  $('ach-free').hidden = true;
  const sel = new Set(draft.achievements?.targets || []);
  $('ach-list').replaceChildren(
    ...catalog.map((a) => {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = sel.has(a.id);
      cb.addEventListener('change', () => {
        const set = new Set(draft.achievements.targets || []);
        if (cb.checked) set.add(a.id);
        else set.delete(a.id);
        draft.achievements.targets = [...set];
        markDirty('achievements.targets');
      });
      const text = document.createElement('span');
      const name = document.createElement('b');
      name.textContent = a.name || a.title || a.id;
      text.append(name);
      const desc = a.description || a.desc || a.how;
      if (typeof desc === 'string') {
        const s = document.createElement('small');
        s.textContent = desc;
        text.append(s);
      }
      label.append(cb, text);
      return label;
    }),
  );
}

// ---- simpan / reset / impor ------------------------------------------------
async function save() {
  const latest = await loadConfig();
  const merged = normalizeConfig(dirtyAll ? { ...draft, enabled: latest.enabled } : overlayDirty(latest));
  const errs = errorsOf(merged);
  showErrors();
  if (errs.length && merged.enabled) {
    $('save-state').textContent =
      `Belum disimpan: ada ${errs.length} kesalahan. Bot sedang aktif, jadi pengaturan harus valid.`;
    return;
  }
  knownSig = sigOf(merged);
  draft = await saveConfig(merged);
  clearDirty();
  renderForm();
  showErrors();
  $('save-state').textContent = errs.length
    ? `Tersimpan, tetapi ada ${errs.length} kesalahan: bot belum bisa dimulai.`
    : 'Tersimpan.';
}

/** Config berubah di storage (mis. dari popup). Form bersih: muat ulang; form kotor: tawarkan. */
function onExternalConfig(value) {
  const sig = sigOf(value);
  if (sig === knownSig) return; // simpanan sendiri, atau hanya tombol MULAI/BERHENTI
  if (!isDirty()) {
    knownSig = sig;
    draft = normalizeConfig(value || {});
    renderForm();
    showErrors();
    $('save-state').textContent = 'Pengaturan diperbarui dari popup.';
    return;
  }
  $('ext-change').hidden = false;
}
async function reloadExternal() {
  const latest = await loadConfig();
  knownSig = sigOf(latest);
  if (dirtyAll) {
    draft = latest;
    clearDirty();
  } else {
    draft = overlayDirty(latest);
    $('ext-change').hidden = true;
  }
  renderForm();
  showErrors();
  $('save-state').textContent = isDirty()
    ? 'Dimuat ulang; perubahanmu yang belum disimpan tetap ada.'
    : 'Dimuat ulang dari penyimpanan.';
}

function exportText() {
  return JSON.stringify(normalizeSafe(draft), null, 2);
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importText(text) {
  try {
    draft = normalizeConfig(JSON.parse(text));
    dirtyAll = true;
    renderForm();
    showErrors();
    $('save-state').textContent = 'JSON diterapkan ke form. Tekan Simpan untuk menyimpan.';
  } catch (e) {
    $('save-state').textContent = `JSON tidak valid: ${e.message}`;
  }
}

// ---- log -------------------------------------------------------------------
async function renderLogs() {
  const logs = await loadLogs();
  $('log-view').textContent = logs.length ? logs.map(logLine).join('\n') : 'Belum ada log.';
}

// ---- monitor ---------------------------------------------------------------
function h(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined && text !== null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
const TREND = { naik: '▲', turun: '▼', stabil: '▬' };
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clock = (ts) => new Date(ts).toTimeString().slice(0, 8);

function fillList(ul, lines, empty) {
  ul.replaceChildren(...(lines.length ? lines.map((t) => h('li', t)) : [h('li', empty, 'muted')]));
}

function oppRows(o, leader) {
  const name = h('th', null, 'mon-name');
  name.scope = 'row';
  const nm = h('span', o.name);
  if (o.bankrupt) nm.className = 'mon-bankrupt';
  name.append(nm);
  if (o.own) name.append(' (akunmu)');
  if (leader && o.name === leader) name.append(' 👑');
  if (o.jailed) name.append(' ', h('span', 'Lapas', 'mon-tag'));
  const list = (a) => (Array.isArray(a) && a.length ? a.join(', ') : '-');
  const row = h('tr');
  row.append(
    name,
    h('td', formatRupiah(o.cash)),
    h('td', formatRupiah(o.netWorth) + (num(o.loanDebt) > 0 ? ` (utang ${formatRupiah(o.loanDebt)})` : '')),
    h('td', num(o.cities)),
    h('td', num(o.buildings)),
    h('td', num(o.mortgaged)),
    h('td', list(o.provinces)),
    h('td', list(o.nearProvinces)),
    h('td', formatRupiah(o.threat)),
    h('td', o.style || '-'),
    h('td', TREND[o.trend] || TREND.stabil),
  );
  const rows = [row];
  if (Array.isArray(o.changes) && o.changes.length) {
    const d = h('tr', null, 'mon-detail');
    const td = h('td', o.changes.join(' · '));
    td.colSpan = 11;
    d.append(td);
    rows.push(d);
  }
  return rows;
}

async function renderMonitor() {
  const f = statusFields(await loadStatus());
  const ins = f.insight;
  $('mon-empty').hidden = Boolean(ins);
  $('mon-body').hidden = !ins;
  if (!ins) return;
  const head = $('mon-head');
  head.replaceChildren(
    `Ronde ${ins.round ?? '-'} · ${ins.mode === 'grind' ? 'Grinding XP' : 'Arena pintar'} · Tingkat ${ins.difficulty || '-'}`,
  );
  if (ins.crisis) head.append(' ', h('span', 'Krisis aktif', 'mon-tag mon-crisis'));
  const me = ins.me || {};
  const dl = $('mon-me');
  dl.replaceChildren();
  for (const [k, v] of [
    ['Kas', me.cash],
    ['Kekayaan bersih', me.netWorth],
    ['Cadangan', me.reserve],
    ['Perkiraan biaya 2 giliran', me.exposure],
    ...(num(me.loanDebt) > 0 ? [['Utang', me.loanDebt]] : []),
  ]) {
    const d = h('div');
    d.append(h('dt', k), h('dd', formatRupiah(v)));
    dl.append(d);
  }
  const st = $('mon-stance');
  st.replaceChildren(h('span', me.stance || '-', `mon-tag mon-stance-${me.stance || 'seimbang'}`));
  if (me.stanceWhy) st.append(' ', me.stanceWhy);
  fillList($('mon-strategy'), ins.strategy || [], 'Belum ada.');
  const opps = [...(ins.opponents || [])];
  $('mon-opp').tBodies[0].replaceChildren(...opps.flatMap((o) => oppRows(o, ins.leaderName)));
  fillList($('mon-notes'), ins.notes || [], 'Tidak ada catatan.');
  const ds = [...f.decisions].reverse();
  fillList(
    $('mon-decisions'),
    ds.map((d) => `${clock(d.ts)}  ${d.label}${d.reason ? ' — ' + d.reason : ''}`),
    'Belum ada keputusan.',
  );
}

// ---- tab -------------------------------------------------------------------
const tabButtons = () => [...$('tabs').querySelectorAll('[role="tab"]')];
/** Pola tab ARIA: panah memindah fokus + memilih tab (aktivasi otomatis), Home/End ke ujung. */
function onTabKey(e) {
  const tabs = tabButtons();
  const i = tabs.indexOf(e.target.closest('[role="tab"]'));
  if (i < 0) return;
  const last = tabs.length - 1;
  const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: last }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  selectTab(tabs[to > last ? 0 : to < 0 ? last : to].dataset.tab, true);
}
const tabFromHash = () => {
  const name = location.hash.slice(1);
  return name && document.getElementById(`tab-${name}`) ? name : null;
};

function selectTab(name, focus = false) {
  for (const b of tabButtons()) {
    const on = b.dataset.tab === name;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    b.classList.toggle('active', on);
    if (on && focus) b.focus();
  }
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== `tab-${name}`;
  if (name === 'log') renderLogs();
  if (name === 'monitor') renderMonitor();
  if (name === 'impor') $('json-area').value = exportText();
  window.history.replaceState(null, '', `#${name}`);
}

async function init() {
  draft = await loadConfig();
  knownSig = sigOf(draft);
  renderForm();
  showErrors();
  document.addEventListener('input', onFieldInput);
  document.addEventListener('change', onFieldInput);
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) selectTab(b.dataset.tab);
  });
  $('tabs').addEventListener('keydown', onTabKey);
  window.addEventListener('hashchange', () => {
    const name = tabFromHash();
    if (name) selectTab(name);
  });
  window.addEventListener('beforeunload', (e) => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = '';
  });
  $('ext-reload').addEventListener('click', reloadExternal);
  $('add-account').addEventListener('click', addAccount);
  $('new-account').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAccount();
    }
  });
  $('save').addEventListener('click', save);
  $('reset').addEventListener('click', () => {
    if (!window.confirm('Kembalikan semua pengaturan ke bawaan? (Belum disimpan sampai kamu menekan Simpan)')) return;
    draft = normalizeConfig(structuredClone(DEFAULT_CONFIG));
    dirtyAll = true;
    renderForm();
    showErrors();
    $('save-state').textContent = 'Bawaan dimuat ke form. Tekan Simpan untuk menyimpan.';
  });
  $('json-export').addEventListener('click', () => {
    $('json-area').value = exportText();
  });
  $('json-download').addEventListener('click', () => download('warga62-config.json', exportText()));
  $('json-import').addEventListener('click', () => importText($('json-area').value));
  $('json-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) {
      const text = await f.text();
      $('json-area').value = text;
      importText(text);
    }
  });
  $('log-refresh').addEventListener('click', renderLogs);
  $('log-clear').addEventListener('click', async () => {
    if (!window.confirm('Hapus semua log? Tindakan ini tidak bisa dibatalkan.')) return;
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) await chrome.storage.local.set({ [KEYS.logs]: [] });
    renderLogs();
  });
  $('log-export').addEventListener('click', async () =>
    download('warga62-log.json', JSON.stringify(await loadLogs(), null, 2)),
  );
  onStorageChange((changes, area) => {
    if (changes[KEYS.config] && area === 'local') onExternalConfig(changes[KEYS.config].newValue);
    if (changes[KEYS.logs] && !$('tab-log').hidden) renderLogs();
    if (changes['w62.status'] && !$('tab-monitor').hidden) renderMonitor();
  });
  setInterval(() => {
    if (!$('tab-monitor').hidden) renderMonitor();
  }, 2000);
  selectTab(tabFromHash() || 'akun');
}

init();
