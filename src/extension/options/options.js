import { DEFAULT_CONFIG, normalizeConfig } from '../../core/config.js';
import * as achModule from 'w62-achievements'; // alias esbuild: src/core/data/achievements.js atau stub kosong
import {
  KEYS,
  loadConfig,
  saveConfig,
  errorsOf,
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
  if (el.dataset.path === 'myName' || el.dataset.path === 'hostName') renderAccounts();
  showErrors();
  $('save-state').textContent = 'Belum disimpan.';
}

// ---- validasi --------------------------------------------------------------
function showErrors() {
  const errs = errorsOf(normalizeSafe(draft));
  const ul = $('errors');
  ul.hidden = !errs.length;
  ul.replaceChildren(
    ...errs.map((m) => {
      const li = document.createElement('li');
      li.textContent = m;
      return li;
    }),
  );
  return errs;
}
function normalizeSafe(cfg) {
  try {
    return normalizeConfig(structuredClone(cfg));
  } catch (_e) {
    return cfg;
  }
}

// ---- daftar akun -----------------------------------------------------------
function renderAccounts() {
  const list = draft.accounts || [];
  $('accounts').replaceChildren(
    ...list.map((nick, i) => {
      const li = document.createElement('li');
      li.append(document.createTextNode(nick));
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'x';
      b.setAttribute('aria-label', `Hapus ${nick}`);
      b.addEventListener('click', () => {
        draft.accounts.splice(i, 1);
        renderAccounts();
        showErrors();
        $('save-state').textContent = 'Belum disimpan.';
      });
      li.append(b);
      return li;
    }),
  );
  $('accounts-count').textContent = `${list.length} akun (maks. 8).`;
  $('nick-list').replaceChildren(
    ...list.map((n) => {
      const o = document.createElement('option');
      o.value = n;
      return o;
    }),
  );
}
function addAccount() {
  const input = $('new-account');
  const nick = input.value.trim();
  if (!nick) return;
  draft.accounts = draft.accounts || [];
  if (draft.accounts.includes(nick)) {
    $('save-state').textContent = `Nick ${nick} sudah ada.`;
  } else if (draft.accounts.length >= 8) {
    $('save-state').textContent = 'Maksimal 8 akun.';
  } else {
    draft.accounts.push(nick);
    input.value = '';
    $('save-state').textContent = 'Belum disimpan.';
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
        $('save-state').textContent = 'Belum disimpan.';
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
  const merged = normalizeConfig({ ...draft, enabled: latest.enabled });
  const errs = errorsOf(merged);
  showErrors();
  if (errs.length && merged.enabled) {
    $('save-state').textContent = 'Bot sedang aktif, jadi pengaturan harus valid. Perbaiki kesalahan di atas.';
    return;
  }
  draft = await saveConfig(merged);
  renderForm();
  $('save-state').textContent = errs.length ? 'Tersimpan, tetapi belum valid: bot belum bisa dimulai.' : 'Tersimpan.';
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
function selectTab(name) {
  for (const b of $('tabs').querySelectorAll('button')) {
    const on = b.dataset.tab === name;
    b.setAttribute('aria-selected', String(on));
    b.classList.toggle('active', on);
  }
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== `tab-${name}`;
  if (name === 'log') renderLogs();
  if (name === 'monitor') renderMonitor();
  if (name === 'impor') $('json-area').value = exportText();
  window.history.replaceState(null, '', `#${name}`);
}

async function init() {
  draft = await loadConfig();
  renderForm();
  showErrors();
  document.addEventListener('input', onFieldInput);
  document.addEventListener('change', onFieldInput);
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) selectTab(b.dataset.tab);
  });
  $('add-account').addEventListener('click', addAccount);
  $('new-account').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addAccount();
  });
  $('save').addEventListener('click', save);
  $('reset').addEventListener('click', () => {
    if (!window.confirm('Kembalikan semua pengaturan ke bawaan? (Belum disimpan sampai kamu menekan Simpan)')) return;
    draft = normalizeConfig(structuredClone(DEFAULT_CONFIG));
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
    await chrome.storage.local.set({ [KEYS.logs]: [] });
    renderLogs();
  });
  $('log-export').addEventListener('click', async () =>
    download('warga62-log.json', JSON.stringify(await loadLogs(), null, 2)),
  );
  onStorageChange((changes) => {
    if (changes[KEYS.logs] && !$('tab-log').hidden) renderLogs();
    if (changes['w62.status'] && !$('tab-monitor').hidden) renderMonitor();
  });
  setInterval(() => {
    if (!$('tab-monitor').hidden) renderMonitor();
  }, 2000);
  const start = location.hash.slice(1);
  if (start && document.getElementById(`tab-${start}`)) selectTab(start);
  else selectTab('akun');
}

init();
