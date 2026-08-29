// Bumpline — toolbar popup.
//
// Installed from the store the extension is otherwise invisible: it works only
// inside a Vinted profile page, so a new user sees nothing anywhere and assumes
// it is broken. The popup answers three questions and refuses to grow past them
// — "does it work on this tab?", "did a relist get stuck?" and "how much have I
// relisted lately?" — and always offers the one action that follows from the
// answer.

// Firefox answers to `browser` and only that namespace returns promises there;
// Chrome answers to `chrome`. One alias, and the rest of the file is written
// once for both.
const ext = globalThis.browser ?? globalThis.chrome;

const STORE_PREFIX = 'bumpline:pending:';
const LAST_PROFILE_KEY = 'bumpline:lastProfile';
const RELOAD_KEY = 'bumpline:reloadAfterRelist';
const PACE_KEY = 'bumpline:pace';
const HARD_COOLDOWN_KEY = 'bumpline:hardCooldown';
const LOCAL_DRAFTS_KEY = 'bumpline:localDrafts';
const RELIST_LOG_KEY = 'bumpline:relistLog';
const BLOCK_KEY = 'bumpline:blockedUntil';

// These have to agree with content.js, which is the side that enforces them.
// The popup only reports, sets, and — for the pause — lifts.
const HOUR_WINDOW_MS = 60 * 60 * 1000;
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOUR_ALARM_AT = 8;
const DAY_ALARM_AT = 40;
const HARD_COOLDOWN_MS = 10000;

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
    return await ext.tabs.sendMessage(tab.id, { type: 'bumpline:pageState' });
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

// Timestamps of the relists still inside the day. The content script prunes as
// it writes; the popup prunes as it reads, because it may be opened long after
// the last relist.
function recentRelists(log) {
  if (!Array.isArray(log)) return [];
  const cutoff = Date.now() - DAY_WINDOW_MS;
  return log.filter(at => typeof at === 'number' && at > cutoff);
}

const countWithin = (log, window) => {
  const cutoff = Date.now() - window;
  return log.filter(at => at > cutoff).length;
};

const clockOf = at =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// A refusal is measured in hours, a restriction in days, and "until 23:59"
// with no date is a lie about the second kind.
const whenOf = at => {
  const when = new Date(at);
  if (when.toDateString() === new Date().toDateString()) return clockOf(at);
  return when.toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// A pause that has already run out is no pause at all.
function standingPause(record) {
  if (!record || typeof record !== 'object') return null;
  return record.until > Date.now() ? record : null;
}

async function readStored() {
  let bag;
  try {
    bag = await ext.storage.local.get(null);
  } catch (_) {
    bag = null;
  }
  bag = bag || {};

  const pending = [];
  for (const key of Object.keys(bag)) {
    if (!key.startsWith(STORE_PREFIX)) continue;
    const record = bag[key];
    if (record && typeof record === 'object') pending.push(record);
  }
  pending.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

  return {
    pending,
    lastProfile: bag[LAST_PROFILE_KEY] || null,
    // Absent means on, as it always was; the same rule now covers the two
    // settings added in 1.0.1 that also default to on.
    reload: bag[RELOAD_KEY] !== false,
    cooldown: bag[HARD_COOLDOWN_KEY] !== false,
    localDrafts: bag[LOCAL_DRAFTS_KEY] !== false,
    fast: bag[PACE_KEY] === 'fast',
    relists: recentRelists(bag[RELIST_LOG_KEY]),
    paused: standingPause(bag[BLOCK_KEY]),
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

  // Where the copy is depends on how the relist was started, and telling
  // someone to look in their Vinted drafts when there is nothing there is worse
  // than saying nothing. A record that reached the draft stage carries its id.
  const onVintedToo = records.some(record => record.draft && record.draft.id);
  document.getElementById('pending-note').textContent =
    'Publishing is retried each time you open a Vinted profile page. ' +
    (onVintedToo
      ? 'The copy is also in your Vinted drafts, ready to publish by hand.'
      : 'The copy — details and photos — is saved on this device until it goes ' +
        'through, and the banner on the page can download it.');

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

// Vinted has said stop, and the extension has stood down until it is worth
// asking again. Lifting that early is the seller's call, but it is a deliberate
// one and it goes through the same warning as the risky settings.
function renderPause(stored) {
  const card = document.getElementById('paused');
  if (!stored.paused) {
    card.hidden = true;
    return;
  }

  // Vinted's own restriction is not the extension standing down: there is
  // nothing to lift, because the refusal would come from Vinted either way.
  const fromVinted = stored.paused.source === 'vinted';
  const lift = document.getElementById('paused-lift');

  document.getElementById('paused-title').textContent = fromVinted
    ? 'Vinted has restricted this account'
    : 'Relisting is paused';

  document.getElementById('paused-detail').textContent = fromVinted
    ? `${stored.paused.why} It runs to ${whenOf(stored.paused.until)}. Nothing ` +
      'can be listed or edited until then, through Bumpline or by hand, so the ' +
      'buttons stay off until it lifts.'
    : `${stored.paused.why} Nothing will be sent to Vinted until ` +
      `${whenOf(stored.paused.until)}, on any tab. The buttons come back by ` +
      'themselves — there is nothing to do but wait, and waiting is the point.';

  lift.hidden = fromVinted;
  card.hidden = false;
  if (fromVinted) return;

  document.getElementById('paused-lift').addEventListener('click', async () => {
    const agreed = await askRisk({
      title: 'Vinted asked for this pause',
      detail:
        'The pause is there because Vinted refused a request and refusing ' +
        'again is what turns a rate limit into a block on the account. Lift it ' +
        'only if you are sure the refusal was something else — being logged ' +
        'out, or a one-off network failure. Relisting straight back into a ' +
        'live rate limit is the surest way to lose the account for a day.',
      accept: 'Lift it anyway',
    });
    if (!agreed) return;
    try {
      await ext.storage.local.remove(BLOCK_KEY);
      card.hidden = true;
    } catch (_) {
      // The card stays up, which is the honest outcome: nothing was lifted.
    }
  });
}

// The numbers Vinted is actually watching, which are the ones the seller cannot
// get from the page. Said plainly, and coloured only once they matter.
function renderVolume({ relists, cooldown }) {
  const card = document.getElementById('volume');
  const detail = document.getElementById('volume-detail');
  const today = relists.length;
  const thisHour = countWithin(relists, HOUR_WINDOW_MS);

  const owed = cooldown && today
    ? Math.max(0, HARD_COOLDOWN_MS - (Date.now() - Math.max(...relists)))
    : 0;
  const wait = owed > 0 ? ` The next one waits ${Math.ceil(owed / 1000)}s.` : '';

  if (!today) {
    document.getElementById('volume-title').textContent = 'Nothing relisted today';
    detail.textContent =
      `Bumpline counts your relists and asks you to confirm past ` +
      `${HOUR_ALARM_AT} in an hour or ${DAY_ALARM_AT} in a day.`;
    return;
  }

  document.getElementById('volume-title').textContent =
    `${thisHour} this hour, ${today} today`;

  if (today >= DAY_ALARM_AT) {
    card.classList.add('card--alert');
    detail.textContent =
      'A whole wardrobe going round in a day is a bulk operation from where ' +
      'Vinted is standing, and it answers those by blocking edits and new ' +
      'listings on the account for about a day. The next relist will ask you ' +
      'to confirm before it starts.' + wait;
    return;
  }

  if (thisHour >= HOUR_ALARM_AT) {
    card.classList.add('card--alert');
    detail.textContent =
      'That is the volume Vinted reads as automated activity, and it answers ' +
      'it by blocking edits and new listings on the account for about a day. ' +
      'The next relist will ask you to confirm before it starts.' + wait;
    return;
  }

  detail.textContent =
    `The warning appears at ${HOUR_ALARM_AT} in an hour or ${DAY_ALARM_AT} in ` +
    `a day.` + wait;
}

// --- settings ---------------------------------------------------------------

// One gate at a time. Opening a second warning answers the first as a no, so a
// warning left on screen can never commit a change once it is out of sight.
let closeGate = null;

function askRisk({ title, detail, accept }) {
  if (closeGate) closeGate(false);

  const card = document.getElementById('risk');
  const yes = document.getElementById('risk-accept');
  const no = document.getElementById('risk-cancel');

  document.getElementById('risk-title').textContent = title;
  document.getElementById('risk-detail').textContent = detail;
  yes.textContent = accept;
  card.hidden = false;

  return new Promise(resolve => {
    const finish = agreed => {
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
      card.hidden = true;
      closeGate = null;
      resolve(agreed);
    };
    const onYes = () => finish(true);
    const onNo = () => finish(false);

    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
    closeGate = finish;
    // The warning is worth nothing if it scrolls in below the fold.
    card.scrollIntoView({ block: 'nearest' });
    no.focus();
  });
}

// Writes the value and keeps the checkbox honest: if the write fails the box
// goes back where it was rather than showing a setting that is not stored.
async function commit(box, key, value) {
  try {
    await ext.storage.local.set({ [key]: value });
  } catch (_) {
    box.checked = !box.checked;
  }
}

// A plain setting: the box is the setting.
function wireToggle(id, key, on, valueOf = checked => checked) {
  const box = document.getElementById(id);
  box.checked = on;
  box.addEventListener('change', () => commit(box, key, valueOf(box.checked)));
}

// A guarded setting is one whose risky position raises the odds of the account
// being blocked. The box springs back the instant it is clicked and only the
// second, deliberate click in the warning commits it — so the warning cannot be
// got past by ignoring it, and cancelling leaves the setting untouched.
function wireGuarded(id, key, on, risky, warning, valueOf = checked => checked) {
  const box = document.getElementById(id);
  box.checked = on;
  box.addEventListener('change', () => {
    const wanted = box.checked;
    if (wanted !== risky) {
      commit(box, key, valueOf(wanted));
      return;
    }
    box.checked = !risky;
    askRisk(warning).then(agreed => {
      if (!agreed) return;
      box.checked = risky;
      commit(box, key, valueOf(risky));
    });
  });
}

function wireSettings(stored) {
  // The page reads this fresh on every relist, so writing it here is all the
  // wiring the setting needs. The same is true of the three below it.
  wireToggle('reload-toggle', RELOAD_KEY, stored.reload);

  wireToggle('local-drafts-toggle', LOCAL_DRAFTS_KEY, stored.localDrafts);

  wireGuarded('cooldown-toggle', HARD_COOLDOWN_KEY, stored.cooldown, false, {
    title: 'Turning off the only hard stop',
    detail:
      'The ten seconds between relists exist because back-to-back deletions ' +
      'and re-publishes are the pattern Vinted matches on. Without them a run ' +
      'of relists goes out as fast as the network allows, and a temporary ' +
      'block on editing and publishing — usually 24 hours — is the likely ' +
      'result. You can turn it back on at any time.',
    accept: 'Turn the cooldown off',
  });

  wireGuarded('fast-toggle', PACE_KEY, stored.fast, true, {
    title: 'Faster means riskier',
    detail:
      'The random pause between each request is what keeps a relist from ' +
      'arriving as one burst of API calls. Shortening it makes every relist ' +
      'quicker and makes the traffic look far more like a script, which is ' +
      'what Vinted blocks accounts for. Leave it off unless you are relisting ' +
      'a single item and in a hurry.',
    accept: 'Relist faster anyway',
  }, checked => (checked ? 'fast' : 'safe'));
}

async function main() {
  // version_name is what a hand-built debug package sets; without one this is
  // the plain version, exactly as before.
  const build = ext.runtime.getManifest();
  document.getElementById('version').textContent = `v${build.version_name || build.version}`;

  let tab = null;
  try {
    [tab] = await ext.tabs.query({ active: true, currentWindow: true });
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
  renderPause(stored);
  renderVolume(stored);
  wireSettings(stored);

  const action = chooseAction(stored, page, here);
  if (action) {
    const button = document.getElementById('action');
    button.textContent = action.label;
    button.hidden = false;
    button.addEventListener('click', () => {
      ext.tabs.create({ url: action.url });
      window.close();
    });
  }
}

main();
