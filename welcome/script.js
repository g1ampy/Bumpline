// Bumpline — the page shown once after install.
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

// Firefox answers to `browser` and only that namespace returns promises there;
// Chrome answers to `chrome`. One alias, and the rest of the file is written
// once for both.
const ext = globalThis.browser ?? globalThis.chrome;

// The catalogue is in memory and has already read the browser's language, so
// the page can be painted now, synchronously, on the first script tick — which
// is the same shape content.js uses, and for the same reason: waiting on
// storage first would mean an await, and an await cannot promise to land before
// the first frame. The seller whose browser language is right — nearly all of
// them — therefore never sees English at all.
BumplineText.paint();

// The version, so a bug report can say which build the reader is looking at.
// A hand-built debug package sets version_name; a store one has none and falls
// back to the plain version. It is BumplineText.t() rather than a data-i18n
// attribute, so it is written here and again in the repaint below.
const build = ext.runtime.getManifest();
const paintVersion = () => {
  document.getElementById('version').textContent =
    BumplineText.t('welcome.version', build.version_name || build.version);
};
paintVersion();

// Only now the stored override, which is the case the paint above cannot cover:
// a seller reading Italian in a browser somebody else set up in English. If it
// names the language the page is already in — the ordinary case, including
// 'auto' — nothing is repainted and nothing flickers.
(async () => {
  let lang = 'auto';
  try {
    const bag = await ext.storage.local.get('bumpline:lang');
    lang = bag['bumpline:lang'] || 'auto';
  } catch (_) {
    // An unreadable storage leaves the browser's language, which is the default.
  }
  const before = BumplineText.locale();
  BumplineText.use(lang);
  if (BumplineText.locale() !== before) {
    BumplineText.paint();
    paintVersion();
  }

  // Where a rating would go, which depends on the store this copy came from:
  // store.js works that out, and returns null when that store has no listing
  // yet. The whole card goes with the link rather than the link alone — a
  // heading asking for a rating above nothing to click is worse than not
  // asking. The card's own title and note are already painted above, via
  // their data-i18n attributes; only the link's destination is set here.
  const review = document.getElementById('review');
  const url = BumplineStore.reviewUrl();

  if (url) {
    review.href = url;
    document.getElementById('rate').hidden = false;
  }
})();
