// Bumpline — toolbar popup.
//
// Installed from the store the extension is otherwise invisible: it works only
// inside a Vinted profile page, so a new user sees nothing anywhere and assumes
// it is broken. The popup answers four questions and refuses to grow past them
// — "is it on?", "does it work on this tab?", "did a relist get stuck?" and
// "how much have I relisted lately?" — and always offers the one action that
// follows from the answer.

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
const ENABLED_KEY = 'bumpline:enabled';

// These have to agree with content.js, which is the side that enforces them.
// The popup only reports, sets, and — for the pause — lifts.
const HOUR_WINDOW_MS = 60 * 60 * 1000;
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOUR_ALARM_AT = 4;
const DAY_ALARM_AT = 15;
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

// --- the review link ------------------------------------------------------

// Which store this copy came from, and whether that store has a listing to
// point at, is worked out in store.js — the page shown after install asks the
// same question, and a store id kept in two files is one that will one day be
// corrected in only one of them.

// An anchor rather than a click handler: the browser closes the popup itself
// when it opens the tab, and a real href can be middle-clicked and copied.
function wireReview() {
  const link = document.getElementById('review');
  const url = BumplineStore.reviewUrl();
  // Nowhere to send anyone is said by not asking, rather than by asking and
  // landing them on a 404.
  link.hidden = !url;
  if (url) link.href = url;
}

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
      detail: 'Relist buttons appear on your own items that are still on sale.',
    };
  }
  if (onVinted(url)) {
    return {
      tone: 'plain',
      glyph: GLYPH.elsewhere,
      title: 'Not a profile page',
      detail: 'Relist buttons only appear on your own wardrobe.',
    };
  }
  return {
    tone: 'plain',
    glyph: GLYPH.elsewhere,
    title: 'Not on Vinted',
    detail: 'Open your Vinted wardrobe to relist an item.',
  };
}

// Anything that moves asks this first. The stylesheet answers the same question
// for its own transitions; these are the ones script drives, and a query object
// is live, so a setting changed while the panel is open is honoured.
const STILL = matchMedia('(prefers-reduced-motion: reduce)');

// The duration and curve every opening in the panel uses, which is base-luma's
// accordion.
const OPEN_MS = 200;
const OPEN_EASE = 'ease-out';

// Covers the distance between two measured sizes and then gets out of the way:
// the element keeps its own CSS at both ends, so nothing is left holding an
// inline height that the next reflow would have to fight.
function grow(el, prop, from, to) {
  if (STILL.matches) return null;
  return el.animate({ [prop]: [`${from}px`, `${to}px`] },
                    { duration: OPEN_MS, easing: OPEN_EASE });
}

// <details> has no animation of its own: the browser shows and hides the body
// outright. The click is taken over so the body can be grown and shrunk
// instead, and the open attribute is set at the moment each direction becomes
// true — at the start of an opening, at the end of a closing.
function wireDrawer() {
  const drawer = document.querySelector('.drawer');
  const summary = drawer.querySelector('.drawer__summary');
  const body = drawer.querySelector('.drawer__body');
  let running = null;

  summary.addEventListener('click', event => {
    if (STILL.matches) return;
    event.preventDefault();

    // A second click during a close is a reopening, even though the attribute
    // has not come off yet. Both heights are read before the running animation
    // is cancelled, because cancelling snaps the box back to its CSS size.
    const opening = !drawer.open || drawer.classList.contains('drawer--closing');
    const from = drawer.open ? body.offsetHeight : 0;
    if (running) running.cancel();
    drawer.open = true;
    drawer.classList.toggle('drawer--closing', !opening);

    const mine = grow(body, 'height', from, opening ? body.scrollHeight : 0);
    running = mine;
    // finished rather than onfinish, and the second arm is the cancel: a click
    // that interrupts this one owns the drawer from then on, so the interrupted
    // animation must not close anything on its way out.
    mine.finished.then(() => {
      if (running !== mine) return;
      running = null;
      drawer.classList.remove('drawer--closing');
      if (!opening) drawer.open = false;
    }, () => {});
  });
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

// Said in the page and in this panel both, so the two cannot disagree about
// what a restricted account can do.
const RESTRICTION_NOTE =
  'The message Vinted sent you says why. You cannot relist until Vinted ' +
  'lifts the restriction. Vinted can lift one earlier than the date it ' +
  'published: the next wardrobe page you open will notice, or you can clear ' +
  'this here and let that page decide afresh.';

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
    // Stored as a pace rather than a flag, and read here as the switch reads
    // in the panel: on is the pause, off is the fast lane.
    paced: bag[PACE_KEY] !== 'fast',
    // Absent means on here too: an extension that has never been switched off
    // has never written the key.
    enabled: bag[ENABLED_KEY] !== false,
    relists: recentRelists(bag[RELIST_LOG_KEY]),
    paused: standingPause(bag[BLOCK_KEY]),
  };
}

const nameOf = record =>
  (record.snapshot && record.snapshot.title) || `Item ${record.itemId || '?'}`;

// Records written before 1.0.0 carry no profileUrl; the country domain is the
// best guess left, and it at least lands on the right site.
const profileOf = record => record.profileUrl || record.site || null;

function renderPending(records, enabled) {
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
    (enabled
      ? 'Bumpline retries these each time you open a Vinted profile page. '
      : 'Bumpline is off, so nothing is being retried. ') +
    (onVintedToo
      ? 'The copy is also in your Vinted drafts.'
      : 'The copy is saved on this device.');

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

  // The title already names the restriction, and when it lifts is Vinted's to
  // say, not this extension's to guess at: the message Vinted sent the account
  // is the only place either the reason or the end of it actually exists.
  const detail = document.getElementById('paused-detail');
  detail.textContent = fromVinted
    ? RESTRICTION_NOTE
    : `${stored.paused.why} Nothing is sent until ` +
      `${whenOf(stored.paused.until)}, on any tab. The buttons come back on ` +
      'their own.';

  // Folded to two lines, because the title has already said the thing that
  // matters and the rest is where to go looking. The pause the extension sets
  // itself is short enough to stay open.
  const reveal = document.getElementById('paused-reveal');
  detail.classList.toggle('card__note--clamped', fromVinted);
  reveal.hidden = !fromVinted;
  // The folded height belongs to the stylesheet. Read here, while the fold is
  // still on, rather than repeated in two places that could drift apart.
  const shut = parseFloat(getComputedStyle(detail).maxHeight) || 0;
  // Folded, the text is its own button; open, it goes back to being text so it
  // can be selected and read.
  detail.onclick = () => {
    if (detail.classList.contains('card__note--clamped')) reveal.click();
  };

  reveal.onclick = () => {
    // Both ends are measured before the class moves: open, the paragraph is as
    // tall as it is; folded, scrollHeight is still the whole of it.
    const from = detail.offsetHeight;
    const full = detail.scrollHeight;
    const folded = detail.classList.toggle('card__note--clamped');
    // The chevron turns over on its own; the name is for anyone who cannot see
    // it turn.
    reveal.setAttribute('aria-expanded', String(!folded));
    reveal.setAttribute('aria-label', folded ? 'Show more' : 'Show less');
    // max-height rather than height, because that is the property the fold is
    // made of: the animation covers the distance and the class holds the end.
    grow(detail, 'maxHeight', from, folded ? shut : full);
  };

  // One button, two meanings, because the two pauses are cleared for opposite
  // reasons. The extension's own is overridden — it is still standing and the
  // seller is choosing to ignore it, which is what the warning is for. Vinted's
  // is only ever mirrored here, so clearing it overrides nothing: the next
  // wardrobe page reads the account again and writes the restriction straight
  // back if it is still in force. That is the only way out of a restriction
  // Vinted lifted early, and without it the record stood until a date that had
  // stopped meaning anything.
  lift.textContent = fromVinted ? 'Vinted has lifted it' : 'Lift the pause early';
  lift.hidden = false;
  card.hidden = false;

  lift.addEventListener('click', async () => {
    if (!fromVinted) {
      const agreed = await askRisk({
        title: 'Vinted asked for this pause',
        detail:
          'The pause is there because Vinted refused a request, and being ' +
          'refused again is what turns a rate limit into a block on the ' +
          'account. Lift it only if you are sure the refusal was something ' +
          'else, like a logged-out session or a one-off network failure.',
        accept: 'Lift it anyway',
        cancel: 'Keep the pause',
      });
      if (!agreed) return;
    }
    try {
      await ext.storage.local.remove(BLOCK_KEY);
      card.hidden = true;
    } catch (_) {
      // The card stays up, which is the honest outcome: nothing was cleared.
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

  document.getElementById('volume-hour').textContent = String(thisHour);
  document.getElementById('volume-day').textContent = String(today);

  // Two budgets run at once, and the bar draws whichever is nearer its warning:
  // that is the one that will stop the next relist. The sentence under it says
  // where the warning sits, because a bar on its own is not a number.
  const share = Math.max(thisHour / HOUR_ALARM_AT, today / DAY_ALARM_AT);
  document.getElementById('volume-fill').style.width =
    `${Math.min(100, Math.round(share * 100))}%`;

  const owed = cooldown && today
    ? Math.max(0, HARD_COOLDOWN_MS - (Date.now() - Math.max(...relists)))
    : 0;
  const wait = owed > 0 ? ` The next one waits ${Math.ceil(owed / 1000)}s.` : '';

  // Nothing relisted is nothing to say. The two noughts and an empty bar are
  // the whole answer, and a sentence about limits nobody is near was being read
  // every time the panel opened.
  if (!today) {
    detail.textContent = '';
    return;
  }

  if (today >= DAY_ALARM_AT) {
    card.classList.add('card--alert');
    detail.textContent =
      'A whole wardrobe in a day looks like a bulk operation from where ' +
      'Vinted is standing, and Vinted answers those with a day-long block ' +
      'on editing and publishing, or a longer restriction. The next relist ' +
      'will ask you to confirm.' + wait;
    return;
  }

  if (thisHour >= HOUR_ALARM_AT) {
    card.classList.add('card--alert');
    detail.textContent =
      'That is the volume Vinted reads as automated activity, and Vinted ' +
      'answers it with a day-long block on editing and publishing, or a ' +
      'longer restriction. The next relist will ask you to confirm.' + wait;
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

// The cancel names what staying put means, so it changes with the question:
// keeping a setting is not the same act as keeping a pause Vinted asked for.
function askRisk({ title, detail, accept, cancel = 'Keep this setting' }) {
  if (closeGate) closeGate(false);

  const modal = document.getElementById('risk');
  const yes = document.getElementById('risk-accept');
  const no = document.getElementById('risk-cancel');

  document.getElementById('risk-title').textContent = title;
  document.getElementById('risk-detail').textContent = detail;
  yes.textContent = accept;
  no.textContent = cancel;

  return new Promise(resolve => {
    const finish = agreed => {
      // Taken off before the dialog is closed, because closing fires the very
      // event this is reached from and the listener would call it again.
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
      modal.removeEventListener('close', onClose);
      if (modal.open) modal.close();
      closeGate = null;
      resolve(agreed);
    };
    const onYes = () => finish(true);
    const onNo = () => finish(false);
    // Escape closes a modal dialog without either button being pressed. That is
    // a no, and it has to be answered as one or the setting waits forever.
    const onClose = () => finish(false);

    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
    modal.addEventListener('close', onClose);
    closeGate = finish;
    // showModal throws on a dialog that is already open; the gate closed above
    // makes that impossible, and the guard says so.
    if (!modal.open) modal.showModal();
    // The safe answer takes the focus, so Enter on a warning nobody read keeps
    // the setting where it was.
    no.focus();
  });
}

// What each setting reads as when nobody has touched it. The popup says how
// many are off their default without being opened, because every switch sitting
// where it was left is the common case and should not need reading.
//
// localDrafts is absent on purpose: its row is hidden, and a count that points
// at a switch nobody can find is worse than no count.
const SETTING_DEFAULTS = {
  reload: true,
  cooldown: true,
  paced: true,
};

// Writes the value and keeps the checkbox honest: if the write fails the box
// goes back where it was rather than showing a setting that is not stored.
async function commit(box, key, value) {
  try {
    await ext.storage.local.set({ [key]: value });
  } catch (_) {
    box.checked = !box.checked;
  }
}

// A plain setting: the box is the setting. `after` is handed the value that
// actually survived the write, which is not the clicked one if it failed.
function wireToggle(id, key, on, after, valueOf = checked => checked) {
  const box = document.getElementById(id);
  box.checked = on;
  box.addEventListener('change', async () => {
    await commit(box, key, valueOf(box.checked));
    after(box.checked);
  });
}

// A guarded setting is one whose risky position raises the odds of the account
// being blocked. The box springs back the instant it is clicked and only the
// second, deliberate click in the warning commits it — so the warning cannot be
// got past by ignoring it, and cancelling leaves the setting untouched.
function wireGuarded(id, key, on, risky, warning, after, valueOf = checked => checked) {
  const box = document.getElementById(id);
  box.checked = on;
  box.addEventListener('change', async () => {
    const wanted = box.checked;
    if (wanted !== risky) {
      await commit(box, key, valueOf(wanted));
      after(box.checked);
      return;
    }
    box.checked = !risky;
    const agreed = await askRisk(warning);
    if (!agreed) return;
    box.checked = risky;
    await commit(box, key, valueOf(risky));
    after(box.checked);
  });
}

function wireSettings(stored) {
  const count = document.getElementById('settings-count');
  const paint = () => {
    const changed = Object.keys(SETTING_DEFAULTS)
      .filter(name => stored[name] !== SETTING_DEFAULTS[name]).length;
    count.textContent = changed ? `${changed} changed` : '';
  };
  const note = name => value => {
    stored[name] = value;
    paint();
  };
  paint();

  // The page reads this fresh on every relist, so writing it here is all the
  // wiring the setting needs. The same is true of the three below it.
  wireToggle('reload-toggle', RELOAD_KEY, stored.reload, note('reload'));

  wireToggle('local-drafts-toggle', LOCAL_DRAFTS_KEY, stored.localDrafts, note('localDrafts'));

  wireGuarded('cooldown-toggle', HARD_COOLDOWN_KEY, stored.cooldown, false, {
    title: 'This is the only hard stop',
    detail:
      'Deleting and re-publishing back to back is the pattern Vinted matches ' +
      'on. Without the ten seconds, a run of relists goes out as fast as the ' +
      'network allows. A 24-hour block on editing and publishing is the ' +
      'mildest answer to that, and Vinted can restrict the account for ' +
      'longer.',
    accept: 'Turn it off',
    cancel: 'Keep the cooldown',
  }, note('cooldown'));

  wireGuarded('pace-toggle', PACE_KEY, stored.paced, false, {
    title: 'This keeps a relist from arriving as one burst',
    detail:
      'The random 0.9 to 2.4 seconds between requests spread a relist out ' +
      'over its twenty or so API calls. At 0.25 to 0.7 seconds the traffic ' +
      'looks far more like a script, and that is what Vinted blocks accounts ' +
      'for.',
    accept: 'Shorten it',
    cancel: 'Keep the pause',
  }, note('paced'), checked => (checked ? 'safe' : 'fast'));
}

// The master switch. Off is the safe direction — nothing is sent to Vinted
// while it is off — so it passes no warning, and on puts the pages back exactly
// as they were.
function wirePower(stored, tab, repaint, notePage) {
  const box = document.getElementById('power');
  const word = document.getElementById('power-state');

  const paint = () => {
    box.checked = stored.enabled;
    word.textContent = stored.enabled ? 'On' : 'Off';
  };
  paint();

  box.addEventListener('change', async () => {
    const wanted = box.checked;
    // Switching off hides the whole panel, an open warning with it. A warning
    // that leaves the screen unanswered would otherwise still be holding a
    // promise, and its setting would commit on a click of a button nobody can
    // see any more. Answered here, as a no: the setting stays where it was.
    if (!wanted && closeGate) closeGate(false);
    try {
      await ext.storage.local.set({ [ENABLED_KEY]: wanted });
    } catch (_) {
      // Nothing was stored, so nothing changed on any page either.
      box.checked = !wanted;
      return;
    }
    stored.enabled = wanted;
    paint();
    // Every open tab draws or drops its buttons the moment the value lands, and
    // the count held here is the one from before that. Ask the page again once
    // it has had its turn, or this panel contradicts what is on screen.
    if (wanted) {
      await new Promise(done => setTimeout(done, 150));
      const fresh = await askPage(tab);
      if (fresh) notePage(fresh);
    }
    repaint();
  });
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
  const [initial, stored] = await Promise.all([askPage(tab), readStored()]);
  const here = url ? `${url.origin}${url.pathname}` : null;

  // What the page holds is asked for again when the switch is thrown, so it
  // cannot be a constant.
  let page = initial;

  const status = document.getElementById('status');
  const button = document.getElementById('action');

  // Everything the switch changes the answer to, in one place, so that throwing
  // it never leaves half the panel describing the other state.
  const paintTab = () => {
    const state = describePage(page, url);
    draw(document.getElementById('status-icon'), state.glyph);
    document.getElementById('status-title').textContent = state.title;
    document.getElementById('status-detail').textContent = state.detail;
    status.classList.toggle('card--ok', state.tone === 'ok');

    // Switched off, the panel is one line and the logo goes grey with the
    // toolbar icon the background worker is repainting at the same moment. The
    // class does the hiding, so nothing below has to know about the switch.
    document.body.classList.toggle('is-off', !stored.enabled);
    document.getElementById('offline').hidden = stored.enabled;

    // Paused, "Ready on this page" is a lie — the buttons are there and greyed
    // out — and the card above has already said why.
    status.hidden = !!stored.paused;

    renderPending(stored.pending, stored.enabled);

    // Switched off, an offer to open a wardrobe leads to a page with no buttons
    // on it, which is worse than no offer at all.
    const action = stored.enabled ? chooseAction(stored, page, here) : null;
    button.hidden = !action;
    if (action) {
      button.textContent = action.label;
      button.onclick = () => {
        ext.tabs.create({ url: action.url });
        window.close();
      };
    }
  };

  wirePower(stored, tab, paintTab, fresh => { page = fresh; });
  paintTab();
  renderPause(stored);
  renderVolume(stored);
  wireSettings(stored);
  wireDrawer();
  wireReview();
}

main();
