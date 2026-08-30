// Bumpline — where this copy came from, and where a rating would go.
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

// One package ships to both stores, so a link to the listing cannot be written
// at build time; it has to be worked out in the browser that is running. Two
// pages ask the same question — the toolbar panel and the page shown once after
// install — and a store id that lives in two files is a store id that will one
// day be corrected in one of them. It lives here instead.
//
// Loaded as a plain script before the page's own, which is all an extension
// page needs: no modules, no bundler, and a top-level const is reachable from
// every script that follows it.

const BumplineStore = (() => {
  // Firefox answers to `browser` and Chrome to `chrome`; only the namespace is
  // in question here, not the promises, so either will do.
  const ext = globalThis.browser ?? globalThis.chrome;

  // The 32-letter id in the Chrome Web Store listing URL.
  const CHROME_STORE_ID = 'bckdngndomabedcpciejiojhjfheolkn';

  // AMO's slug, which is the last path segment of the listing it gives the
  // add-on on the first submission — addons.mozilla.org/…/addon/<this>/ —
  // derived from the add-on's name. It is not the gecko id in build.mjs, which
  // identifies the installed add-on rather than a page on the site. Empty until
  // there is a listing to point at: a link to a page that does not exist is
  // worse than no link, so whatever asks for it hides itself instead.
  const FIREFOX_ADDON_ID = 'bumpline-relist-for-vinted';

  // The extension's own origin, which is the one thing a browser cannot get
  // wrong about its own extension: Firefox serves these pages from
  // moz-extension:// and every Chromium browser — Chrome, Edge, Brave, Opera,
  // Vivaldi — from chrome-extension://. The user agent is the fallback and not
  // the test, because Edge and Opera both write "Chrome" into theirs.
  function isFirefox() {
    try {
      const origin = ext.runtime.getURL('');
      if (origin.startsWith('moz-extension://')) return true;
      if (origin.startsWith('chrome-extension://')) return false;
    } catch (_) {
      // getURL exists in every browser these pages run in; the guard is for the
      // one that does not, where the agent string is all that is left.
    }
    return navigator.userAgent.includes('Firefox/');
  }

  // Both addresses land on the reviews tab rather than the top of the listing,
  // so the link arrives where its label says it will. Null means this browser's
  // store has no listing yet.
  function reviewUrl() {
    if (isFirefox()) {
      return FIREFOX_ADDON_ID
        ? 'https://addons.mozilla.org/firefox/addon/' + FIREFOX_ADDON_ID + '/reviews/'
        : null;
    }
    return 'https://chromewebstore.google.com/detail/' + CHROME_STORE_ID + '/reviews';
  }

  return { isFirefox, reviewUrl };
})();
