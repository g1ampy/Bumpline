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
// it carries the one state worth knowing from outside: colour while it is
// working, grey while the switch is off. Same drawing, luma only.
const ENABLED_KEY = 'bumpline:enabled';

const ACTION_ICONS = {
  on: { 16: 'icons/icon16.png', 24: 'icons/icon24.png', 32: 'icons/icon32.png' },
  off: { 16: 'icons/off16.png', 24: 'icons/off24.png', 32: 'icons/off32.png' },
};

function paintIcon(on) {
  // Chrome returns promises here and Firefox returns them from a different
  // object; neither failure is worth taking the worker down for, and an icon
  // that did not repaint is not a reason to stop watching request headers.
  const action = ext.action || ext.browserAction;
  if (!action) return;
  try {
    Promise.resolve(action.setIcon({ path: on ? ACTION_ICONS.on : ACTION_ICONS.off }))
      .catch(() => {});
    Promise.resolve(action.setTitle({ title: on ? 'Bumpline' : 'Bumpline — off' }))
      .catch(() => {});
  } catch (_) {
    // An older browser without these methods keeps the manifest's icon.
  }
}

// The worker is torn down between events and the browser forgets a set icon at
// the end of a session, so the switch is read on the way up rather than
// remembered. Absent means on, the same rule the popup and the page use.
async function paintIconFromStore() {
  try {
    const bag = await ext.storage.local.get(ENABLED_KEY);
    paintIcon(bag[ENABLED_KEY] !== false);
  } catch (_) {
    paintIcon(true);
  }
}

paintIconFromStore();
ext.runtime.onStartup.addListener(paintIconFromStore);

// The switch is thrown in the popup, which writes it here. Storage is what the
// content scripts already listen to, so the icon follows the same signal rather
// than needing a message of its own.
ext.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[ENABLED_KEY]) return;
  paintIcon(changes[ENABLED_KEY].newValue !== false);
});

// Installed from the store the extension draws nothing anywhere until you are
// on your own Vinted wardrobe, so a new user sees an empty toolbar and assumes
// it is broken. Opening the welcome page once answers where the icon went and
// where the buttons appear. An update is not a first impression, so it passes.
ext.runtime.onInstalled.addListener(details => {
  if (details.reason !== 'install') return;
  ext.tabs.create({ url: ext.runtime.getURL('welcome/index.html') });
});
