// Bumpline — the extension's own log, for reports.
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

// What Bumpline writes to the console is the most useful part of a bug
// report, and the part a seller can least be asked to copy by hand. This keeps
// the newest lines in storage.local, on the device only, cleaned before they
// are stored: no links, no item numbers, no emails, no access tokens. The
// popup puts them in the link to the website's report form, after the #, and
// they leave the device only if the person sends that form.
//
// The cleaning rules are the website's (lib/report/clean.ts there); both
// repos test them against the same tests/clean-vectors.json.
//
// Loaded as a plain script ahead of the background, the content script and
// the panel, like broadcast.js, and it touches no browser API until record()
// or read() is called, so the tests can load it on its own.

const BumplineLog = (() => {
  const KEY = 'bumpline.log';
  // The last Vinted site the content script ran on, for the goodbye page.
  const LAST_SITE_KEY = 'bumpline.lastSite';
  const MAX_LINES = 200;
  const MAX_BYTES = 16 * 1024;
  const OBJECT_MAX = 300;
  const LANGS = ['en', 'it', 'fr'];

  const SCHEME_URL = /\b(?:https?|wss?):\/\/[^\s"'<>()[\]{}]+/gi;
  const HOST_PATH = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s"'<>()[\]{}]*/gi;
  const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g;
  const TOKEN_RUN = /[A-Za-z0-9+/_=-]{20,}/g;
  const LONG_NUMBER = /\d{5,}/g;
  const VINTED_HOST = /^www\.(vinted\.(?:[a-z]{2}|com|co\.uk|com\.au))$/;

  function clean(line) {
    return String(line)
      .replace(SCHEME_URL, '[link]')
      .replace(HOST_PATH, '[link]')
      .replace(EMAIL, '[email]')
      .replace(JWT, '[token]')
      .replace(TOKEN_RUN, run => (/\d/.test(run) && /[A-Za-z]/.test(run) ? '[token]' : run))
      .replace(LONG_NUMBER, '[id]');
  }

  const two = n => String(n).padStart(2, '0');

  function describe(part) {
    if (part instanceof Error) return `${part.name}: ${part.message}`;
    if (typeof part === 'string') return part;
    if (part === null || typeof part !== 'object') return String(part);
    try {
      return JSON.stringify(part).slice(0, OBJECT_MAX);
    } catch (_) {
      return Object.prototype.toString.call(part);
    }
  }

  function format(parts, now = new Date()) {
    const time = `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
    return clean(`${time} ${parts.map(describe).join(' ')}`);
  }

  const bytes = text => new TextEncoder().encode(text).length;

  function append(lines, line) {
    const kept = [...lines, line].slice(-MAX_LINES);
    let total = kept.reduce((sum, l) => sum + bytes(l) + 1, 0);
    while (total > MAX_BYTES && kept.length) total -= bytes(kept.shift()) + 1;
    return kept;
  }

  function encode(lines) {
    const utf8 = new TextEncoder().encode(JSON.stringify(lines));
    let binary = '';
    for (const byte of utf8) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function siteOf(hostname) {
    const match = VINTED_HOST.exec(hostname || '');
    return match ? match[1] : null;
  }

  // Everything goes after the #, which the browser never sends to a server:
  // opening the page tells the website nothing about the add-on. Firefox
  // counts the version and the like as technical data, which may only leave
  // with the user's consent, and here that consent is the seller pressing the
  // form's send button. The page reads the fragment and sends it only then.
  function fragment(entries) {
    return entries
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
  }

  function reportUrl(base, { lang, version, site, lines }) {
    const language = LANGS.includes(lang) ? lang : 'en';
    const log = lines && lines.length ? encode(lines) : '';
    return `${base}/${language}/report/#${fragment([
      ['from', 'popup'], ['v', version], ['site', site], ['log', log],
    ])}`;
  }

  function goodbyeUrl(base, version, site) {
    return `${base}/goodbye/#${fragment([['v', version], ['site', site]])}`;
  }

  async function read(storage) {
    try {
      const bag = await storage.get(KEY);
      return Array.isArray(bag[KEY]) ? bag[KEY].filter(l => typeof l === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  // Each write reads the log, adds a line and writes it back, so two writes
  // from the same script would lose one of the lines if they overlapped: they
  // wait their turn. Another tab writing at the same moment can still cost a
  // line, which a log for bug reports can afford.
  let queue = Promise.resolve();

  // A log that cannot be written is not worth breaking a relist over.
  function record(storage, parts) {
    // The time is taken now, not when the line's turn comes.
    const line = format(parts);
    queue = queue.then(async () => {
      try {
        await storage.set({ [KEY]: append(await read(storage), line) });
      } catch (_) {
        // Nothing to do: the console still has the line.
      }
    });
    return queue;
  }

  return {
    KEY, LAST_SITE_KEY, MAX_LINES, MAX_BYTES,
    clean, format, append, encode, siteOf, reportUrl, goodbyeUrl, record, read,
  };
})();
