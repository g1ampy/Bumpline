// Bumpline — toolbar popup.
//
// Installed from the store the extension is otherwise invisible: it works only
// inside a Vinted profile page, so a new user sees nothing anywhere and assumes
// it is broken. The popup answers two questions and refuses to grow past them —
// "does it work on this tab?" and "did a relist get stuck?" — and always offers
// the one action that follows from the answer.

const STORE_PREFIX = 'bumpline:pending:';
const LAST_PROFILE_KEY = 'bumpline:lastProfile';

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

const isProfilePage = url =>
  !!url && VINTED_HOST.test(url.hostname) && url.pathname.startsWith('/member/');

function describeTab(url) {
  if (isProfilePage(url)) {
    return {
      tone: 'ok',
      glyph: GLYPH.ready,
      title: 'Ready on this page',
      detail: 'Relist and Relist as draft sit under each item’s Bump button.',
    };
  }
  if (url && VINTED_HOST.test(url.hostname)) {
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
    return { pending: [], lastProfile: null };
  }

  const pending = [];
  for (const key of Object.keys(bag || {})) {
    if (!key.startsWith(STORE_PREFIX)) continue;
    const record = bag[key];
    if (record && typeof record === 'object') pending.push(record);
  }
  pending.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

  return { pending, lastProfile: bag[LAST_PROFILE_KEY] || null };
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
function chooseAction({ pending, lastProfile }, url) {
  const stuck = pending.length ? profileOf(pending[0]) : null;
  if (stuck && stuck !== `${url ? url.origin + url.pathname : ''}`) {
    return { label: 'Open the profile page', url: stuck };
  }
  if (!isProfilePage(url) && lastProfile) {
    return { label: 'Open your Vinted profile', url: lastProfile };
  }
  return null;
}

async function main() {
  document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;

  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {
    // Leave tab null: the popup falls back to the generic advice, which is
    // never wrong, only less specific.
  }

  const url = currentUrl(tab);
  const stored = await readStored();

  const state = describeTab(url);
  draw(document.getElementById('status-icon'), state.glyph);
  document.getElementById('status-title').textContent = state.title;
  document.getElementById('status-detail').textContent = state.detail;
  if (state.tone !== 'plain') {
    document.getElementById('status').classList.add(`card--${state.tone}`);
  }

  renderPending(stored.pending);

  const action = chooseAction(stored, url);
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
