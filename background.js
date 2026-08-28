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

// The service worker exists for two jobs the page cannot do on its own:
//
//   1. Watch the requests Vinted's own site makes and note the security tokens
//      it attaches, so the extension can send requests Vinted will accept.
//   2. Fetch image bytes from the CDN when a cross-origin read from the page is
//      refused.

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

  chrome.storage.local
    .set({ [TOKEN_KEYS.csrf]: seen.csrf, [TOKEN_KEYS.anon]: seen.anon })
    .catch(() => {
      // Losing the cached copy is survivable: the page can still parse the
      // token out of the markup.
    });
}

chrome.webRequest.onBeforeSendHeaders.addListener(
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
    const stored = await chrome.storage.local.get([TOKEN_KEYS.csrf, TOKEN_KEYS.anon]);
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

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
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
