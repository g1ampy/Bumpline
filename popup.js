// Bumpline — toolbar popup.
//
// Without this panel the extension is invisible outside the Vinted page: a new
// user installs it, sees nothing anywhere, and concludes it is broken. So the
// popup answers two questions and no others — "is it working here?" and "did a
// relist get stuck?".

const STORE_PREFIX = 'bumpline:pending:';

// vinted.it, vinted.com, vinted.co.uk … one domain per country.
const VINTED_HOST = /(^|\.)vinted\.[a-z]{2,3}(\.[a-z]{2})?$/i;

function currentUrl(tab) {
  // The url is only handed over for tabs the extension holds a host permission
  // for, which is exactly the set of Vinted domains. Anywhere else it is
  // undefined, and that already answers the question.
  if (!tab || !tab.url) return null;
  try {
    return new URL(tab.url);
  } catch (_) {
    return null;
  }
}

function describeTab(url) {
  if (!url || !VINTED_HOST.test(url.hostname)) {
    return {
      tone: 'todo',
      text: 'Open Vinted and go to your own profile page. The Relist buttons appear there, under each item.',
    };
  }
  if (!url.pathname.startsWith('/member/')) {
    return {
      tone: 'todo',
      text: 'You are on Vinted, but not on a profile page. Open your own wardrobe to see the Relist buttons.',
    };
  }
  return {
    tone: 'ok',
    text: 'Ready. On your own items the Relist and Relist as draft buttons sit under Vinted’s Booster button.',
  };
}

async function readPending() {
  let bag;
  try {
    bag = await chrome.storage.local.get(null);
  } catch (_) {
    return [];
  }
  const records = [];
  for (const key of Object.keys(bag || {})) {
    if (!key.startsWith(STORE_PREFIX)) continue;
    const record = bag[key];
    if (!record || typeof record !== 'object') continue;
    records.push(record);
  }
  records.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  return records;
}

function nameOf(record) {
  const title = record.snapshot && record.snapshot.title;
  return title || `Item ${record.itemId || '?'}`;
}

// Records written before 1.0.0 have no profileUrl; the site root is the best
// guess left, and it at least lands the user on the right country domain.
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

  const list = document.getElementById('pending-list');
  list.textContent = '';
  for (const record of records) {
    const row = document.createElement('li');
    row.textContent = nameOf(record);
    list.appendChild(row);
  }

  const open = document.getElementById('pending-open');
  const target = profileOf(records[0]);
  if (target) {
    open.addEventListener('click', () => {
      chrome.tabs.create({ url: target });
      window.close();
    });
  } else {
    open.hidden = true;
  }

  box.hidden = false;
}

async function main() {
  document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;

  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {
    // Leave tab null: the popup then shows the generic "open Vinted" advice,
    // which is never wrong.
  }

  const state = describeTab(currentUrl(tab));
  const status = document.getElementById('status');
  status.textContent = state.text;
  status.classList.add(`status--${state.tone}`);

  renderPending(await readPending());
}

main();
