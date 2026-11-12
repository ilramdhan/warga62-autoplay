import {
  loadConfig,
  saveConfig,
  errorsOf,
  loadStatus,
  loadLogs,
  onStorageChange,
  formatRupiah,
  logLine,
  statusFields,
} from '../shared.js';

const $ = (id) => document.getElementById(id);
let config = null;
let foreignNames = [];

function showError(msgs) {
  const el = $('err');
  el.hidden = !msgs.length;
  el.textContent = msgs.join(' ');
}

function renderConfig() {
  const on = Boolean(config.enabled);
  const t = $('toggle');
  t.classList.toggle('on', on);
  t.classList.toggle('off', !on);
  t.setAttribute('aria-pressed', String(on));
  t.querySelector('.toggle-label').textContent = on ? 'BERHENTI' : 'MULAI';
  t.querySelector('.toggle-hint').textContent = on ? 'Bot sedang jalan' : 'Bot sedang mati';
  if (document.activeElement !== $('myName')) $('myName').value = config.myName || '';
  for (const seg of document.querySelectorAll('.seg')) {
    for (const b of seg.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(config[seg.dataset.key] === b.dataset.value));
    }
  }
}

function renderStatus(s) {
  const f = statusFields(s);
  const txt = (v) => (v === null || v === undefined || v === '' ? '-' : String(v));
  $('s-state').textContent = txt(f.state);
  $('s-handler').textContent = txt(f.handler);
  $('s-round').textContent = txt(f.round);
  $('s-phase').textContent = txt(f.phase);
  $('s-cash').textContent = formatRupiah(f.cash);
  renderPlayers(f);
  renderMonitor(f.insight);
  if (f.at) {
    const sec = Math.max(0, Math.round((Date.now() - f.at) / 1000));
    $('s-age').textContent = `Update terakhir ${sec} detik lalu.`;
  } else {
    $('s-age').textContent = 'Belum ada data dari halaman game. Buka mainwarga62.id.';
  }
}

function renderMonitor(ins) {
  $('monitor-panel').hidden = !ins;
  if (!ins) return;
  const stance = ins.me?.stance ? ` · ${ins.me.stance}` : '';
  $('mon-line').textContent = `Ronde ${ins.round ?? '-'}${stance}`;
  const top = [...(ins.opponents || [])].sort((a, b) => (b.threat || 0) - (a.threat || 0)).slice(0, 3);
  $('mon-opps').replaceChildren(
    ...top.map((o) => {
      const li = document.createElement('li');
      li.textContent = `${o.name} — ${formatRupiah(o.cash)} · ${formatRupiah(o.threat)}`;
      return li;
    }),
  );
}

function renderPlayers(f) {
  $('players-panel').hidden = !f.players.length;
  $('players-list').textContent = f.players.join(', ');
  $('foreign-box').hidden = !f.foreign.length;
  if (f.foreign.length) {
    $('foreign-msg').textContent =
      `Bot dijeda: ada pemain yang belum terdaftar sebagai akunmu (${f.foreign.join(', ')}). ` +
      'Bot hanya boleh main melawan akun milikmu sendiri.';
  } else {
    $('adopt-err').hidden = true;
  }
  foreignNames = f.foreign;
}

async function adoptForeign() {
  const names = foreignNames;
  if (!names.length) return;
  if (!window.confirm(`Pastikan SEMUA pemain berikut akun milikmu sendiri: ${names.join(', ')}. Lanjutkan?`)) return;
  const accounts = [...(config.accounts || [])];
  for (const n of names) {
    if (!accounts.some((a) => a.toLowerCase() === n.toLowerCase())) accounts.push(n);
  }
  const err = $('adopt-err');
  if (accounts.length > 8) {
    err.textContent = 'Akun melebihi batas 8 nick. Kurangi daftar akun di Pengaturan lengkap.';
    err.hidden = false;
    return;
  }
  err.hidden = true;
  await update({ accounts });
}

async function renderLogs() {
  const logs = (await loadLogs()).slice(-20);
  const el = $('logs');
  el.textContent = logs.length ? logs.map(logLine).join('\n') : 'Belum ada log.';
  el.scrollTop = el.scrollHeight;
}

async function update(patch) {
  const next = { ...config, ...patch };
  const errs = errorsOf(next);
  // Hanya cegah MENGAKTIFKAN bot saat ada galat. Perubahan field lain (role, nick, mode)
  // tetap disimpan, supaya setelan tidak pernah "tersangkut" karena galat yang tak berkaitan.
  if (patch.enabled === true && errs.length) {
    showError(errs);
    return;
  }
  showError(next.enabled ? errs : []);
  config = await saveConfig(next);
  renderConfig();
}

async function refresh() {
  renderStatus(await loadStatus());
  await renderLogs();
}

async function init() {
  config = await loadConfig();
  renderConfig();
  await refresh();

  $('toggle').addEventListener('click', () => update({ enabled: !config.enabled }));
  $('adopt').addEventListener('click', adoptForeign);
  $('myName').addEventListener('change', (e) => update({ myName: e.target.value.trim() }));
  for (const seg of document.querySelectorAll('.seg')) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) update({ [seg.dataset.key]: b.dataset.value });
    });
  }
  $('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
    window.close();
  });
  $('open-monitor').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#monitor') });
    window.close();
  });
  onStorageChange(async (changes) => {
    if (changes['w62.config']) {
      config = await loadConfig();
      renderConfig();
    }
    if (changes['w62.status'] || changes['w62.logs']) refresh();
  });
  setInterval(refresh, 3000);
}

init();
