// Bumpline — relist your Vinted items in one click.
// Copyright (C) 2026 g1ampy
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation, either version 3 of the License, or (at your option)
// any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along
// with this program. If not, see <https://www.gnu.org/licenses/>.

// The background — a service worker on Chrome, an event page on Firefox —
// exists for two jobs the page cannot do on its own:
//
//   1. Watch the requests Vinted's own site makes and note the security tokens
//      it attaches, so the extension can send requests Vinted will accept.
//   2. Fetch image bytes from the CDN when a cross-origin read from the page is
//      refused.

// Firefox answers to `browser` and only that namespace returns promises there;
// Chrome answers to `chrome`. One alias, and the rest of the file is written
// once for both.
const ext = globalThis.browser ?? globalThis.chrome;

const TOKEN_KEYS = { csrf: 'bumpline.csrf', anon: 'bumpline.anon' };

// Vinted runs one domain per country; the request filter has to name them all.
const COUNTRY_DOMAINS = [
  'vinted.at', 'vinted.be', 'vinted.bg', 'vinted.ch', 'vinted.co.uk',
  'vinted.com', 'vinted.cz', 'vinted.de', 'vinted.dk', 'vinted.ee',
  'vinted.es', 'vinted.fi', 'vinted.fr', 'vinted.gr', 'vinted.hr',
  'vinted.hu', 'vinted.ie', 'vinted.it', 'vinted.lt', 'vinted.lv',
  'vinted.nl', 'vinted.no', 'vinted.pl', 'vinted.pt', 'vinted.ro',
  'vinted.se', 'vinted.si', 'vinted.sk',
];

// Both shapes appear in the wild: /api/... at the root, and /<locale>/api/...
const API_URL_FILTERS = COUNTRY_DOMAINS.flatMap(domain => [
  `https://www.${domain}/api/*`,
  `https://www.${domain}/*/api/*`,
]);

let seen = { csrf: null, anon: null };

// Remember the tokens in memory for speed and on disk for content scripts that
// start up in a tab which has not issued an API call yet.
function noteTokens(headers) {
  if (!Array.isArray(headers)) return;

  let changed = false;
  for (const header of headers) {
    if (!header || !header.name || !header.value) continue;
    const name = header.name.toLowerCase();
    if (name === 'x-csrf-token' && header.value !== seen.csrf) {
      seen.csrf = header.value;
      changed = true;
    } else if (name === 'x-anon-id' && header.value !== seen.anon) {
      seen.anon = header.value;
      changed = true;
    }
  }
  if (!changed) return;

  ext.storage.local
    .set({ [TOKEN_KEYS.csrf]: seen.csrf, [TOKEN_KEYS.anon]: seen.anon })
    .catch(() => {
      // Losing the cached copy is survivable: the page can still parse the
      // token out of the markup.
    });
}

ext.webRequest.onBeforeSendHeaders.addListener(
  details => {
    try {
      noteTokens(details.requestHeaders);
    } catch (err) {
      console.debug('[Bumpline] could not read request headers', err);
    }
  },
  { urls: API_URL_FILTERS },
  ['requestHeaders']
);

async function tokensForPage() {
  if (seen.csrf || seen.anon) return { csrf: seen.csrf, anonId: seen.anon };
  try {
    const stored = await ext.storage.local.get([TOKEN_KEYS.csrf, TOKEN_KEYS.anon]);
    return { csrf: stored[TOKEN_KEYS.csrf] || null, anonId: stored[TOKEN_KEYS.anon] || null };
  } catch (_) {
    return { csrf: null, anonId: null };
  }
}

async function fetchBinary(url) {
  try {
    const reply = await fetch(url, { credentials: 'omit' });
    if (!reply.ok) return { ok: false, status: reply.status };
    return {
      ok: true,
      buffer: await reply.arrayBuffer(),
      contentType: reply.headers.get('content-type') || '',
    };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

ext.runtime.onMessage.addListener((message, _sender, respond) => {
  if (!message || !message.type) return false;

  if (message.type === 'bumpline:tokens') {
    tokensForPage().then(respond);
    return true; // the reply is asynchronous
  }

  if (message.type === 'bumpline:fetchBinary' && message.url) {
    fetchBinary(message.url).then(respond);
    return true;
  }

  return false;
});

// --- the toolbar icon -----------------------------------------------------

// The icon is the only part of the extension visible when no panel is open, so
// it carries the one thing worth knowing from outside: whether pressing it
// would get you anything. Colour means yes — the switch is on and this tab is a
// Vinted page. Grey means no, for either reason, and the tooltip says which.
// Same drawing, luma only.
const ENABLED_KEY = 'bumpline:enabled';

const ACTION_ICONS = {
  on: { 16: 'icons/icon16.png', 24: 'icons/icon24.png', 32: 'icons/icon32.png' },
  off: { 16: 'icons/off16.png', 24: 'icons/off24.png', 32: 'icons/off32.png' },
};

// vinted.it, vinted.com, vinted.co.uk … one domain per country. The same test
// the popup makes, written the same way.
const VINTED_HOST = /(^|\.)vinted\.[a-z]{2,3}(\.[a-z]{2})?$/i;

// A tab's url only reaches an extension that holds a host permission for it,
// which here is exactly the Vinted domains. Everywhere else it arrives
// undefined — and that is not a gap to work around, it is the answer.
function onVinted(url) {
  if (!url) return false;
  try {
    return VINTED_HOST.test(new URL(url).hostname);
  } catch (_) {
    return false;
  }
}

// The switch, cached. The worker is torn down between events and reads it back
// on the way up; every repaint in between needs it, and none of them should
// have to wait on storage for it.
let switchedOn = true;

function titleFor(colour) {
  if (!switchedOn) return 'Bumpline: off';
  return colour ? 'Bumpline' : 'Bumpline: not a Vinted page';
}

// Without a tabId this is the default every tab starts from; with one it is an
// override for that tab alone, which is what makes the icon able to answer a
// question about the page rather than only about the switch.
function paintIcon(colour, tabId) {
  // Chrome returns promises here and Firefox returns them from a different
  // object; neither failure is worth taking the worker down for, and an icon
  // that did not repaint is not a reason to stop watching request headers. It
  // is worth saying out loud, though: a swallowed rejection here is an icon
  // that never changes and no way to find out why.
  const action = ext.action || ext.browserAction;
  if (!action) return;
  const where = tabId == null ? {} : { tabId };
  try {
    Promise.resolve(action.setIcon({ ...where, path: colour ? ACTION_ICONS.on : ACTION_ICONS.off }))
      .catch(err => console.debug('[Bumpline] could not set the icon', err));
    Promise.resolve(action.setTitle({ ...where, title: titleFor(colour) }))
      .catch(err => console.debug('[Bumpline] could not set the title', err));
  } catch (err) {
    // An older browser without these methods keeps the manifest's icon.
    console.debug('[Bumpline] this browser has no action icon to set', err);
  }
}

// Grey is the default because most tabs are not Vinted, and colour is painted
// over it per tab. A tab that has never been activated or loaded since the
// worker came up is therefore grey, which is the right guess for a tab the
// extension has heard nothing about.
function paintDefault() {
  paintIcon(false);
}

function paintTab(tabId, url) {
  if (tabId == null) return;
  paintIcon(switchedOn && onVinted(url), tabId);
}

// Only the active tab's icon is ever on screen, so that is the one repaint that
// has to happen now; every other tab gets its own when it is activated.
async function paintActiveTab() {
  try {
    const [tab] = await ext.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) paintTab(tab.id, tab.url);
  } catch (err) {
    console.debug('[Bumpline] could not read the active tab', err);
  }
}

// The worker is torn down between events and the browser forgets a set icon at
// the end of a session, so the switch is read on the way up rather than
// remembered. Absent means on, the same rule the popup and the page use.
async function paintIconFromStore() {
  try {
    const bag = await ext.storage.local.get(ENABLED_KEY);
    switchedOn = bag[ENABLED_KEY] !== false;
  } catch (_) {
    switchedOn = true;
  }
  paintDefault();
  await paintActiveTab();
}

paintIconFromStore();
ext.runtime.onStartup.addListener(paintIconFromStore);

// The switch is thrown in the popup, which writes it here. Storage is what the
// content scripts already listen to, so the icon follows the same signal rather
// than needing a message of its own.
ext.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[ENABLED_KEY]) return;
  switchedOn = changes[ENABLED_KEY].newValue !== false;
  paintDefault();
  paintActiveTab();
});

// Neither of these needs the "tabs" permission. The events fire either way; the
// url is what is withheld without one, and a withheld url is a tab the
// extension cannot work on — which is the same grey icon as a tab it will not
// work on. The two cases do not have to be told apart.
ext.tabs.onActivated.addListener(({ tabId }) => {
  Promise.resolve(ext.tabs.get(tabId))
    .then(tab => paintTab(tabId, tab && tab.url))
    .catch(() => paintTab(tabId, null));
});

ext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // A navigation, or the load finishing. Everything else a tab reports — a
  // title, a favicon, a mute — cannot have changed the answer.
  if (!changeInfo.url && changeInfo.status !== 'complete') return;
  paintTab(tabId, tab && tab.url);
});

// Installed from the store the extension draws nothing anywhere until you are
// on your own Vinted wardrobe, so a new user sees an empty toolbar and assumes
// it is broken. Opening the welcome page once answers where the icon went and
// where the buttons appear. An update is not a first impression, so it passes.
ext.runtime.onInstalled.addListener(details => {
  if (details.reason !== 'install') return;
  ext.tabs.create({ url: ext.runtime.getURL('welcome/index.html') });
});
