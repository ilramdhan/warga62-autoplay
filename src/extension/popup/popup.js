import {
  KEYS,
  START_GRACE_MS,
  GAME_URL,
  loadConfig,
  saveConfig,
  errorsOf,
  fillOwnDefaults,
  addKnownAccounts,
  removeKnownAccounts,
  loadStatus,
  loadLogs,
  onStorageChange,
  openTab,
  extensionUrl,
  formatRupiah,
  logLine,
  statusFields,
  stateLabel,
  handlerLabel,
  phaseLabel,
  isStale,
} from '../shared.js';

const $ = (id) => document.getElementById(id);
let config = null;
let status = statusFields(null);
let foreignNames = [];
/** Nama yang terakhir ditambahkan lewat "Semua pemain ini akun saya" (untuk tombol Batalkan). */
let adopted = [];
/** Waktu tombol MULAI ditekan; dipakai untuk mendeteksi tab game yang tidak mengirim status. */
let startedAt = 0;

function showError(msgs) {
  $('err-box').hidden = !msgs.length;
  $('err').textContent = msgs.join(' ');
  $('toggle').classList.toggle('error', msgs.length > 0);
}

function renderConfig() {
  const on = Boolean(config.enabled);
  const t = $('toggle');
  t.classList.toggle('on', on);
  t.classList.toggle('off', !on);
  $('toggle-label').textContent = on ? 'BERHENTI' : 'MULAI';
  $('toggle-hint').textContent = on ? 'Bot sedang jalan' : 'Bot sedang mati';
  if (document.activeElement !== $('myName')) $('myName').value = config.myName || '';
  for (const input of document.querySelectorAll('.seg input[type="radio"]')) {
    input.checked = config[input.name] === input.value;
  }
}

function renderStatus() {
  const f = status;
  const txt = (v) => (v === null || v === undefined || v === '' ? '-' : String(v));
  $('s-state').textContent = stateLabel(f.state, f.reason);
  $('s-handler').textContent = handlerLabel(f.handler);
  $('s-round').textContent = txt(f.round);
  $('s-phase').textContent = phaseLabel(f.phase);
  $('s-cash').textContent = formatRupiah(f.cash);
  renderPlayers(f);
  renderMonitor(f.insight);
  renderAge();
}

/** Usia status + deteksi tab game yang tidak terhubung. Dipanggil tiap detik (tanpa baca storage). */
function renderAge() {
  const f = status;
  const now = Date.now();
  if (f.at) {
    const sec = Math.max(0, Math.round((now - f.at) / 1000));
    $('s-age').textContent = `Update terakhir ${sec} detik lalu.`;
  } else {
    $('s-age').textContent = 'Belum ada data dari halaman game.';
  }
  if (startedAt && f.at && f.at >= startedAt) startedAt = 0;
  const stale = isStale(f.at, now);
  const noAnswer = Boolean(startedAt) && now - startedAt > START_GRACE_MS;
  const disconnected = stale || noAnswer;
  $('status-panel').classList.toggle('stale', disconnected);
  const box = $('conn-box');
  if (box.hidden === disconnected) box.hidden = !disconnected;
  const msg = noAnswer
    ? 'Bot belum mendapat jawaban dari tab game. Buka mainwarga62.id lalu muat ulang tab-nya.'
    : 'Tab game tidak terhubung. Buka mainwarga62.id';
  // Hindari pengumuman ulang oleh pembaca layar: tulis hanya bila teksnya berubah.
  if ($('conn-msg').textContent !== msg) $('conn-msg').textContent = msg;
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
      li.textContent = `${o.name} — kas ${formatRupiah(o.cash)} · ancaman ${formatRupiah(o.threat)}`;
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
  // Hanya ke daftar akun milikmu (pengaman), TIDAK ke Akun yang ikut main: undangan & kursi room tidak berubah.
  const { accounts, added, error } = addKnownAccounts(config, names);
  const err = $('adopt-err');
  err.hidden = !error;
  err.textContent = error || '';
  if (error) return;
  adopted = added;
  await update({ accounts });
  renderAdopted();
}

function renderAdopted() {
  const box = $('adopt-done');
  box.hidden = !adopted.length;
  if (adopted.length) {
    $('adopt-done-msg').textContent =
      `Ditambahkan ke daftar akun milikmu: ${adopted.join(', ')}. ` +
      'Tidak ikut diundang; atur Akun yang ikut main di Pengaturan lengkap.';
  }
}

async function undoAdopt() {
  if (!adopted.length) return;
  const accounts = removeKnownAccounts(config, adopted);
  adopted = [];
  await update({ accounts });
  renderAdopted();
}

function renderLogs(list) {
  const logs = (Array.isArray(list) ? list : []).slice(-20);
  const el = $('logs');
  // Gulir otomatis hanya bila pengguna memang sedang di dekat bagian bawah.
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  el.textContent = logs.length ? logs.map(logLine).join('\n') : 'Belum ada log.';
  if (nearBottom) el.scrollTop = el.scrollHeight;
}

async function update(patch) {
  const next = fillOwnDefaults({ ...config, ...patch });
  const errs = errorsOf(next);
  // Hanya cegah MENGAKTIFKAN bot saat ada galat. Perubahan field lain (role, nick, mode)
  // tetap disimpan, supaya setelan tidak pernah "tersangkut" karena galat yang tak berkaitan.
  if (patch.enabled === true && errs.length) {
    showError(errs);
    return;
  }
  showError(next.enabled ? errs : []);
  if (patch.enabled === true) startedAt = Date.now();
  if (patch.enabled === false) startedAt = 0;
  config = await saveConfig(next);
  renderConfig();
  renderAge();
}

function openOptions(hash) {
  openTab(extensionUrl(`options/options.html#${hash}`));
  window.close();
}

async function init() {
  config = await loadConfig();
  renderConfig();
  status = statusFields(await loadStatus());
  renderStatus();
  renderLogs(await loadLogs());

  $('toggle').addEventListener('click', () => update({ enabled: !config.enabled }));
  $('adopt').addEventListener('click', adoptForeign);
  $('adopt-undo').addEventListener('click', undoAdopt);
  $('fix-config').addEventListener('click', () => openOptions('akun'));
  $('open-game').addEventListener('click', () => {
    openTab(GAME_URL);
    window.close();
  });
  $('myName').addEventListener('change', (e) => update({ myName: e.target.value.trim() }));
  for (const input of document.querySelectorAll('.seg input[type="radio"]')) {
    input.addEventListener('change', () => {
      if (input.checked) update({ [input.name]: input.value });
    });
  }
  $('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    openOptions('akun');
  });
  $('open-monitor').addEventListener('click', (e) => {
    e.preventDefault();
    openOptions('monitor');
  });
  onStorageChange(async (changes) => {
    if (changes[KEYS.config]) {
      config = await loadConfig();
      renderConfig();
    }
    if (changes[KEYS.status]) {
      status = statusFields(changes[KEYS.status].newValue ?? null);
      renderStatus();
    }
    if (changes[KEYS.logs]) renderLogs(changes[KEYS.logs].newValue);
  });
  // Hanya untuk teks "N detik lalu" dan deteksi status basi; data baru datang lewat onStorageChange.
  setInterval(renderAge, 1000);
}

init();
