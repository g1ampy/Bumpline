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

  function reportUrl(base, { lang, version, site, lines }) {
    const language = LANGS.includes(lang) ? lang : 'en';
    let url = `${base}/${language}/report/?from=popup&v=${encodeURIComponent(version)}`;
    if (site) url += `&site=${encodeURIComponent(site)}`;
    if (lines && lines.length) url += `#log=${encode(lines)}`;
    return url;
  }

  function goodbyeUrl(base, version, site) {
    let url = `${base}/goodbye/?v=${encodeURIComponent(version)}`;
    if (site) url += `&site=${encodeURIComponent(site)}`;
    return url;
  }

  async function read(storage) {
    try {
      const bag = await storage.get(KEY);
      return Array.isArray(bag[KEY]) ? bag[KEY].filter(l => typeof l === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  // A log that cannot be written is not worth breaking a relist over.
  async function record(storage, parts) {
    try {
      const lines = append(await read(storage), format(parts));
      await storage.set({ [KEY]: lines });
    } catch (_) {
      // Nothing to do: the console still has the line.
    }
  }

  return {
    KEY, MAX_LINES, MAX_BYTES,
    clean, format, append, encode, siteOf, reportUrl, goodbyeUrl, record, read,
  };
})();
