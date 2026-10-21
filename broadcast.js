// Bumpline — notices from the website.
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

// When Vinted changes something and relisting breaks, a release takes days to
// get through store review, and a GitHub issue reaches nobody who is not
// already looking. The website carries a small file of notices instead, and
// this is what reads it: which notices are well-formed, which apply to this
// browser, this version and the panel's language, and which one decides the
// badge on the toolbar icon.
//
// Shared by the background, which fetches the file and paints the badge, and
// the panel, which draws the notices. Loaded as a plain script ahead of either,
// like strings.js and store.js, and it touches no browser API until here() is
// called, so the tests can load it on its own.

const BumplineBroadcast = (() => {
  const FILE_URL = 'https://bumpline.giampy.tech/broadcast.json';

  const NOTICES_KEY = 'bumpline:broadcast';
  const DISMISSED_KEY = 'bumpline:broadcastDismissed';
  const CHECKED_KEY = 'bumpline:broadcastCheckedAt';

  // Often enough that a notice about something broken is seen the same
  // morning, rarely enough that the website hears from each browser about as
  // often as from a person who keeps it open in a tab.
  const CHECK_EVERY_MS = 60 * 60 * 1000;

  // The badge takes a hex colour, not the oklch the panel is written in. Both
  // are the strip colours taken dark enough for the white "!" to read at 5:1.
  const BADGE = { warning: '#d2001e', attention: '#a75c00' };

  // In rising order of alarm: the index is the rank.
  const LEVELS = ['info', 'attention', 'warning'];
  const BROWSERS = ['chrome', 'firefox'];
  // The catalogue's languages, and the same list the website's own check of
  // the file holds. A language added to strings.js is added here too.
  const LANGUAGES = ['en', 'it', 'fr'];
  const VERSION = /^\d+(\.\d+)*$/;
  const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;
  // A date-time has to say which zone it is in. Without one, browsers read it
  // as local time, and they disagree on most other shapes Date.parse accepts.
  const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

  const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);
  const filled = value => typeof value === 'string' && value.trim() !== '';
  const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function isHttps(value) {
    try {
      return new URL(value).protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  // 2026-02-30 is a real string and no real day; Date would roll it over into
  // March without a word.
  function onCalendar(day) {
    const [year, month, date] = day.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, date));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === date;
  }

  // Only the two ISO shapes, read the same way by every browser. A date on its
  // own means the whole of that day, wherever the seller is, so it ends at its
  // last millisecond in UTC rather than at its first.
  function endOf(until) {
    if (typeof until !== 'string') return NaN;
    if (BARE_DATE.test(until)) return onCalendar(until) ? Date.parse(until + 'T23:59:59.999Z') : NaN;
    const timed = until.match(DATE_TIME);
    return timed && onCalendar(timed[1]) ? Date.parse(until) : NaN;
  }

  // Null for a text map with anything wrong in what this version can read. A
  // language it does not speak is passed over rather than counted against the
  // notice: the file will learn languages after this install was made, and the
  // English, Italian and French beside them are still for this seller. A link
  // that is not https is wrong rather than dropped: a notice that lost the link
  // it was written around would point at nothing while reading as though it
  // did.
  function readText(text) {
    if (!isObject(text)) return null;
    const out = {};
    for (const [lang, entry] of Object.entries(text)) {
      if (!LANGUAGES.includes(lang)) continue;
      if (!isObject(entry)) return null;
      if (!filled(entry.title) || !filled(entry.body)) return null;
      if (entry.link !== undefined && !(typeof entry.link === 'string' && isHttps(entry.link))) return null;
      out[lang] = { title: entry.title, body: entry.body, link: entry.link === undefined ? null : entry.link };
    }
    return Object.keys(out).length ? out : null;
  }

  function readNotice(raw) {
    if (!isObject(raw) || !filled(raw.id) || !LEVELS.includes(raw.level)) return null;

    // The same for browsers: a name this version does not know is one it is
    // not, and a list left with none it knows is a notice for someone else.
    let browsers = null;
    if (raw.browsers !== undefined) {
      if (!Array.isArray(raw.browsers)) return null;
      browsers = raw.browsers.filter(name => BROWSERS.includes(name));
      if (!browsers.length) return null;
    }

    let from = null;
    let below = null;
    if (raw.versions !== undefined) {
      const range = raw.versions;
      if (!isObject(range) || Object.keys(range).some(key => key !== 'from' && key !== 'below')) return null;
      for (const key of ['from', 'below']) {
        if (range[key] !== undefined && !(typeof range[key] === 'string' && VERSION.test(range[key]))) return null;
      }
      from = range.from ?? null;
      below = range.below ?? null;
    }

    let until = null;
    if (raw.until !== undefined) {
      until = endOf(raw.until);
      if (Number.isNaN(until)) return null;
    }

    const text = readText(raw.text);
    if (!text) return null;

    return { id: raw.id, level: raw.level, browsers, from, below, until, text };
  }

  // Null when this is not a notice file at all — a challenge page, an error
  // page, a file someone emptied by mistake — so the caller keeps what it had.
  // A notice that is wrong is dropped on its own and takes nothing else with
  // it, and so is a second notice under an id already used.
  function parse(data) {
    if (!isObject(data) || !Array.isArray(data.messages)) return null;
    const seen = new Set();
    const notices = [];
    for (const raw of data.messages) {
      const notice = readNotice(raw);
      if (!notice || seen.has(notice.id)) continue;
      seen.add(notice.id);
      notices.push(notice);
    }
    return notices;
  }

  // Dotted numbers, part by part, a missing part counting as 0: 1.1.10 is
  // newer than 1.1.5, and 1.2 is 1.2.0.
  function compareVersions(a, b) {
    const left = String(a).split('.').map(Number);
    const right = String(b).split('.').map(Number);
    for (let at = 0; at < Math.max(left.length, right.length); at += 1) {
      const diff = (left[at] || 0) - (right[at] || 0);
      if (diff) return diff > 0 ? 1 : -1;
    }
    return 0;
  }

  // The notices this seller should see now, most alarming first and in file
  // order within a level, each in the panel's language. What is stored was
  // checked by parse() when it was fetched; the guards here are for a storage
  // someone edited by hand.
  function eligible(notices, { lang, family, version, now, dismissed }) {
    const closed = new Set(Array.isArray(dismissed) ? dismissed : []);
    return (Array.isArray(notices) ? notices : [])
      .map((notice, order) => ({ notice, order }))
      .filter(({ notice }) =>
        isObject(notice) && isObject(notice.text) && owns(notice.text, lang) &&
        !closed.has(notice.id) &&
        (!notice.browsers || notice.browsers.includes(family)) &&
        (notice.from == null || compareVersions(version, notice.from) >= 0) &&
        (notice.below == null || compareVersions(version, notice.below) < 0) &&
        (notice.until == null || now <= notice.until))
      .sort((a, b) =>
        LEVELS.indexOf(b.notice.level) - LEVELS.indexOf(a.notice.level) || a.order - b.order)
      .map(({ notice }) => ({ id: notice.id, level: notice.level, ...notice.text[lang] }));
  }

  // News is for whoever opens the panel; only the two levels that ask
  // something of the seller reach out to the icon.
  function badgeFor(shown) {
    const top = shown && shown[0];
    return top && (top.level === 'warning' || top.level === 'attention') ? top.level : null;
  }

  let inFlight = null;

  async function check({ fetch, get, set, now }) {
    const at = now();
    const last = (await get(CHECKED_KEY))[CHECKED_KEY];
    // A clock that went backwards would otherwise hold the next check off
    // until it caught up again.
    if (typeof last === 'number' && last <= at && at - last < CHECK_EVERY_MS) return false;

    // The attempt counts whether or not it gets an answer: a site that is down
    // is asked again in an hour, not on every tab the seller opens meanwhile.
    await set({ [CHECKED_KEY]: at });

    let notices;
    try {
      const reply = await fetch(FILE_URL);
      if (!reply.ok) return false;
      notices = parse(await reply.json());
    } catch (_) {
      return false;
    }
    if (!notices) return false;

    // Read after the answer, not before: a notice closed while the file was on
    // its way has to stay closed.
    const bag = await get([NOTICES_KEY, DISMISSED_KEY]);
    const dismissed = Array.isArray(bag[DISMISSED_KEY]) ? bag[DISMISSED_KEY] : [];
    const ids = new Set(notices.map(notice => notice.id));
    // A closed notice that has left the file has nothing left to hide.
    const kept = dismissed.filter(id => ids.has(id));

    // Only what changed is written. Firefox reports every key a write names,
    // changed or not, and an open panel redraws on each report, which would
    // have a screen reader announce a warning it has already read out.
    const changes = {};
    const fresh = JSON.stringify(notices) !== JSON.stringify(bag[NOTICES_KEY]);
    if (fresh) changes[NOTICES_KEY] = notices;
    if (kept.length !== dismissed.length) changes[DISMISSED_KEY] = kept;
    if (Object.keys(changes).length) await set(changes);
    return fresh;
  }

  // Resolves true when a new file was stored. Every event the background wakes
  // for calls this, so two can start in the same moment; they share one
  // request rather than racing to write the same keys.
  function refresh(deps) {
    if (!inFlight) inFlight = check(deps).finally(() => { inFlight = null; });
    return inFlight;
  }

  // What eligible() needs to know about this browser right now. The panel's
  // language rather than the browser's, so a seller who picked Italian over
  // an English browser reads Italian notices; the family from the extension's
  // own origin, which store.js already reads.
  function here(dismissed) {
    const ext = globalThis.browser ?? globalThis.chrome;
    return {
      lang: BumplineText.locale().split('-')[0],
      family: BumplineStore.isFirefox() ? 'firefox' : 'chrome',
      version: ext.runtime.getManifest().version,
      now: Date.now(),
      dismissed: Array.isArray(dismissed) ? dismissed : [],
    };
  }

  return {
    FILE_URL, NOTICES_KEY, DISMISSED_KEY, CHECKED_KEY, CHECK_EVERY_MS, BADGE,
    parse, compareVersions, eligible, badgeFor, refresh, here,
  };
})();
