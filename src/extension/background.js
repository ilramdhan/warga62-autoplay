// Service worker: badge ON/OFF dan pembuka halaman pengaturan.
const CONFIG_KEY = 'w62.config';

// Agar bridge.js (content script) boleh menulis status ke storage.session.
function allowSession() {
  try {
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
  } catch (_e) {}
}

function setBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? '#1f7a3d' : '#6b6b6b' });
}

async function refreshBadge() {
  const r = await chrome.storage.local.get(CONFIG_KEY);
  setBadge(Boolean(r[CONFIG_KEY] && r[CONFIG_KEY].enabled));
}

allowSession();
refreshBadge();
chrome.runtime.onInstalled.addListener(() => {
  allowSession();
  refreshBadge();
});
chrome.runtime.onStartup.addListener(() => {
  allowSession();
  refreshBadge();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[CONFIG_KEY]) setBadge(Boolean(changes[CONFIG_KEY].newValue?.enabled));
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
});
