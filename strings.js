// Bumpline — the words, in every language the extension speaks.
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

// Chrome's own i18n reads the browser's UI language and nothing else, so an
// Italian seller running Chrome in English would have no way back. The words
// live here instead, both languages at once, and the seller can overrule the
// browser from the panel.
//
// Held in memory rather than fetched, because the buttons are drawn the moment
// a wardrobe page settles: a catalogue that arrives after them would be a
// second, English paint that every seller sees. Loaded as a plain script before
// the page's own, the same way store.js is, which is all an extension page or a
// content script needs.

const BumplineText = (() => {
  const CATALOG = {
    en: {
      'button.relist': 'Relist',
      'button.draft': 'Relist as draft',
    },
    it: {
      'button.relist': 'Ripubblica',
      'button.draft': 'Ripubblica come bozza',
    },
  };

  // The language the words are written in when nothing else can be worked out,
  // and the one every missing key falls back to.
  const BASE = 'en';

  // What the browser says, cut to the part that names a language: it-IT and
  // it-CH are both it, and a language with no catalogue is not a failure — it
  // is a seller who reads English.
  function fromBrowser() {
    const tag = (navigator.language || BASE).toLowerCase();
    const lang = tag.split('-')[0];
    return lang in CATALOG ? lang : BASE;
  }

  let active = fromBrowser();

  // 'auto' is a stored value, not a language: it means "ask the browser again".
  function use(lang) {
    active = lang && lang !== 'auto' && lang in CATALOG ? lang : fromBrowser();
  }

  function locale() {
    return active;
  }

  // A key missing from the active language is a translation that has not been
  // written yet, and English is a better answer than a blank button. A key
  // missing from English too is a mistake in the code; returning the key makes
  // it loud in testing and leaves something readable on screen if it ever ships.
  function t(key, ...subs) {
    const line = CATALOG[active][key] ?? CATALOG[BASE][key] ?? key;
    return subs.length
      ? line.replace(/\{(\d+)\}/g, (whole, index) => {
          const sub = subs[Number(index)];
          return sub === undefined ? whole : String(sub);
        })
      : line;
  }

  // The two extension pages are HTML, so their words are attributes on the
  // markup rather than calls in a script: data-i18n for the text, and one
  // attribute each for the two places a string is read out but not shown.
  function paint(root = document) {
    for (const node of root.querySelectorAll('[data-i18n]')) {
      node.textContent = t(node.dataset.i18n);
    }
    for (const node of root.querySelectorAll('[data-i18n-title]')) {
      node.title = t(node.dataset.i18nTitle);
    }
    for (const node of root.querySelectorAll('[data-i18n-label]')) {
      node.setAttribute('aria-label', t(node.dataset.i18nLabel));
    }
    // Screen readers and spell-checkers both go by this, and it is wrong the
    // moment the seller overrules the browser.
    if (root === document) document.documentElement.lang = active;
  }

  return { CATALOG, t, use, locale, paint };
})();
