import { DEFAULT_CONFIG, normalizeConfig } from '../../core/config.js';
import * as achModule from 'w62-achievements'; // alias esbuild: src/core/data/achievements.js atau stub kosong
import { KEYS, loadConfig, saveConfig, errorsOf, loadLogs, onStorageChange, logLine } from '../shared.js';

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
  $('accounts-count').textContent = `${list.length} akun. Dibutuhkan 2 sampai 8.`;
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

// ---- tab -------------------------------------------------------------------
function selectTab(name) {
  for (const b of $('tabs').querySelectorAll('button')) {
    const on = b.dataset.tab === name;
    b.setAttribute('aria-selected', String(on));
    b.classList.toggle('active', on);
  }
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== `tab-${name}`;
  if (name === 'log') renderLogs();
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
  });
  const start = location.hash.slice(1);
  if (start && document.getElementById(`tab-${start}`)) selectTab(start);
  else selectTab('akun');
}

init();
