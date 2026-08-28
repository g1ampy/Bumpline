// Bumpline — toolbar popup.
//
// Installed from the store the extension is otherwise invisible: it works only
// inside a Vinted profile page, so a new user sees nothing anywhere and assumes
// it is broken. The popup answers two questions and refuses to grow past them —
// "does it work on this tab?" and "did a relist get stuck?" — and always offers
// the one action that follows from the answer.

const STORE_PREFIX = 'bumpline:pending:';
const LAST_PROFILE_KEY = 'bumpline:lastProfile';
const RELOAD_KEY = 'bumpline:reloadAfterRelist';

// vinted.it, vinted.com, vinted.co.uk … one domain per country.
const VINTED_HOST = /(^|\.)vinted\.[a-z]{2,3}(\.[a-z]{2})?$/i;

// Lucide paths. Stroke, width and colour come from the .icon rule, so the two
// glyphs stay the same weight as each other.
const GLYPH = {
  ready: ['M22 11.1V12a10 10 0 1 1-5.93-9.14', 'm9 11 3 3L22 4'],
  elsewhere: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 16v-4', 'M12 8h.01'],
};

function draw(svg, paths) {
  svg.textContent = '';
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
}

// The url is only handed over for tabs the extension holds a host permission
// for, which is exactly the Vinted domains. Anywhere else it is undefined, and
// that already answers the question.
function currentUrl(tab) {
  if (!tab || !tab.url) return null;
  try {
    return new URL(tab.url);
  } catch (_) {
    return null;
  }
}

const onVinted = url => !!url && VINTED_HOST.test(url.hostname);

// Asks the page what it actually rendered. Somebody else's wardrobe has the
// same URL shape as your own, so the URL alone can never answer this; only the
// content script knows whether it managed to attach any buttons. No reply means
// no content script, which is an answer too.
async function askPage(tab) {
  if (!tab || tab.id == null) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'bumpline:pageState' });
  } catch (_) {
    return null;
  }
}

function describePage(page, url) {
  if (page) {
    if (page.relistable > 0) {
      return {
        tone: 'ok',
        glyph: GLYPH.ready,
        title: 'Ready on this page',
        detail:
          page.relistable === 1
            ? 'One item can be relisted, under its Bump button.'
            : `${page.relistable} items can be relisted, under their Bump buttons.`,
      };
    }
    return {
      tone: 'plain',
      glyph: GLYPH.elsewhere,
      title: 'Nothing to relist here',
      detail:
        'Buttons appear only on your own items that are still on sale — not on ' +
        'someone else’s wardrobe, and not on sold or reserved items.',
    };
  }
  if (onVinted(url)) {
    return {
      tone: 'plain',
      glyph: GLYPH.elsewhere,
      title: 'Not a profile page',
      detail: 'The buttons only appear on your own wardrobe.',
    };
  }
  return {
    tone: 'plain',
    glyph: GLYPH.elsewhere,
    title: 'Not on Vinted',
    detail: 'Open your profile page to relist an item.',
  };
}

async function readStored() {
  let bag;
  try {
    bag = await chrome.storage.local.get(null);
  } catch (_) {
    return { pending: [], lastProfile: null, reload: true };
  }

  const pending = [];
  for (const key of Object.keys(bag || {})) {
    if (!key.startsWith(STORE_PREFIX)) continue;
    const record = bag[key];
    if (record && typeof record === 'object') pending.push(record);
  }
  pending.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

  return {
    pending,
    lastProfile: bag[LAST_PROFILE_KEY] || null,
    reload: bag[RELOAD_KEY] !== false, // absent means on, as it always was
  };
}

const nameOf = record =>
  (record.snapshot && record.snapshot.title) || `Item ${record.itemId || '?'}`;

// Records written before 1.0.0 carry no profileUrl; the country domain is the
// best guess left, and it at least lands on the right site.
const profileOf = record => record.profileUrl || record.site || null;

function renderPending(records) {
  const box = document.getElementById('pending');
  if (!records.length) {
    box.hidden = true;
    return;
  }

  document.getElementById('pending-title').textContent =
    records.length === 1
      ? '1 relist has not finished'
      : `${records.length} relists have not finished`;

  // A long list would push the answer off screen; four names are enough to
  // recognise what is stuck.
  const list = document.getElementById('pending-list');
  list.textContent = '';
  for (const record of records.slice(0, 4)) {
    const row = document.createElement('li');
    row.textContent = nameOf(record);
    // The refusal is the only part of a stuck relist a person can act on, or
    // pass to a bug report, so it belongs next to the name and not in a log.
    if (record.lastError) {
      const why = document.createElement('span');
      why.className = 'card__why';
      why.textContent = record.lastError;
      row.appendChild(why);
    }
    list.appendChild(row);
  }
  if (records.length > 4) {
    const rest = document.createElement('li');
    rest.textContent = `and ${records.length - 4} more`;
    list.appendChild(rest);
  }

  box.hidden = false;
}

// One action at most, and only when it does something the current tab does not
// already do. A button that leads nowhere is worse than no button.
function chooseAction({ pending, lastProfile }, page, here) {
  const stuck = pending.length ? profileOf(pending[0]) : null;
  if (stuck && stuck !== here) {
    return { label: 'Open the profile page', url: stuck };
  }
  // A wardrobe with buttons on it is already the destination.
  if (!(page && page.relistable > 0) && lastProfile && lastProfile !== here) {
    return { label: 'Open your Vinted profile', url: lastProfile };
  }
  return null;
}

// The page reads this fresh on every relist, so writing it here is all the
// wiring the setting needs.
function wireReloadToggle(on) {
  const box = document.getElementById('reload-toggle');
  box.checked = on;
  box.addEventListener('change', () => {
    chrome.storage.local.set({ [RELOAD_KEY]: box.checked }).catch(() => {
      // Put the control back where it was rather than lying about the state.
      box.checked = !box.checked;
    });
  });
}

async function main() {
  // version_name is what a hand-built debug package sets; without one this is
  // the plain version, exactly as before.
  const build = chrome.runtime.getManifest();
  document.getElementById('version').textContent = `v${build.version_name || build.version}`;

  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {
    // Leave tab null: the popup falls back to the generic advice, which is
    // never wrong, only less specific.
  }

  const url = currentUrl(tab);
  const [page, stored] = await Promise.all([askPage(tab), readStored()]);
  const here = url ? `${url.origin}${url.pathname}` : null;

  const state = describePage(page, url);
  draw(document.getElementById('status-icon'), state.glyph);
  document.getElementById('status-title').textContent = state.title;
  document.getElementById('status-detail').textContent = state.detail;
  if (state.tone !== 'plain') {
    document.getElementById('status').classList.add(`card--${state.tone}`);
  }

  renderPending(stored.pending);
  wireReloadToggle(stored.reload);

  const action = chooseAction(stored, page, here);
  if (action) {
    const button = document.getElementById('action');
    button.textContent = action.label;
    button.hidden = false;
    button.addEventListener('click', () => {
      chrome.tabs.create({ url: action.url });
      window.close();
    });
  }
}

main();
